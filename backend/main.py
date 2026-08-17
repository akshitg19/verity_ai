import base64
import binascii
import hmac
import json
import logging
import os
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from answer_vault import VaultConstructionError, build_vault, build_math_vault
from chem_model import ReactionJudge
from hints import generate_hint
from identity_auth import (
    GoogleIdentitySettings,
    IdentityNotAllowed,
    IdentityProviderUnavailable,
    IdentityTokenInvalid,
    verify_bearer_token,
)
from judge import BalanceJudge, ChemistryJudge, FunctionalGroupJudge, MathJudgeDispatcher
from judge.chemistry import (
    ChemistryParseError,
    FormulaStructureJudge,
    IsomerJudge,
    UnsupportedChemistryError,
    is_generic,
    molecular_formula,
    render_svg,
    _parse_smiles,
)
from judge.naming import (
    NameParseError,
    NamingJudge,
    OpsinUnavailableError,
    structure_from_text,
)
from judge.net_ionic import NetIonicJudge
from judge.redox import (
    CellPotentialJudge,
    CellPotentialProblem,
    OxidationStateJudge,
    OxidationStateProblem,
)
from judge.solutions import SolutionsJudge, SolutionsProblem
from judge.stoichiometry import StoichiometryJudge, StoichiometryProblem
from schemas import (
    BalanceCheckRequest,
    BalanceCheckResponse,
    CaptureRequest,
    CaptureResponse,
    CellPotentialRequest,
    CheckRequest,
    CheckResponse,
    ChemistryCheckRequest,
    ChemistryCheckResponse,
    ChemistryLineVerdict,
    ChemistrySessionRequest,
    ChemistrySessionResponse,
    FormulaStructureRequest,
    FunctionalGroupCheckRequest,
    HintRequest,
    HintResponse,
    IsomerRequest,
    NamingRequest,
    NetIonicRequest,
    OxidationStateRequest,
    ReactionRequest,
    SolutionsRequest,
    StoichiometryRequest,
    StructureRenderRequest,
    StructureRenderResponse,
    StructureTranscribeRequest,
    StructureTranscribeResponse,
    TranscribeRequest,
    TranscribeResponse,
    MathSessionRequest,
    MathSessionResponse,
    MyScriptRecognizeRequest,
    MyScriptRecognizeResponse,
)
from myscript_recognition import MyScriptRecognitionError, get_myscript_recognizer
from sessions import SESSIONS
from structure_recognition import transcribe_chemistry_line, transcribe_structure
from transcription import (
    TranscriptionInputError,
    TranscriptionServiceError,
    transcribe_line,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="verity.ai API")

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")

# Vercel gives every single deployment its own hostname: the production alias
# verity-ai-lovat.vercel.app, a branch alias per branch, and a fresh
# verity-ai-<hash>-<scope>.vercel.app for every push. Listing origins by name
# therefore allows exactly one of them and blocks the rest, which is not a
# safety property, just a hostname that has drifted: opening any deployment
# from the Vercel dashboard failed CORS preflight and the browser reported the
# only thing it is allowed to report, "Failed to fetch". The page loaded,
# because that is static hosting, and every button that talked to this API
# died.
#
# The regex is anchored by Starlette with fullmatch, and it is scoped to this
# project's own name on vercel.app rather than opening the API to the web.
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"https://verity-ai[a-z0-9-]*\.vercel\.app",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS if origin.strip()],
    allow_origin_regex=CORS_ORIGIN_REGEX or None,
    allow_methods=["*"],
    allow_headers=["*"],
)
math_judge = MathJudgeDispatcher()
chemistry_judge = ChemistryJudge()
functional_group_judge = FunctionalGroupJudge()
balance_judge = BalanceJudge()
net_ionic_judge = NetIonicJudge()
stoichiometry_judge = StoichiometryJudge()
solutions_judge = SolutionsJudge()
oxidation_state_judge = OxidationStateJudge()
cell_potential_judge = CellPotentialJudge()
reaction_judge = ReactionJudge()
formula_structure_judge = FormulaStructureJudge()

# The routing table from final_tasks.md, served rather than duplicated in
# the frontend. Each topic names the engine that decides correctness and the
# endpoints that reach it, so the UI cannot drift out of step with what the
# backend actually ships -- which is exactly how two finished chemistry
# judges ended up unreachable in the first place.
CHEMISTRY_TOPICS = [
    {
        "topic": "stoichiometry",
        "label": "Formulas, moles & stoichiometry",
        "engine": "deterministic",
        "input": "numeric",
        "endpoints": ["/chemistry/stoichiometry"],
    },
    {
        "topic": "balancing",
        "label": "Equations & balancing",
        "engine": "deterministic",
        "input": "equation",
        "endpoints": ["/chemistry/balance", "/chemistry/net-ionic"],
    },
    {
        "topic": "redox",
        "label": "Redox & electrochemistry",
        "engine": "deterministic",
        "input": "mixed",
        "endpoints": [
            "/chemistry/balance",
            "/chemistry/oxidation-state",
            "/chemistry/cell-potential",
        ],
    },
    {
        "topic": "solutions",
        "label": "Solutions, acids & bases",
        "engine": "deterministic",
        "input": "numeric",
        "endpoints": ["/chemistry/solutions"],
    },
    {
        "topic": "structure",
        "label": "Molecular structure & bonding",
        "engine": "deterministic",
        "input": "drawing",
        "endpoints": [
            "/chemistry/check",
            "/chemistry/isomer",
            "/chemistry/formula-structure",
        ],
    },
    {
        "topic": "organic",
        "label": "Organic: groups, naming & reactions",
        "engine": "mixed",
        "input": "drawing",
        "endpoints": [
            "/chemistry/functional-group",
            "/chemistry/name",
            "/chemistry/reaction",
        ],
    },
]


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/chemistry/topics")
def chemistry_topics():
    """What chemistry can actually be asked, and which engine answers it."""
    return {"topics": CHEMISTRY_TOPICS}


@app.post("/check", response_model=CheckResponse)
def check_steps(req: CheckRequest):
    verdicts = math_judge.check(req.topic, req.problem, req.steps)
    if verdicts and verdicts[0].line_number == 0:
        return CheckResponse(
            verdicts=[],
            first_wrong_line=None,
            problem_error=verdicts[0].error_type,
        )
    first_wrong = next(
        (v.line_number for v in verdicts if v.status == "invalid"),
        None,
    )
    return CheckResponse(verdicts=verdicts, first_wrong_line=first_wrong)


@app.post("/chemistry/check", response_model=ChemistryCheckResponse)
def check_chemistry_steps(req: ChemistryCheckRequest):
    verdicts = chemistry_judge.check(req.target_smiles, req.steps)
    if verdicts and verdicts[0].line_number == 0:
        return ChemistryCheckResponse(
            verdicts=[],
            first_wrong_line=None,
            problem_error=verdicts[0].error_type,
        )
    first_wrong = next(
        (verdict.line_number for verdict in verdicts if verdict.status == "invalid"),
        None,
    )
    return ChemistryCheckResponse(
        verdicts=verdicts,
        first_wrong_line=first_wrong,
    )


@app.post("/chemistry/functional-group", response_model=ChemistryCheckResponse)
def check_functional_group_steps(req: FunctionalGroupCheckRequest):
    try:
        verdicts = functional_group_judge.check(req.target_group, req.steps)
    except ValueError as exc:
        # An unrecognised group name is a caller mistake, not a student one.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if verdicts and verdicts[0].line_number == 0:
        return ChemistryCheckResponse(
            verdicts=[],
            first_wrong_line=None,
            problem_error=verdicts[0].error_type,
        )
    first_wrong = next(
        (verdict.line_number for verdict in verdicts if verdict.status == "invalid"),
        None,
    )
    return ChemistryCheckResponse(
        verdicts=verdicts,
        first_wrong_line=first_wrong,
    )


@app.post("/chemistry/balance", response_model=BalanceCheckResponse)
def check_balance_steps(req: BalanceCheckRequest):
    verdicts = balance_judge.check(req.reference_equation, req.steps)
    if verdicts and verdicts[0].line_number == 0:
        return BalanceCheckResponse(
            verdicts=[],
            first_wrong_line=None,
            problem_error=verdicts[0].error_type,
        )
    first_wrong = next(
        (verdict.line_number for verdict in verdicts if verdict.status == "invalid"),
        None,
    )
    return BalanceCheckResponse(
        verdicts=verdicts,
        first_wrong_line=first_wrong,
    )


def _chemistry_response(verdicts) -> ChemistryCheckResponse:
    """Shared shaping: line 0 means the problem was bad, not the student."""
    if verdicts and verdicts[0].line_number == 0:
        return ChemistryCheckResponse(
            verdicts=[],
            first_wrong_line=None,
            problem_error=(
                verdicts[0].error_type
                if verdicts[0].error_type in ("parse_error", "unsupported")
                else "unsupported"
            ),
        )
    first_wrong = next(
        (verdict.line_number for verdict in verdicts if verdict.status == "invalid"),
        None,
    )
    return ChemistryCheckResponse(verdicts=verdicts, first_wrong_line=first_wrong)


def _balance_response(verdicts) -> BalanceCheckResponse:
    if verdicts and verdicts[0].line_number == 0:
        return BalanceCheckResponse(
            verdicts=[],
            first_wrong_line=None,
            problem_error=(
                verdicts[0].error_type
                if verdicts[0].error_type in ("parse_error", "unsupported")
                else "unsupported"
            ),
        )
    first_wrong = next(
        (verdict.line_number for verdict in verdicts if verdict.status == "invalid"),
        None,
    )
    return BalanceCheckResponse(verdicts=verdicts, first_wrong_line=first_wrong)


@app.post("/chemistry/net-ionic", response_model=BalanceCheckResponse)
def check_net_ionic_steps(req: NetIonicRequest):
    return _balance_response(
        net_ionic_judge.check(req.molecular_equation, req.steps)
    )


@app.post("/chemistry/stoichiometry", response_model=ChemistryCheckResponse)
def check_stoichiometry_steps(req: StoichiometryRequest):
    problem = StoichiometryProblem(
        task=req.task,
        formula=req.formula,
        element=req.element,
        mass_g=req.mass_g,
        moles=req.moles,
        particles=req.particles,
        equation=req.equation,
        amounts=dict(req.amounts),
        amounts_in_moles=req.amounts_in_moles,
        product=req.product,
        actual_yield_g=req.actual_yield_g,
        composition=dict(req.composition),
        target_molar_mass=req.target_molar_mass,
    )
    return _chemistry_response(
        stoichiometry_judge.check(
            problem, req.steps, answers_only=req.answers_only
        )
    )


@app.post("/chemistry/solutions", response_model=ChemistryCheckResponse)
def check_solutions_steps(req: SolutionsRequest):
    problem = SolutionsProblem(
        **req.model_dump(exclude={"steps", "answers_only"})
    )
    return _chemistry_response(
        solutions_judge.check(problem, req.steps, answers_only=req.answers_only)
    )


@app.post("/chemistry/oxidation-state", response_model=ChemistryCheckResponse)
def check_oxidation_state_steps(req: OxidationStateRequest):
    problem = OxidationStateProblem(formula=req.formula, element=req.element)
    return _chemistry_response(oxidation_state_judge.check(problem, req.steps))


@app.post("/chemistry/cell-potential", response_model=ChemistryCheckResponse)
def check_cell_potential_steps(req: CellPotentialRequest):
    problem = CellPotentialProblem(cathode=req.cathode, anode=req.anode)
    return _chemistry_response(cell_potential_judge.check(problem, req.steps))


@app.post("/chemistry/formula-structure", response_model=ChemistryCheckResponse)
def check_formula_structure_steps(req: FormulaStructureRequest):
    """Draw any structure with this formula.

    Looser than /chemistry/check on purpose: a molecular formula does not
    determine a structure, so every isomer of it is a correct answer to the
    question that was actually asked.
    """
    return _chemistry_response(
        formula_structure_judge.check(req.target_formula, req.steps)
    )


def _reference_structure(text: str) -> str | ChemistryCheckResponse:
    """The reference molecule of a question, written as a name or a SMILES.

    A student setting their own question writes "ethanol". Failing to read it
    is our limitation and must be reported as one: an `unsupported` or a
    `parse_error` on line 0, which the UI renders as a problem with the
    question rather than as a mistake in the student's drawing.
    """
    try:
        return structure_from_text(text)
    except OpsinUnavailableError as exc:
        return _chemistry_response([
            ChemistryLineVerdict(
                line_number=0,
                valid=False,
                error_type="unsupported",
                detail=str(exc),
                judged_by="deterministic",
            )
        ])
    except NameParseError as exc:
        return _chemistry_response([
            ChemistryLineVerdict(
                line_number=0,
                valid=False,
                error_type="parse_error",
                detail=f"Could not read the molecule in the question: {exc}",
                judged_by="deterministic",
            )
        ])


@app.post("/chemistry/isomer", response_model=ChemistryCheckResponse)
def check_isomer_steps(req: IsomerRequest):
    reference = _reference_structure(req.reference_smiles)
    if isinstance(reference, ChemistryCheckResponse):
        return reference
    return _chemistry_response(
        IsomerJudge(req.isomer_type).check(reference, req.steps)
    )


@app.post("/chemistry/name", response_model=ChemistryCheckResponse)
def check_naming_steps(req: NamingRequest):
    return _chemistry_response(
        NamingJudge(req.target_name).check(req.target_smiles, req.steps)
    )


@app.post("/chemistry/reaction", response_model=ChemistryCheckResponse)
def check_reaction_steps(req: ReactionRequest):
    """The one chemistry path where a model may hold the deciding vote.

    Every verdict carries `judged_by`, so a model judgement can never be
    presented in the UI as a proven one.
    """
    reactants = []
    for written in req.reactants_smiles:
        resolved = _reference_structure(written)
        if isinstance(resolved, ChemistryCheckResponse):
            return resolved
        reactants.append(resolved)
    problem = {
        "reactants_smiles": reactants,
        "reagent": req.reagent,
        "reaction_type": req.reaction_type,
    }
    return _chemistry_response(reaction_judge.check(problem, req.steps))


@app.post("/chemistry/render", response_model=StructureRenderResponse)
def render_structure(req: StructureRenderRequest):
    """Draw a SMILES back as a picture.

    Only ever the student's own structure. A student cannot verify
    `O=C(*)O*` and can verify a drawing instantly, which is why this exists;
    rendering a *target* would hand over the answer, so no endpoint does it.
    """
    try:
        svg = render_svg(req.smiles)
        molecule = _parse_smiles(req.smiles)
        return StructureRenderResponse(
            svg=svg,
            formula=molecular_formula(req.smiles),
            generic=is_generic(molecule),
        )
    except UnsupportedChemistryError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ChemistryParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/chemistry/session", response_model=ChemistrySessionResponse)
def open_chemistry_session(req: ChemistrySessionRequest):
    """Solve the problem once, server-side, and hold the answer here.

    The response carries an opaque id and the remaining level-3 budget. It
    carries no part of the vault, and `ChemistrySessionResponse` has no
    field that could hold one.
    """
    stoichiometry = None
    if req.stoichiometry is not None:
        # `answers_only` is a judging mode, not part of the problem, so it is
        # dropped here rather than handed to a dataclass that has no field
        # for it.
        stoichiometry = StoichiometryProblem(
            **req.stoichiometry.model_dump(exclude={"steps", "answers_only"})
        )
    solutions = None
    if req.solutions is not None:
        solutions = SolutionsProblem(
            **req.solutions.model_dump(exclude={"steps", "answers_only"})
        )

    try:
        vault = build_vault(
            molecular_equation=req.molecular_equation,
            oxidation_formula=req.oxidation_formula,
            oxidation_element=req.oxidation_element,
            cathode=req.cathode,
            anode=req.anode,
            target_formula=req.target_formula,
            topic=req.topic,
            problem=req.problem,
            target_smiles=req.target_smiles,
            target_name=req.target_name,
            target_group=req.target_group,
            reference_equation=req.reference_equation,
            stoichiometry=stoichiometry,
            solutions=solutions,
        )
    except VaultConstructionError as exc:
        # No vault means no redaction reference, so hints for this problem
        # will serve the static floor. That is a worse hint, never an unsafe
        # one, and the client is told which it is getting.
        raise HTTPException(
            status_code=422,
            detail=f"This problem could not be solved, so hints will be limited: {exc}",
        ) from exc

    session = SESSIONS.create(req.topic, req.problem, vault)
    return ChemistrySessionResponse(
        session_id=session.session_id,
        topic=req.topic,
        level_3_remaining=session.level_3_remaining,
        total_steps=vault.total_steps,
    )

@app.post("/math/session", response_model=MathSessionResponse)
def open_math_session(req: MathSessionRequest):
    try:
        vault = build_math_vault(
            topic=req.topic,
            problem=req.problem,
        )
    except VaultConstructionError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"This problem could not be solved, so hints will be limited: {exc}",
        ) from exc

    session = SESSIONS.create(req.topic, req.problem, vault)

    return MathSessionResponse(
        session_id=session.session_id,
        topic=req.topic,
        level_3_remaining=session.level_3_remaining,
        total_steps=vault.total_steps,
    )


@app.post("/chemistry/transcribe-text", response_model=TranscribeResponse)
def transcribe_chemistry_text(req: TranscribeRequest):
    """Read a handwritten chemistry line: an equation, formula, or working.

    Separate from `/transcribe` because the math prompt restricts output to
    lowercase letters, which is right for algebra and destroys every
    chemical formula it touches.
    """
    try:
        text, unreadable, confidence, latency_ms = transcribe_chemistry_line(
            req.image_base64
        )
    except TranscriptionInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TranscriptionServiceError as exc:
        logger.exception("Gemini chemistry transcription failed")
        raise HTTPException(
            status_code=503,
            detail="Transcription is temporarily unavailable",
        ) from exc
    return TranscribeResponse(
        text=text,
        unreadable=unreadable,
        confidence=confidence,
        latency_ms=latency_ms,
    )


@app.post("/capture/chemistry", response_model=CaptureResponse)
def capture_chemistry_sample(req: CaptureRequest):
    """Save one handwritten sample plus its typed ground truth.

    The corpus is the blocking task in `final_tasks.md` and it will not get
    collected if collecting it is miserable, so this is one click in the
    app: draw, type what you drew, press Capture. It writes the PNG and a
    sidecar JSON that `run_chemistry_corpus.py` reads.

    Off unless `VERITY_CAPTURE_DIR` is set, because an endpoint that writes
    files to disk has no business being reachable on a deployed backend.
    """
    directory = os.getenv("VERITY_CAPTURE_DIR")
    if not directory:
        raise HTTPException(
            status_code=404,
            detail="Capture mode is off. Set VERITY_CAPTURE_DIR to enable it.",
        )

    target = Path(directory)
    try:
        target.mkdir(parents=True, exist_ok=True)
        image_bytes = base64.b64decode(req.image_base64, validate=True)
    except (OSError, binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=422, detail="capture must be a PNG")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    existing = len(list(target.glob("*.png")))
    name = f"{existing + 1:04d}-{stamp}"
    (target / f"{name}.png").write_bytes(image_bytes)
    (target / f"{name}.json").write_text(
        json.dumps(
            {
                "file": f"{name}.png",
                "topic": req.topic,
                "ground_truth": req.ground_truth,
                "target": req.target or req.ground_truth,
                "expected_verdict": req.expected_verdict,
                "note": req.note or "",
                "captured_at": datetime.now().isoformat(timespec="seconds"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    logger.info("captured sample %s into %s", name, target)
    return CaptureResponse(saved_as=f"{name}.png", total_samples=existing + 1)


@app.post("/transcribe", response_model=TranscribeResponse)
def transcribe(req: TranscribeRequest):
    try:
        text, unreadable = transcribe_line(req.image_base64)
    except TranscriptionInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TranscriptionServiceError as exc:
        logger.exception("Gemini transcription failed")
        raise HTTPException(
            status_code=503,
            detail="Transcription is temporarily unavailable",
        ) from exc
    return TranscribeResponse(text=text, unreadable=unreadable)


@app.post(
    "/handwriting/myscript/recognize",
    response_model=MyScriptRecognizeResponse,
)
async def recognize_myscript(req: MyScriptRecognizeRequest):
    """Internal linear-equation POC route; disabled in every shipped revision."""

    if not _myscript_poc_route_is_enabled():
        raise HTTPException(
            status_code=404,
            detail="MyScript recognition is disabled",
        )

    try:
        result = await get_myscript_recognizer().recognize(req)
    except MyScriptRecognitionError as exc:
        if exc.code == "disabled":
            raise HTTPException(
                status_code=404,
                detail="MyScript recognition is disabled",
            ) from exc

        logger.warning(
            "MyScript recognition unavailable code=%s retryable=%s",
            exc.code,
            exc.retryable,
        )
        if exc.code in {
            "provider_rejected_input",
            "provider_payload_too_large",
            "request_body_too_large",
            "unsupported_provider_output",
        }:
            raise HTTPException(
                status_code=422,
                detail="Handwriting input is not supported",
            ) from exc
        if exc.code in {
            "provider_quota_exhausted",
            "provider_rate_limited",
            "request_cap_exhausted",
        }:
            raise HTTPException(
                status_code=429,
                detail="Vector recognition budget is unavailable",
            ) from exc
        if exc.code == "provider_timeout":
            raise HTTPException(
                status_code=504,
                detail="Vector recognition timed out",
            ) from exc
        raise HTTPException(
            status_code=503,
            detail="Vector recognition is temporarily unavailable",
        ) from exc

    return MyScriptRecognizeResponse(
        text=result.text,
        unreadable=result.unreadable,
        candidates=[] if result.unreadable else [result.text],
        latency_ms=result.latency_ms,
    )


def _myscript_poc_route_is_enabled() -> bool:
    route_enabled = os.getenv("MYSCRIPT_POC_ROUTE_ENABLED", "false").strip().lower()
    shared_access_allowed = (
        os.getenv("MYSCRIPT_ALLOW_SHARED_ACCESS", "false").strip().lower()
        == "true"
    )
    # One accidental flag change must never expose a quota-spending endpoint.
    # The shared header can support an explicitly marked local POC only. A
    # deployed provider route requires the reviewed Google identity boundary.
    return route_enabled == "true" and (
        IDENTITY_AUTH_SETTINGS.enabled
        or (shared_access_allowed and bool(API_SECRET))
    )


@app.post("/chemistry/transcribe", response_model=StructureTranscribeResponse)
def transcribe_chemistry_structure(req: StructureTranscribeRequest):
    try:
        smiles, unreadable, confidence, latency_ms = transcribe_structure(
            req.image_base64
        )
    except TranscriptionInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except TranscriptionServiceError as exc:
        logger.exception("Gemini structure recognition failed")
        raise HTTPException(
            status_code=503,
            detail="Structure recognition is temporarily unavailable",
        ) from exc

    # Render what we read straight back. This is the single biggest
    # usability win available: a student cannot check `O=C(*)O*` and can
    # check a picture at a glance, so a misread is caught before it is
    # judged rather than after.
    svg: str | None = None
    generic = False
    if smiles:
        try:
            svg = render_svg(smiles)
            generic = is_generic(_parse_smiles(smiles))
        except (ChemistryParseError, UnsupportedChemistryError):
            svg = None

    return StructureTranscribeResponse(
        smiles=smiles,
        unreadable=unreadable,
        confidence=confidence,
        latency_ms=latency_ms,
        svg=svg,
        generic=generic,
    )


@app.post("/hint", response_model=HintResponse)
def hint(req: HintRequest):
    try:
        return generate_hint(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Serving the built frontend from this same process.
#
# In development the two run separately and Vite proxies /api to here. In a
# container they are one service on one origin, which means one deploy, one
# URL to share, and no CORS configuration that can be wrong.
#
# The frontend calls /api/... in both cases. Rather than making the client
# know which environment it is in, this strips the prefix on the way in, so
# /api/check and /check are the same endpoint and the frontend needs no
# build-time configuration at all.
# ---------------------------------------------------------------------------
API_PREFIX = "/api"


@app.middleware("http")
async def strip_api_prefix(request, call_next):
    path = request.scope.get("path", "")
    if path.startswith(API_PREFIX + "/"):
        request.scope["path"] = path[len(API_PREFIX):]
    return await call_next(request)


# ---------------------------------------------------------------------------
# Optional shared-secret header.
#
# The deployed URL is public and unauthenticated, which is fine while it is an
# unguessable address only three people know, and stops being fine the moment
# it is posted anywhere: every request spends Vertex AI quota on a project we
# share with the whole programme.
#
# Off unless VERITY_API_SECRET is set, so development, CI, and the current
# deployment are unchanged. When real identity is off, setting it requires
# every API call to carry the same value in X-Verity-Key. Google identity mode
# ignores this header and requires a verified bearer token instead.
#
# What this is worth, stated honestly: the frontend has to know the secret to
# send it, and the frontend is JavaScript delivered to a browser, so anyone
# who opens developer tools can read it. This raises the bar from "anyone who
# finds the URL" to "anyone who looks", which is a speed bump against crawlers
# and casual sharing, not authentication. The default-off Google identity
# boundary below is the reviewed path toward account-level access.
# ---------------------------------------------------------------------------
API_SECRET = os.getenv("VERITY_API_SECRET", "").strip()
API_SECRET_HEADER = "x-verity-key"
IDENTITY_AUTH_SETTINGS = GoogleIdentitySettings.from_environ()

# Built from the app's own routes so a new endpoint is covered the day it is
# added rather than the day someone remembers to add it to a list. Computed
# before the static mount below, so it holds API paths only and the frontend
# itself is never behind the header. /health is out because Cloud Run probes
# it and a probe carries no headers of ours.
_PROTECTED_PATHS = {
    route.path
    for route in app.routes
    if getattr(route, "methods", None) and route.path != "/health"
}


@app.middleware("http")
async def require_access_boundary(request, call_next):
    # This middleware is registered after strip_api_prefix, which makes it the
    # outer one, so it still sees /api/... here and has to normalise the same
    # way. Two lines of duplication, rather than an ordering dependency that
    # would silently unprotect everything if the pair were ever reordered.
    path = request.scope.get("path", "")
    if path.startswith(API_PREFIX + "/"):
        path = path[len(API_PREFIX):]

    if path not in _PROTECTED_PATHS:
        return await call_next(request)

    # A preflight carries no custom headers by definition, so rejecting it
    # would make the browser report a CORS failure and hide the real reason.
    if request.method == "OPTIONS":
        return await call_next(request)

    if IDENTITY_AUTH_SETTINGS.enabled:
        try:
            identity = await run_in_threadpool(
                verify_bearer_token,
                request.headers.get("authorization", ""),
                IDENTITY_AUTH_SETTINGS,
            )
        except IdentityTokenInvalid:
            return JSONResponse(
                {"detail": "Authentication required"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
        except IdentityNotAllowed:
            return JSONResponse(
                {"detail": "Account is not permitted"}, status_code=403
            )
        except IdentityProviderUnavailable:
            return JSONResponse(
                {"detail": "Authentication is temporarily unavailable"},
                status_code=503,
            )
        request.state.verity_identity = identity
        return await call_next(request)

    if not API_SECRET:
        return await call_next(request)

    supplied = request.headers.get(API_SECRET_HEADER, "")
    if not hmac.compare_digest(supplied, API_SECRET):
        return JSONResponse({"detail": "Not authorised"}, status_code=401)
    return await call_next(request)


_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.is_dir():
    # Mounted last so every API route above wins the match first. Absent in
    # local development, where this file is a pure API and Vite serves the UI.
    app.mount(
        "/",
        StaticFiles(directory=_STATIC_DIR, html=True),
        name="frontend",
    )

    # SPA fallback. The frontend routes /math and /chemistry client-side, and
    # StaticFiles has no file at either path, so a deep link or a refresh on
    # one of them would 404. Serving index.html lets the router take over.
    # Registered as an exception handler rather than a catch-all route so it
    # cannot shadow a real API path: an unknown /chemistry/* endpoint still
    # 404s as JSON, because only navigations ask for HTML.
    @app.exception_handler(404)
    async def spa_fallback(request, exc):
        accepts_html = "text/html" in request.headers.get("accept", "")
        if request.method == "GET" and accepts_html:
            return FileResponse(_STATIC_DIR / "index.html")
        return JSONResponse({"detail": "Not Found"}, status_code=404)

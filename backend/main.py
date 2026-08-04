import logging
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from hints import generate_hint
from judge import AlgebraJudge, ChemistryJudge
from schemas import (
    CheckRequest,
    CheckResponse,
    ChemistryCheckRequest,
    ChemistryCheckResponse,
    HintRequest,
    HintResponse,
    TranscribeRequest,
    TranscribeResponse,
)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
judge = AlgebraJudge()
chemistry_judge = ChemistryJudge()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/check", response_model=CheckResponse)
def check_steps(req: CheckRequest):
    verdicts = judge.check(req.problem, req.steps)
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


@app.post("/hint", response_model=HintResponse)
def hint(req: HintRequest):
    try:
        return generate_hint(req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

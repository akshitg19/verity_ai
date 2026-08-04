# verity.ai: remaining tasks

Task list split by backend / frontend / testing / cleanup. Every file path is real, taken from the repo as of Aug 3. Where a task says "new file", the file does not exist yet.

---

## Domain and hosting (priority 1)

Right now the app only runs by opening two terminals locally. That needs to change before demo day regardless of what happens with the domain name.

### Domain name

`verity.ai` itself is very likely already taken or held on the aftermarket. `.ai` domains as a category run about $70-100/year with a mandatory two-year minimum, so a fresh one is $140-200 up front even if the exact name is free. Options, cheapest first:

1. Use the free domain from GitHub's Student Developer Pack (comes with a free `.me` domain via Namecheap, plus other extensions like `.tech`/`.live` depending on current partner offers). `verity.me` or similar costs nothing for a year.
2. Register a `.dev`, `.app`, or `.io` alternative instead of `.ai`. These run $10-20/year at a normal registrar (Namecheap, Google Domains successor Squarespace Domains, Cloudflare Registrar at-cost pricing).
3. Skip a custom domain entirely for the SAIL demo. Every hosting option below gives a free subdomain (`verity-ai.vercel.app`, `verity-ai.up.railway.app`) that's perfectly demo-able and judge-friendly. Buy the real domain only once you know the product is continuing past the program.
4. If `verity.ai` really matters as a brand, check current availability and price directly rather than assuming: `https://instantdomainsearch.com` or your registrar's search. If it's taken, `.ai` aftermarket resale can be checked on Sedo/Afternic, but that's typically hundreds of dollars and not a 10-day-timeline task.

### Hosting

Stop running this from PowerShell terminals. Pick one path:

| Piece | Recommended option | Why |
|---|---|---|
| Frontend (React/Vite build) | Vercel or Netlify, free tier | Connect the GitHub repo, auto-deploys on push to `main`, free custom domain support, zero config for a Vite build |
| Backend (FastAPI) | Render, free web service tier | No credit card required, detects Python automatically, free tier sleeps after inactivity which is fine for a demo you control the timing of |
| Alternative backend | Railway | Cleaner UI, but its free tier is credit-based (small amount of free runtime, not unlimited); fine for short demo windows, watch the usage |
| Env vars / secrets | Set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `CORS_ORIGINS` in the hosting platform's dashboard, not in a committed file | `.env.example` already documents exactly what's needed |
| Vertex AI auth in production | Application Default Credentials via `gcloud` works locally but won't work on Render/Railway. Needs a service account key or workload identity federation set up specifically for the hosting platform | This is the one piece that needs real research, not just "pick a host" |

Checklist:

- [ ] Decide domain path (free `.me`/subdomain for demo vs. paid `.ai`/`.dev` for after SAIL)
- [ ] If buying a domain, register it (Namecheap, Cloudflare Registrar, or GitHub Student Pack free domain)
- [ ] Create a Render account, connect the GitHub repo, deploy `backend/` as a web service
- [ ] Set up Vertex AI auth for the hosted backend (service account key, stored as a Render secret, not committed)
- [ ] Create a Vercel or Netlify account, connect the repo, deploy `frontend/` (set `VITE_API_BASE_URL` to the Render backend URL)
- [ ] Update `CORS_ORIGINS` on the backend to include the real frontend URL, not just `localhost`
- [ ] Point the custom domain (if bought) at the frontend host via DNS, following that host's instructions
- [ ] Test the full pipeline end to end on the hosted URL, not just locally, before the demo
- [ ] Add the live URL to `README.md` so teammates and judges don't need setup instructions at all

---

## Product intuitiveness and hint-strategy notes (read before building further)

Gaps found by actually using the app, recorded here so they are decided
deliberately rather than by default. Nothing in this section is built yet and
none of it should be started before the chemistry base flow lands.

### The hint strategy has a ceiling worth naming

Hints today are a fixed deterministic lookup: `line_number` plus `error_type`
selects a pre-written template. That design is the whole reason the "cannot
leak the answer" guarantee is structural instead of a polite instruction to a
model. The hint generator has no access to the problem, the solution, or the
student's work, so there is nothing available for it to leak.

The cost of that guarantee is that a hint can only ever be as specific as its
category. For a sign error or an unbalanced charge, naming the category is
genuinely most of the help a student needs. For a hard problem it will feel
thin, and chemistry is where it will show first, because the useful hint
usually depends on reasoning about the particular structure in front of the
student rather than on which category their mistake falls into.

Two directions to evaluate, and this needs an explicit decision rather than
drifting into one:

1. **A wording layer only.** An AI rephrases the hint to sound like a tutor
   while still receiving nothing but the same fixed category. The structural
   guarantee survives intact because the model still never sees the problem or
   the answer; only the prose changes.
2. **Trading some guarantee for adaptiveness.** Give a model enough context to
   tutor genuinely on hard problems, accepting a smaller but real leak risk in
   exchange. This is a product decision about what verity.ai promises, not a
   technical one, and it should be made in the open with the team rather than
   discovered later in a demo.

### The app is a checker, not yet something a student would live in

Testing made clear that verity.ai currently behaves like a single-canvas
checker rather than a note-taking app anyone would choose for daily homework.
The right bar to measure against is Apple Notes or Samsung Notes, since that is
what students already use: multiple pages and notes, folders or notebooks to
organise them, easy navigation back through past work, and a genuinely richer
set of canvas tools.

verity.ai needs the equivalent structure:

- Creating, naming, and switching between multiple problem sets or notes.
- Folder or subject organisation, so algebra and chemistry live in separate
  spaces rather than sharing one surface.
- A page model, rather than one continuous canvas that grows forever.

### One page holding several problems is not detected

Observed directly: a student finishes a problem, draws a rough horizontal line
across the page, and starts the next problem underneath it. The app does not
register that as a boundary at all. Segmentation currently understands rows
within a single problem, and has no concept of "this row is a separator, and a
new problem begins below it," so the second problem is read as a continuation
of the first.

This needs detection logic of its own. Options worth evaluating:

- Treat a long, roughly horizontal stroke with little vertical variance as a
  divider rather than as content.
- Start a new problem automatically past a large enough vertical gap.
- Make the existing "New Problem" action reachable through a light in-canvas
  gesture instead of only a toolbar click.

The mechanism matters less than the requirement behind it: a student writing
problem after problem down one page, drawing dividers casually as they go,
should never have to think about how the tool segments their work.

None of this blocks current chemistry work, but it should be prioritised once
the chemistry base flow (Phase 8) is stable, since it determines whether the
product holds up in a real demo session covering more than one problem.

---

## Topic scope

### Math (grades 6-12)

Ordered easiest to hardest given what the current judge already does. The core insight: verifying an answer is far easier than solving a problem, so topics where a student's line can be checked symbolically against a reference are all in reach.

| # | Topic | Grade band | How it gets checked | Effort |
|---|---|---|---|---|
| 1 | Linear equations, one variable | 6-9 | Already built (`AlgebraJudge`) | Done |
| 2 | Linear inequalities, one variable | 7-9 | Same solution-set comparison, plus tracking direction flips when multiplying by negatives | Small |
| 3 | Exponent rules, integer exponents | 8-10 | Lift the `^` ban, extend `_support_reason`, SymPy simplify handles equivalence natively | Small |
| 4 | Quadratics: factoring, expanding, completing the square, quadratic formula | 9-11 | Allow degree 2 in `_support_reason`; equivalence check already generalizes | Medium |
| 5 | Systems of two linear equations | 8-10 | New judge: a step is valid if its solution set contains the system's solution | Medium |
| 6 | Polynomial arithmetic and rational expressions | 9-11 | `simplify(a - b) == 0` on expressions; domain caveats for cancelled factors | Medium |
| 7 | Trig identities and equation simplification | 10-12 | `sympy.simplify` / `trigsimp` expression equivalence | Medium |
| 8 | Logarithm and exponential rules | 10-12 | Expression equivalence with positivity assumptions on log arguments | Medium |
| 9 | Differentiation (power, sum, product, chain rule) | 11-12 | Verify final answer: `simplify(diff(reference) - candidate) == 0`. Intermediate steps checked as expression-equivalent to the true derivative | Medium |
| 10 | Integration (power rule through substitution) | 12 | The elegant one: differentiate the student's answer, compare to the integrand. `diff` is always deterministic even when `integrate` struggles, so this scales past what SymPy can integrate | Medium |
| 11 | Limits | 11-12 | Final-answer mode via `sympy.limit` | Small once 9 exists |

Out of scope, permanently: geometry proofs, constructions, word-problem setup, statistics interpretation, anything where the "step" is not a symbolic expression.

Note: topics 9-11 need a second judging mode. The current judge checks "does line N follow from line N-1". Calculus wants "is this line equivalent to the correct target answer". Both are deterministic; they are just different reference choices. Build it as a `mode` flag, not a separate product.

### Chemistry

RDKit alone is not enough for full chemistry coverage, but each gap has a known deterministic fix. New dependencies are flagged.

| # | Topic | How it gets checked | New tech needed | Effort |
|---|---|---|---|---|
| 1 | Molecular structure matching (SMILES equivalence) | Already built (`ChemistryJudge`) | None | Done |
| 2 | Functional group identification | RDKit substructure match (`HasSubstructMatch` against SMARTS patterns for ester, ether, alcohol, ketone, aldehyde, amine, carboxylic acid) | None, RDKit does this | Small |
| 3 | Balancing chemical equations | Parse `2H2 + O2 -> 2H2O`, count atoms and charge per side, compare. Pure parsing and arithmetic | None (regex formula parser, ~100 lines) | Small |
| 4 | Redox half-reactions, electron balance | Same parser plus charge accounting including `e-` | None | Small |
| 5 | Molar mass and stoichiometry arithmetic | Formula parser plus an atomic-weight table | `periodictable` (pip, tiny, no ML) | Small |
| 6 | Empirical/molecular formula from percent composition | Deterministic arithmetic against known atomic weights | Same as 5 | Small |
| 7 | IUPAC naming: student writes a name for a target structure | OPSIN converts the name to a structure, then the existing `ChemistryJudge` compares it. Name-to-structure is a solved deterministic problem | `py2opsin` (pip wrapper around OPSIN, needs Java runtime) | Medium |
| 8 | Hand-drawn structure recognition (drawing to SMILES) | Gemini vision prompt returning SMILES, exactly the `transcription.py` pattern, feeding the existing judge. Editable-SMILES correction panel is the safety net, same as the math transcription panel | None beyond existing Vertex AI setup. DECIMER/MolScribe exist as ML alternatives but are trained on printed structures, not handwriting; do not bet the demo on them | Large, highest risk |
| 9 | Significant figures on numeric answers | String-level digit counting, fully deterministic | None | Small |

Out of scope: reaction mechanisms with curved arrows, Lewis dot structure recognition, 3D geometry/VSEPR from drawings, equilibrium calculations beyond plug-in arithmetic.

---

## Backend

### Judge: algebra depth (backend/judge/algebra.py)

| Done | Task | Detail |
|------|---|---|
| [ ] | Allow exponents | Delete the `"^" in text or "**" in text` rejection in `_validated_local_dict` (line ~95). `convert_xor` is already in `TRANSFORMS`, so `^` parses today; only the guard blocks it |
| [ ] | Allow degree 2 | In `_support_reason`, change `polynomial.degree() > 1` to `> 2` behind a topic flag, and relax the `Pow` rejection for integer exponents on variables |
| [ ] | Inequalities | `_parse_equation` currently splits on `=` only. Add `<`, `>`, `<=`, `>=` parsing into SymPy relational objects; equivalence means same solution set, and the scalar-multiple check must account for direction flips when the ratio is negative |
| [ ] | New error classifiers | The classifier design (test a deterministic "repair", claim the category only if the repair makes the step valid) is good; extend it with: `combining_like_terms` (e.g. `3x + 2` copied as `5x`), `dropped_term` (a term in ref vanishes with no operation), `swapped_sides` (lhs/rhs exchanged without negating) |
| [ ] | Ordering audit | `_classify` runs sign, distribution, arithmetic, scaling in fixed order. Adding categories changes which fires first; add a test asserting each classifier's canonical example still maps to its own category after the additions |

### Judge: new modules (backend/judge/)

| Done | Task | Detail |
|------|---|---|
| [ ] | `systems.py` (new) | Two-equation systems. Problem = two reference equations; a step is valid if the step's solution set contains the system's unique solution. Handles substitution and elimination without needing to know which method the student used |
| [ ] | `calculus.py` (new) | Two functions: `check_derivative(reference_expr, candidate)` comparing against `sympy.diff`, and `check_antiderivative(integrand, candidate)` comparing `sympy.diff(candidate)` against the integrand, with the constant-of-integration handled by checking the difference is constant |
| [ ] | `expressions.py` (new) | Expression-equivalence judge for simplification chains (polynomials, rational expressions, trig, logs). Each line must be `simplify`-equivalent to the previous. Trig needs `trigsimp` in the comparison; logs need `posify` or explicit positive symbols so `log(ab) = log a + log b` verifies |
| [ ] | `chemistry.py` extend | Add functional-group mode: a dict of SMARTS patterns, `HasSubstructMatch` for the expected group, plus a check that the mismatched submitted group can be named for the hint category (`wrong_functional_group`) |
| [ ] | `chemistry_equations.py` (new) | Formula parser (`(NH4)2SO4` style nesting, charges like `Fe^3+`, state symbols stripped), per-side atom and charge tally, `unbalanced_atoms` / `unbalanced_charge` error types. Reuse the parser for redox with `e-` counted into charge |
| [ ] | `stoichiometry.py` (new) | Molar mass from the same formula parser plus `periodictable` weights; percent-composition and empirical-formula checks are arithmetic on top |
| [ ] | `naming.py` (new) | `py2opsin` name-to-SMILES, then delegate to `ChemistryJudge`. If OPSIN cannot parse the name, that is `parse_error`, not a wrong answer |
| [ ] | `base.py` | The generic `Judge[ProblemT, StepT, VerdictT]` contract holds for all of the above. Add a shared `mode` concept (step-chain vs target-answer) here rather than per-judge |

### Transcription and recognition

| Done | Task | Detail |
|------|---|---|
| [ ] | `transcription.py` | The prompt already permits `^` and `sqrt()`, so transcription is ahead of the judge. Once exponents/functions are judgeable, extend `_UNICODE_MAP` for superscripts beyond 2-3 and add fraction-bar handling notes to failures.md |
| [ ] | `transcription.py` | Confidence: ask Gemini to append a `CONFIDENCE: high/low` token, parse it off, return it in `TranscribeResponse` so the frontend can pre-focus the correction field on low confidence |
| [ ] | `transcription.py` | Log per-call latency server-side (a simple `time.perf_counter` around the API call, logged), target under 2s p95 |
| [ ] | `structure_recognition.py` (new) | Chemistry twin of `transcription.py`: PNG in, SMILES out. Prompt constraints: output only SMILES over the supported atom set, `UNREADABLE` fallback, no prose. Reuse `_decode_png`, the error classes, and the deterministic config verbatim; factor shared pieces into a small `vision_common.py` if duplication itches |
| [ ] | Failure log discipline | Extend `backend/tests/transcription/failures.md` with a chemistry section from day one. The math log's identified patterns (Greek-letter bias, ruled-line `=` misreads, g/b confusion) directly informed the current prompt; the chemistry prompt gets the same treatment |

### API and schemas

| Done | Task | Detail |
|------|---|---|
| [ ] | `schemas.py` | Add: `topic` field on `CheckRequest` (literal enum: linear, inequality, quadratic, system, expression, derivative, integral), `SystemCheckRequest` (two problem equations), `ChemistryEquationRequest`, `StoichiometryRequest`, `NamingRequest`, `StructureTranscribeRequest/Response`, `confidence` on `TranscribeResponse`. Keep changes additive; this file is the shared contract |
| [ ] | `main.py` | New endpoints: `/check` gains topic routing (one endpoint, judge picked by `topic`, rather than an endpoint per topic), `/chemistry/balance`, `/chemistry/stoichiometry`, `/chemistry/name`, `/chemistry/transcribe`. Keep `main.py` thin: parse, dispatch to judge, shape response |
| [ ] | `hints.py` | New level 2 and 3 templates per new error category: `combining_like_terms`, `dropped_term`, `swapped_sides`, `direction_flip` (inequalities), `power_rule`, `chain_rule_missing`, `missing_constant` (forgot +C), `unbalanced_atoms`, `unbalanced_charge`, `wrong_functional_group`, `naming_error`, `sig_figs`. The structural guarantee (templates never receive the problem, solution, or student math) must survive every addition; the CI answer-leak tests are the enforcement |
| [ ] | `hints.py` | Chemistry currently falls through to algebra-flavored fallback text ("re-derive this line..."). Add a chemistry-specific fallback pair |

---

## Frontend

All of this currently lives in one 1906-line `frontend/src/App.jsx`. The refactor is the first task because every other frontend task gets harder without it.

| Done | Task | Detail |
|------|---|---|
| [ ] | Component split | Extract from `App.jsx`: `canvas/` (stroke capture, `segmentIntoLines`, `getStrokeRow`, `renderLineToPng`), `panels/TranscriptionPanel.jsx` (the editable per-line list), `panels/VerdictHints.jsx` (verdict colors, hint ladder), `ProblemInput.jsx`, `api.js` (the three fetch calls at lines ~505, ~612, ~793). Pure functions like `distanceToSegment` and `strokeTouchesPoint` go to `geometry.js` where they become unit-testable |
| [ ] | Real segmentation | `getStrokeRow` buckets by vertical center of each stroke into fixed `LINE_HEIGHT` rows. Implement pen-lift plus vertical-gap grouping: a new line starts when the pen touches down clearly below the bounding box of the current line's ink. Keep row-bucketing as the fallback path behind a flag |
| [ ] | Topic selector | Dropdown or segmented control (linear, inequality, quadratic, system, expression, derivative, integral, chemistry modes). Selected topic goes into the `/check` request's new `topic` field and switches which input UI shows |
| [ ] | Export ink color | `renderLineToPng` hardcodes `#1a1a2e` ink, but the user can change `penColor` (state at line 215). Export with the drawn color, or force-normalize to dark ink for the vision model, but do it deliberately, not by accident |
| [ ] | Chemistry mode | Zero chemistry code exists in the frontend. Needed: (a) structure-drawing surface (same stroke canvas, chemistry just needs looser segmentation since a molecule is one 2D figure, not rows), (b) send the cropped drawing to `/chemistry/transcribe`, (c) an editable SMILES correction field, mirroring the math transcription panel, before it goes to `/chemistry/check`, (d) chemistry verdict display reusing the green/red/amber scheme |
| [ ] | Equation-balancing mode | Typed input, not drawn: a text field for the reaction plays to the parser's strengths and dodges subscript-handwriting recognition entirely. Freehand can come later if transcription proves subscripts reliable |
| [ ] | Confidence wiring | When `TranscribeResponse.confidence` is low, auto-focus that line's correction field in the transcription panel |
| [ ] | Hint display | Handle every new error category; unknown categories must still render the fallback hint, never a blank |
| [ ] | Auto-finish | Send a line automatically after N seconds of pen inactivity below it; keep the Finish Line button as backup |
| [ ] | Undo and eraser polish | Undo last stroke exists conceptually via `strokeTouchesPoint` erasing; add stroke-level undo history (the strokes array already makes this cheap) |

---

## Testing

Current state: 85 backend test functions across 5 files, CI runs backend pytest on Ubuntu and Windows plus frontend lint and build. Zero frontend unit tests, zero end-to-end tests.

| Done | Task | Detail |
|------|---|---|
| [ ] | New judge test files | `backend/tests/test_systems_judge.py`, `test_calculus_judge.py`, `test_expressions_judge.py`, `test_chemistry_equations.py`, `test_stoichiometry.py`, `test_naming.py`, `test_structure_recognition.py` (mocked Gemini, same style as `test_transcription.py`) |
| [ ] | Per-category classifier tests | For every error category the judge can emit, one canonical wrong step that must classify as exactly that category, plus one near-miss that must stay generic. Protects against classifier-ordering regressions |
| [ ] | Answer-leak tests for every new category | `test_hints.py` currently guards the existing categories; every new template gets the same assertion: no token from any student input can appear in hint text (structurally guaranteed today, keep it provable) |
| [ ] | Frontend unit tests | Add Vitest. First targets: `segmentIntoLines` (row and pen-lift versions), `getStrokeRow`, `distanceToSegment`, `strokeTouchesPoint`, the PNG-export crop math. These are pure functions; tests are cheap and CI-able with `npm test` added to `.github/workflows/ci.yml` |
| [ ] | Golden-path e2e smoke | One scripted flow: post a known PNG to `/transcribe` (mocked model), pipe result to `/check`, request all three hint levels, assert the full contract. Catches schema drift between the three endpoints that unit tests miss |
| [ ] | Sample-set regression harness | `run_samples.py` exists and writes `results.txt`. Add an `expected.txt` alongside the samples and make the script diff against it, so prompt changes show exactly which samples regressed. Add chemistry structure samples in a sibling folder with the same harness |
| [ ] | Latency assertions | Not in CI (network), but the latency log from `transcription.py` feeds a manual check before demo: p95 under 2s over shared WiFi |

---

## Cleanup and repo hygiene

| Done | Item | Action |
|------|---|---|
| [x] | `README.md` | Done. Retitled to verity.ai, and PROJECT_NOTES.md plus the default Vite `frontend/README.md` were folded into it. The GitHub repo is now `verity_ai`, so the old product name is gone from the codebase entirely |
| [ ] | `frontend/README.md` | Untouched default Vite template text ("React + Vite... two official plugins"). Replace with three lines pointing at the root README, or delete |
| [ ] | `frontend/src/assets/react.svg`, `vite.svg` | Default template assets. Check for references (`grep -r "react.svg" frontend/src`), delete if unused |
| [ ] | `frontend/src/assets/hero.png` | Verify it is actually rendered somewhere; delete if not |
| [ ] | `CLAUDE.md`, `backend/tests/transcription/results.txt` | `results.txt` is machine-regenerated output from `run_samples.py` and was just committed; it should be gitignored instead, with `expected.txt` (curated) being the committed artifact. Decide `CLAUDE.md` deliberately |
| [ ] | `backend/start_backend.ps1` | Intentional backward-compat wrapper around `start-backend.ps1`. Keep |
| [ ] | `backend/scripts/check_gemini_connection.py` | Correctly excluded from pytest (makes real network calls). Keep, it is the fastest auth sanity check |
| [ ] | Dependency additions | `backend/requirements.txt` gains `periodictable` (stoichiometry) and `py2opsin` (naming; note it needs a Java runtime, so gate the naming feature on OPSIN availability rather than making Java a hard requirement for everyone) |

---

## Priority order for the remaining days

Not milestones, just the order that keeps the demo safe:

1. Domain and hosting: get off local terminals, get a real URL, do this in parallel with day-one coding since it doesn't block anyone
2. Algebra depth (exponents, quadratics, inequalities, new classifiers): small diffs to proven code, immediate visible win
3. Calculus judge: high wow-factor per line of code, the differentiate-to-verify trick is genuinely simple
4. Chemistry equation balancing plus functional groups: no new dependencies, no recognition risk, demos well typed
5. Hand-drawn structure recognition: highest risk, start the failure log early, lean on the editable-SMILES correction panel as the demo safety net
6. Frontend refactor and segmentation: do the component split before chemistry mode, not after
7. Naming via OPSIN and stoichiometry: nice-to-have breadth once the above holds

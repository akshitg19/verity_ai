# verity.ai — remaining tasks

Flat task list, split by frontend / backend only. File paths are pulled from the actual repo, not placeholders.

---

## Topic scope

### Math (grades 6-12)

Chosen because each one has a single symbolic right answer a deterministic checker can grade. Geometry, proofs, and anything without that property are out of scope.

| # | Topic |
|---|---|
| 1 | Linear equations & inequalities, one variable |
| 2 | Systems of linear equations, two variables (substitution/elimination) |
| 3 | Quadratics and polynomial factoring/simplification |
| 4 | Exponent rules, integer exponents |
| 5 | Basic differentiation (power rule, sum rule) |
| 6 | Basic integration (reverse power rule, up to +C) |

### Chemistry

Checkable via RDKit plus a vision model for structure recognition.

| # | Topic |
|---|---|
| 1 | Molecular structure matching — already built |
| 2 | Functional group identification |
| 3 | Balancing chemical equations |
| 4 | Redox half-reaction electron balancing |
| 5 | Empirical/molecular formula from percent composition |
| 6 | Hand-drawn structure recognition (drawing → SMILES) — currently missing entirely |

---

## Backend

| File | Task |
|---|---|
| `backend/judge/algebra.py` | Add inequality parsing and checking (`>`, `<`, `>=`, `<=`) alongside existing `=` handling |
| `backend/judge/algebra.py` | Remove the `^`/`**` block for simple integer exponents; support checking exponent-rule steps (`x^2 * x^3 = x^5`) |
| `backend/judge/algebra.py` | Extend `_support_reason` to allow degree-2 polynomials instead of rejecting anything with `Pow` |
| `backend/judge/systems.py` *(new)* | Two-variable linear system judge — checks substitution/elimination steps against a system of two equations |
| `backend/judge/quadratics.py` *(new, or extend `algebra.py`)* | Factoring and quadratic-equivalence checking |
| `backend/judge/calculus.py` *(new)* | Differentiation judge — compares a submitted derivative against `sympy.diff()` of the reference |
| `backend/judge/calculus.py` | Integration judge — compares a submitted antiderivative against `sympy.integrate()`, accounting for the arbitrary `+C` |
| `backend/judge/chemistry.py` | Add a functional-group comparison mode (substructure match, not full-molecule equivalence) — currently only does whole-molecule SMILES equality |
| `backend/judge/chemistry_equations.py` *(new)* | Chemical equation balancer — parse both sides of a reaction string, check atom counts and charge balance per side (pure parsing/arithmetic, no RDKit needed) |
| `backend/judge/redox.py` *(new, or extend `chemistry_equations.py`)* | Half-reaction electron-balance checker |
| `backend/structure_recognition.py` *(new)* | Gemini vision call converting a hand-drawn/photographed chemistry structure into a SMILES string — same pattern as `backend/transcription.py`, chemistry-specific |
| `backend/schemas.py` | Add request/response models for systems, quadratics, calculus, chemical-equation balancing, redox, and structure recognition |
| `backend/main.py` | Register new endpoints — `/check/systems`, `/check/calculus`, `/chemistry/balance`, `/chemistry/redox`, `/chemistry/transcribe` |
| `backend/hints.py` | Add error categories/templates for `combining_like_terms`, `dropped_term`, `swapped_sides`, `one_side_only`, plus coverage for systems/quadratics/calculus errors |
| `backend/hints.py` | Add chemistry-specific hint templates — `structure_mismatch` and other chemistry error types currently fall through to the generic algebra fallback text |
| `backend/judge/base.py` | Confirm the generic `Judge` interface still fits once systems/calculus/chemistry-equations judges exist; adjust if not |
| `backend/tests/` *(new files)* | `test_systems_judge.py`, `test_quadratics_judge.py`, `test_calculus_judge.py`, `test_chemistry_equations.py`, `test_redox_judge.py`, `test_structure_recognition.py` |
| `backend/tests/transcription/failures.md` | Keep logging real failures as you test the new structure-recognition endpoint, same as the math transcription log |

## Frontend

| File | Task |
|---|---|
| `frontend/src/App.jsx` | Split into components — currently one 1906-line file with all state, canvas logic, and UI in a single component. At minimum: canvas/segmentation logic, verdict/hint panel, problem-input UI |
| `frontend/src/App.jsx` (`segmentIntoLines`, `getStrokeRow`) | Still pure row-bucketing — implement real pen-lift + vertical-gap segmentation |
| `frontend/src/App.jsx` | Add a topic/subject selector (linear, systems, quadratics, exponents, calculus, chemistry) that routes a finished line to the right backend endpoint |
| `frontend/src/App.jsx` | Build the entire chemistry mode — zero chemistry code exists in the frontend today. Needs: drawing/labeling molecular structures on canvas, wiring finished lines to `/chemistry/transcribe` then `/chemistry/check`, chemistry-specific verdict display |
| `frontend/src/App.jsx` | Update hint display logic to handle new error categories once `backend/hints.py` adds them |
| `frontend/src/App.jsx` | Add UI for chemical-equation-balancing and redox modes once those endpoints exist — typed formula input is likely more reliable here than freehand drawing |

## Cleanup / repo hygiene

Do this before adding more files, not after.

| Item | Action |
|---|---|
| `CLAUDE.md`, `backend/tests/transcription/results.txt` | Currently untracked locally — decide if they should be committed or gitignored |
| `backend/start_backend.ps1` | Intentional backward-compat wrapper around `start-backend.ps1` — not dead code, leave it |
| `backend/tests/transcription/samples/*.png` | Confirm all are still referenced by `run_samples.py` before adding chemistry sample images alongside them |

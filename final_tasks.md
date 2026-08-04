# verity.ai: remaining tasks

Task list split by backend / frontend / testing / cleanup. Every file path is real, taken from the repo as of Aug 3. Where a task says "new file", the file does not exist yet.

---

## Read this first: constraints every contributor codes to

These hold no matter which part of the product you are working on, math or
chemistry, backend or frontend. If a task below seems to conflict with one of
these, the constraint wins and the task is wrong; say so rather than working
around it.

1. **One judge contract.** Every subject implements
   `Judge[ProblemT, StepT, VerdictT]` from `backend/judge/base.py`. Two
   conventions ride on top of the type signature and are not enforced by it:
   a verdict with `line_number = 0` means *the problem itself* was bad and the
   endpoint turns it into a `problem_error` with no step verdicts; and a step
   that fails does **not** become the new reference line, so a single mistake
   never cascades false errors down every later line. New judges must honour
   both.

2. **Four outcomes, and two of them are not the student's fault.** `valid`,
   `invalid`, `unsupported`, `parse_error`. Only `invalid` may set
   `first_wrong_line` or flag a line in the UI. `unsupported` and
   `parse_error` are our limitations, and showing them as student mistakes is
   a bug. This distinction is the single most important thing in the product;
   it is why a teacher can trust it.

3. **The hint layer never receives the problem, the answer, or the student's
   work.** Today it gets a line number and an error category, nothing else.
   If the worked-example plan below is adopted this becomes a deliberate,
   documented exception with its own safeguards, not a quiet loosening. Until
   that decision is made and written here, do not pass anything else into
   `hints.py`.

4. **`backend/schemas.py` is the shared frontend-backend contract.** Changes
   are additive where possible and announced in the PR that needs them.
   Adding a value to an existing `Literal` is additive; changing or removing
   one is not.

5. **No live Gemini calls in the test suite.** Mock the client the way
   `backend/tests/test_transcription.py` and
   `backend/tests/test_structure_recognition.py` do. Real calls are for
   genuine recognition-quality testing only, logged in the failure logs under
   `backend/tests/transcription/`.

6. **A recogniser reads; it never decides.** Whatever the architecture
   decision below concludes about judging, the module that turns an image into
   text or SMILES returns what it saw and nothing more. Validation and
   correctness live behind it, so a bad reading stays visible and correctable
   instead of silently becoming a verdict.

7. **The student can always correct a misread line before it is judged.** The
   editable transcription field is not a nicety, it is the safety net that
   makes a vision model acceptable in this product at all. Any new input path
   needs an equivalent.

8. **Frontend work goes through the component split first.** `App.jsx` is a
   single 1906-line file, and both math and chemistry features now need to
   touch it. Until it is split, every parallel frontend task collides in one
   file. Treat the split as a prerequisite, not a cleanup.

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

## Architecture decision: which engine judges (decide this first)

Raised Aug 4 after the first real hand-drawn chemistry test. Everything in the
backend and topic sections below depends on how this is settled, so settle it
before starting parallel work, or two people will build against two different
assumptions. Read the whole section before acting on any part of it, because
the pieces trade against each other.

### What triggered it

A student drew the general ester, `R-C(=O)-O-R'`. Gemini transcribed it as
`O=C(R)OR`, which is a **correct** reading of that drawing. The app then showed
"Could not check", because:

- `Chem.MolFromSmiles("O=C(R)OR")` returns `None`. RDKit has no atom called
  `R`, so a correct reading became a parse error.
- The target was `CC(=O)OC`, a concrete molecule. The student answered at the
  level of a functional group. The app had no way to tell those two kinds of
  question apart.

So recognition was not the bottleneck. Representation was. The vision model
understood the drawing better than the rest of the pipeline could express.

### The proposal

Invert the hierarchy. Let the model read *and* propose a verdict, and demote
RDKit and SymPy from gatekeeper to verifier, used where they apply rather than
as the thing that decides whether we can answer at all. Closer to how Photomath
works, but with our two differences kept intact: we check work **live, step by
step, as it is written**, and we give **hints and nudges instead of solutions**.

The argument for it is coverage. RDKit's world is concrete, connected
molecules. Real chemistry homework is full of R groups, generic structures,
partial structures, and mechanisms, none of which that world can hold. Every
one of those is currently an `unsupported` or a `parse_error`, which reads to a
student as the app being broken.

### The tension to decide consciously

The proposal as stated included "even if it leaks the answer", and in the same
breath gave the reason schools would allow this product: it nudges instead of
solving. **Those two fight each other.** If we hand over answers we become
Photomath with extra steps, and we lose the exact property that makes us
usable in a classroom. The differentiator was never determinism for its own
sake; it is that a student cannot use this to skip the work.

Recommended framing, to be confirmed: let the pivot be about **how much we can
judge**, not about **what we disclose**. A model can decide whether a step is
right and still refuse to state the answer. That keeps the product rule intact
while removing the coverage ceiling.

The honest cost of that framing: today "never reveal the answer" is a
*structural* guarantee, because the hint layer only ever receives a line number
and a category and therefore has no answer available to leak. Under a model
judge it becomes a *behavioural* guarantee enforced by a prompt and an output
contract. That is a genuine downgrade in kind, not just in degree, and it
should be accepted deliberately and written down rather than discovered later.

### What we would lose, stated plainly

Right now, an `unsupported` verdict is *provably* not an accusation that the
student was wrong. With a model judge, a hallucinated "correct" on a genuinely
wrong step becomes possible. That is the failure that destroys teacher trust
fastest: being told "you're right" when you are not is worse than being told
"I can't check this one."

### Hybrid design worth evaluating first

This does not have to be all or nothing, and the middle path may get most of
the coverage for much less risk:

1. When a deterministic checker can represent the problem, it decides, and the
   model's opinion is discarded rather than shown. Concrete molecules, linear
   algebra, and equation balancing all stay exactly as reliable as today.
2. Only when the deterministic tools cannot represent the problem does the
   model's verdict surface, and the UI labels it differently so a student and a
   teacher can see which engine spoke.
3. Keep every current deterministic test as a regression suite. If a model-first
   path ever disagrees with RDKit or SymPy on a case they *can* decide, that is
   a bug in the model path, and we will detect it automatically.

Ask twice and compare (self-consistency) is a cheap reliability lever on the
model path, and disagreement is a good trigger for "ask the student to confirm".

### Cheaper fixes that may remove much of the motivation

Worth trying before committing to the pivot, since each is small and none
touches the guarantee:

- **Render the structure back as a picture instead of a SMILES string.** RDKit
  draws SVG today with no new dependency (verified). A student cannot verify
  `O=C(R)OR`, but can verify a drawing instantly. This is what ChemDraw,
  Ketcher, and JSME all do, and it is probably the single biggest usability win
  available.
- **Support generic structures.** Normalising `R`, `R'`, `R1` to the wildcard
  `*` makes them parse: `O=C(*)O*` and `*C(=O)O*` both canonicalise to
  `*OC(*)=O`, so two different drawings of the same generic ester still compare
  equal deterministically. Note the functional-group SMARTS need generic-aware
  variants, since patterns demanding `[#6]` will not match a wildcard.
- **Stop throttling the chemistry model call.** It currently runs at 128 output
  tokens, temperature 0, and thinking disabled, all inherited from math, where
  a line is a few symbols. A 2D structure with implicit carbons, ring closures,
  and stereochemistry is a much harder read, and we have switched off the
  reasoning that would help most.
- **Route to the judge that matches the question.** `FunctionalGroupJudge`
  already exists and is unused, because the UI can only ask "match this exact
  molecule". The ester drawing above would have been judged correctly today if
  the problem type had selected the right judge.

### Cost and latency, to measure not assume

Enabling thinking and longer outputs raises both cost per call and latency, and
a model judging every step multiplies call volume well past today's one call
per finished line. Measure against the existing target of under 2s p95 before
committing, and check the per-step cost at realistic session length.

### Why the topic list forces this decision

The subjects we want to cover are Elementary Math, Algebra, Geometry,
Trigonometry, Statistics, and Calculus, with Physics as a likely addition.
Look at which of those a deterministic checker can actually represent:

| Topic | Deterministic engine can judge it? |
|---|---|
| Elementary math | Yes, arithmetic comparison |
| Algebra | Yes, already built |
| Trigonometry | Yes, `simplify` and `trigsimp` equivalence |
| Calculus | Yes, and elegantly: differentiate the student's answer and compare |
| Geometry | **No.** A proof step is a logical claim about a figure, not a symbolic expression |
| Statistics | **Partly.** The arithmetic yes; choosing the right test, reading a distribution, interpreting a result, no |
| Physics | Partly, with a units library. Formula manipulation yes, setup and modelling no |

Two of the six named topics, and the most interesting half of a third, are
outside what SymPy and RDKit can express **in principle**, not for lack of
effort. That is the real reason this decision cannot be deferred: the topic
list already commits us past the deterministic ceiling.

### The three options, in detail

#### Option 1: Deterministic-first (what exists today, plus the cheap fixes)

Keep SymPy and RDKit as the only things that produce a verdict. Take the four
cheap fixes above to widen what they can represent.

- **Unlocks:** elementary math, algebra, trigonometry, calculus, chemical
  structures, functional groups, equation balancing, redox. Genuinely most of
  a maths curriculum.
- **Cannot do, ever:** geometry proofs, statistical interpretation, reaction
  mechanisms, word problems, anything where a step is not a symbolic object.
- **Guarantees:** the strongest available. No hallucinated verdict is possible.
  The no-leak property stays structural.
- **Effort:** small. Each cheap fix is a day or less.
- **Risk:** low technically, high on product. A student who writes a geometry
  proof gets "not supported", which reads as broken rather than as scoped.

#### Option 2: Model-first (Gemini reads and judges; RDKit and SymPy demoted)

The model receives the problem and the student's step and returns a verdict
and an error category. Deterministic tools become an optional second opinion
or are dropped.

- **Unlocks:** every topic on the list, immediately, including geometry,
  statistics, and physics. Coverage stops being an engineering problem.
- **Costs:** a hallucinated "correct" on a wrong step becomes possible, and
  that is the failure that destroys teacher trust fastest. The no-leak
  guarantee drops from structural to behavioural. Cost and latency rise per
  step and multiply across a session. Regression testing becomes statistical
  rather than exact, so "did we break it" gets much harder to answer.
- **Effort:** medium to build, large to *evaluate*. The build is a prompt and
  an output contract; the work is proving it is reliable enough to put in
  front of a teacher.
- **Risk:** highest. It also discards the clearest thing we can say about why
  this product is different from Photomath.

#### Option 3: Hybrid, deterministic-preferred (recommended)

A problem type declares which engine is authoritative for it. Where a
deterministic judge can represent the problem, it decides and the model's
opinion is discarded before it reaches the student. Where no deterministic
judge can represent it, the model decides and the verdict is **labelled with
its provenance** so a student and a teacher can see which engine spoke.

- **Unlocks:** the full topic list, while algebra, calculus, structures, and
  balancing stay provably exact.
- **Costs:** two engines and a routing table to maintain. The UI must show
  verdict provenance honestly rather than hiding it. More moving parts.
- **Effort:** medium, and most of it is plumbing we partly have: judges
  already share one contract, and `problem_error` and the four-outcome model
  already exist to build on.
- **Risk:** medium, and concentrated exactly where it is unavoidable. We take
  model risk only on topics that would otherwise be impossible, and take none
  on the topics we can already do exactly.

Sharpest argument for it: **the deterministic suite becomes the model's test
harness.** Every case SymPy or RDKit can decide is a case where we can check
the model's answer automatically. If the model path ever disagrees with them
on a case they can both judge, that is a bug we catch in CI rather than in
front of a class. No other option gives us that.

### Implementation shape, if the hybrid is chosen

1. **A `topic` field on the check request**, as the API section below already
   plans. It selects the judge; it also selects the engine.
2. **A routing table** mapping topic to authoritative engine, with a third
   state for "deterministic where possible, model as fallback".
3. **A `judged_by` field on every verdict** (`deterministic` or `model`),
   carried into the response and shown in the UI. Never let a model verdict
   look identical to a proven one.
4. **A verification sandwich for the model path.** The model proposes; where a
   deterministic judge can check any part of the claim, it does; only the
   unverifiable remainder surfaces as a model judgement.
5. **Self-consistency on the model path.** Ask twice, compare. Disagreement
   becomes "ask the student to confirm" rather than a confident wrong verdict.
6. **Keep every existing test as a cross-engine regression suite** per the
   argument above.

### How to decide

Whichever option is chosen, decide the **answer-disclosure** question
separately from the **judging-engine** question. Conflating them is what makes
the pivot look more expensive than it is: a model can judge a step without
stating the answer, and the hint policy below is where disclosure actually
gets decided.

Current leaning, to confirm: **Option 3**, with the four cheap fixes from
Option 1 done first because they are small, they are needed under any option,
and they may remove much of the pressure on their own.

---

## Hint strategy v2: worked examples instead of vague nudges

The complaint, from using it: the hints are too vague to be useful on anything
hard. Level 2 names a category and level 3 states a general principle, which is
enough for a sign error and nowhere near enough for a real problem. A student
stuck on a step does not need to be told that equations stay true when you do
the same thing to both sides.

### The idea

Follow what textbook and courseware systems such as Cengage do: **show a
similar problem, fully worked**. Not the student's problem. A parallel one,
same technique, same shape, different numbers, solved end to end.

### Why this matters more than it looks

A fully worked solution to a *different* problem does not reveal the student's
answer. So this makes hints dramatically more useful **without** spending the
core promise. The current hints are vague not because vagueness is required by
the no-leak rule, but because a one-line template is all we built. The
constraint was never "hints must be thin"; it was "hints must not contain the
answer", and a worked analogue satisfies that completely.

This reframes the hint problem from a safety tradeoff into a content problem,
which is a much better problem to have.

### Proposed ladder

| Level | Content | Changed? |
|---|---|---|
| 1 | Where to look: which line, compare it to the one before | unchanged |
| 2 | What kind of mistake, named without describing the fix | unchanged |
| 3 | The concept behind that mistake, in general terms | unchanged |
| 4 | **A fully worked analogous example**, different values, same technique and same error category | new |
| 5 | **Work through the student's actual step**, gated, off by default | new, and a disclosure decision |

### The safeguard that makes level 4 trustworthy

Generated maths can be wrong, and a wrong worked example inside a hint is worse
than no hint at all. So: **the model generates the analogous problem and its
solution, and then every line of that generated solution is run through our own
deterministic judge.** Only an example that verifies completely is ever shown.
If it fails verification, regenerate or fall back to level 3.

This is the best available use of the hybrid architecture. The generator can be
creative because the verifier is exact, and hallucinated maths structurally
cannot reach a student inside a hint.

### The strongest version: pre-generate the library

Generate the worked examples **offline**, keyed by (topic, error category),
verify each one with the deterministic judge, have a human skim them once, and
ship them as static content.

That gives us, all at once:

- Hints stay a deterministic lookup at runtime, so the structural no-leak
  guarantee is fully preserved and `HintRequest` keeps its current tiny input.
- Zero added latency and zero per-hint cost, which matters for the demo.
- Far richer content than today.
- Review before a student ever sees it, rather than trusting live generation.

The cost is that examples are fixed rather than tailored. Given the categories
are already a small closed set, that is a good trade. Live generation can come
later for the long tail if it proves necessary.

### Level 5 is a separate, explicit decision

Working through the student's own step *is* disclosure for that step. Worth
noting it is narrower than it sounds: it reveals one step after three
escalating hints have failed, not the final answer, which is roughly what a
human tutor would do at that point. Recommendation: build it, keep it behind a
setting, default it off, and let a teacher decide. Do not let it arrive by
accident as part of level 4.

### Tasks

| Done | Task | Detail |
|------|---|---|
| [ ] | Decide the ladder | Confirm levels 4 and 5, and whether level 5 ships at all |
| [ ] | Worked-example schema | Where an example lives, keyed by topic and error category, and how the frontend renders a multi-line solution rather than a sentence |
| [ ] | Generation harness | Offline script: generate candidate examples per category, run every line through the existing judge, keep only fully verified ones |
| [ ] | Human review pass | Skim the generated library once before it ships |
| [ ] | Frontend hint display | Render a worked example properly: steps, not a paragraph. Reuse the verdict card styling |
| [ ] | Answer-leak tests extended | The existing tests assert no token of the student's work appears in hint text. Extend them to the example library: an example must not be the student's problem restated with the same numbers |
| [ ] | Chemistry examples | Same treatment for structure, functional group, and balancing categories |

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

**Revised Aug 4.** This previously read "out of scope, permanently: geometry
proofs, constructions, word-problem setup, statistics interpretation". That
was accurate about *SymPy*, and it is now a statement about the architecture
rather than about the product. The subjects we intend to cover include
geometry and statistics, so these topics are out of scope only under Option 1
above. Under Options 2 or 3 they become reachable, with a model verdict and
honest provenance labelling.

| # | Topic | Grade band | How it gets checked | Depends on |
|---|---|---|---|---|
| 12 | Geometry: angle chasing, similarity, area and volume | 8-11 | Numeric and algebraic relations are symbolic and deterministic; a *proof step* is a logical claim about a figure and is not | Numeric parts: Option 1. Proofs: Option 2 or 3 |
| 13 | Statistics: computation | 9-12 | Mean, median, standard deviation, regression coefficients are all deterministic arithmetic | Option 1 |
| 14 | Statistics: interpretation and test selection | 10-12 | "Which test applies", "what does this p-value mean" are judgement calls with no symbolic form | Option 2 or 3 |
| 15 | Physics: formula manipulation and units | 9-12 | SymPy plus a units library checks dimensional consistency and algebraic rearrangement exactly | Option 1, plus a units dependency |
| 16 | Physics: problem setup and modelling | 9-12 | Choosing the right model for a described situation is not symbolic | Option 2 or 3 |

Still genuinely out of scope under every option: anything requiring us to
grade handwriting quality, presentation, or a student's prose reasoning.

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
| [x] | `chemistry.py` extend | **Done.** `FunctionalGroupJudge` with 8 SMARTS patterns; exclusions stop an ester counting as an ether or an amide as an amine. Unknown group name raises before any step is checked. |
| [x] | `chemistry_equations.py` (new) | **Done.** Parser handles nesting, caret charges, state symbols, and `e-`. Inside an equation a charge needs the caret form, since a bare `+` is ambiguous with a term separator. Atoms are compared before charge. |
| [ ] | `stoichiometry.py` (new) | Molar mass from the same formula parser plus `periodictable` weights; percent-composition and empirical-formula checks are arithmetic on top |
| [ ] | `naming.py` (new) | `py2opsin` name-to-SMILES, then delegate to `ChemistryJudge`. If OPSIN cannot parse the name, that is `parse_error`, not a wrong answer |
| [ ] | `base.py` | The generic `Judge[ProblemT, StepT, VerdictT]` contract holds for all of the above. Add a shared `mode` concept (step-chain vs target-answer) here rather than per-judge |

### Transcription and recognition

| Done | Task | Detail |
|------|---|---|
| [ ] | `transcription.py` | The prompt already permits `^` and `sqrt()`, so transcription is ahead of the judge. Once exponents/functions are judgeable, extend `_UNICODE_MAP` for superscripts beyond 2-3 and add fraction-bar handling notes to failures.md |
| [ ] | `transcription.py` | Confidence: ask Gemini to append a `CONFIDENCE: high/low` token, parse it off, return it in `TranscribeResponse` so the frontend can pre-focus the correction field on low confidence |
| [ ] | `transcription.py` | Log per-call latency server-side (a simple `time.perf_counter` around the API call, logged), target under 2s p95 |
| [x] | `structure_recognition.py` (new) | **Done.** Shares `_decode_png`, `_create_client`, and the error types with `transcription.py` rather than copying them. Prompt element list is generated from `SUPPORTED_ATOMIC_NUMBERS`. Note: it still runs with thinking disabled and a 128-token cap, which the architecture section flags as worth changing. |
| [x] | Failure log discipline | **Done.** `backend/tests/transcription/chemistry_failures.md` exists with the patterns to watch for. Still empty of real samples: fill it. |

### API and schemas

| Done | Task | Detail |
|------|---|---|
| [ ] | `schemas.py` | Add: `topic` field on `CheckRequest` (literal enum: linear, inequality, quadratic, system, expression, derivative, integral), `SystemCheckRequest` (two problem equations), `ChemistryEquationRequest`, `StoichiometryRequest`, `NamingRequest`, `StructureTranscribeRequest/Response`, `confidence` on `TranscribeResponse`. Keep changes additive; this file is the shared contract |
| [ ] | `main.py` | New endpoints: `/check` gains topic routing (one endpoint, judge picked by `topic`, rather than an endpoint per topic), `/chemistry/balance`, `/chemistry/stoichiometry`, `/chemistry/name`, `/chemistry/transcribe`. Keep `main.py` thin: parse, dispatch to judge, shape response |
| [~] | `hints.py` | **Partly done:** `unbalanced_atoms`, `unbalanced_charge`, `wrong_functional_group`, and `structure_mismatch` have level 2 and 3 templates, and `HintRequest.error_type` was widened to accept them. Still to add, once those judges exist: level 2 and 3 templates per new error category: `combining_like_terms`, `dropped_term`, `swapped_sides`, `direction_flip` (inequalities), `power_rule`, `chain_rule_missing`, `missing_constant` (forgot +C), `unbalanced_atoms`, `unbalanced_charge`, `wrong_functional_group`, `naming_error`, `sig_figs`. The structural guarantee (templates never receive the problem, solution, or student math) must survive every addition; the CI answer-leak tests are the enforcement |
| [x] | `hints.py` | **Done.** Chemistry categories no longer reach the algebra fallback. A subject-specific *fallback* pair is still not possible, because `HintRequest` carries no subject field and cannot tell which judge produced an unknown category. See hint strategy v2 above, which supersedes this row. |

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

Revised Aug 4. Not milestones, just the order that keeps the demo safe.

**Already done since this file was first written:** chemistry equation
balancing and redox, functional-group identification, hand-drawn structure
recognition with its failure log, the chemistry endpoints, chemistry hint
templates, chemistry mode in the frontend, and the repo cleanup and rebrand.

**Blocking everything else, do first:**

0. **Settle the architecture decision** above. It is not a large amount of
   writing, but every backend and topic task below reads differently depending
   on the answer, and two people building against two different answers is the
   most expensive mistake available right now.

**Then, roughly in parallel:**

1. **Domain and hosting.** Still priority 1 and still blocked on nobody. Get
   off local terminals and onto a real URL. The Vertex AI auth story on a
   hosted backend is the one piece needing real research.
2. **The four cheap fixes** from Option 1: render the structure back as a
   picture, support generic structures with `*`, stop throttling the chemistry
   model call, and route to the judge that matches the question. All small, all
   needed under every option, and together they fix the worst thing a real user
   has hit so far.
3. **Frontend component split.** Prerequisite for parallel frontend work, per
   constraint 8 at the top. Do this before anyone adds another mode to
   `App.jsx`.
4. **Hint strategy v2.** The worked-example library is the highest-value
   product change available: it is what makes hints useful on hard problems,
   and the pre-generated version costs nothing at runtime.
5. **Algebra depth** (exponents, quadratics, inequalities, new classifiers).
   Small diffs to proven code, immediate visible win.
6. **Calculus judge.** High wow-factor per line of code; the
   differentiate-to-verify trick is genuinely simple.

**Then, once the above holds:**

7. **The multi-problem and note-taking model** from the intuitiveness section.
   This decides whether a demo can cover more than one problem without
   awkwardness, so do not leave it to the last week.
8. **New topics** enabled by the architecture decision: geometry, statistics,
   physics.
9. **Naming via OPSIN and stoichiometry.** Nice-to-have breadth.

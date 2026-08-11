# verity.ai: remaining tasks

Task list split by decisions / backend / frontend / testing / cleanup. Every
file path is real, taken from the repo as of Aug 5. Where a task says "new
file", the file does not exist yet.

**Revised Aug 5.** This revision settles the architecture question Aug 4 left
open and rewrites what the product promises. It is the current statement of the
goal; where `CLAUDE.md`, `README.md`, or the deck still describe the old
no-AI-anywhere design, this file wins and those get updated to follow (tracked
under Documentation near the bottom, not blocking anything).

---

## Decisions locked Aug 5

Written as decisions, not options, because two people building against two
different answers is the most expensive mistake available right now. Each one
records what it costs, so nobody can later say the cost was hidden.

| # | Decision | Was |
|---|---|---|
| 1 | **AI judges, deterministic engines verify.** Option 3, hybrid, with the model's role much larger than the Aug 4 framing assumed. | "The AI never decides whether work is correct." |
| 2 | **AI writes hints, and it receives the problem and the student's work.** | The hint layer received a line number and a category, nothing else. |
| 3 | **The guarantee moves from "the model has no answer to leak" to "the answer physically cannot leave the server."** See the answer firewall below. | The guarantee was structural by starvation. |
| 4 | **Three hint levels, redefined.** Level 2 becomes a worked analogous problem. Level 3 works the student's own step, except on the terminal step, where it is refused. | Three levels of increasingly general prose. |

### Why the old guarantee had to go

It was real, and it is worth being precise about what we are giving up. Today
`hints.py` is a dictionary of fixed strings selected by `error_type`. It cannot
leak the answer because it has never been told one. That is as strong as a
guarantee gets.

It also produces hints that are useless on anything hard. "An equation stays
true only if you do the same thing to both sides" is fine for a sign error in
`2x + 3 = 11`, and it is nothing at all for a student stuck on a trig identity
or looking at a structure they drew with an R group in it. The ceiling is not
an implementation gap that better templates would fix. A hint keyed only by
category can never be more specific than the category, and the interesting
subjects are exactly the ones where the useful hint depends on the particular
thing in front of the student.

The same ceiling applies to judging. Two of the six math topics we intend to
cover, and half of a third, cannot be represented by SymPy **in principle**, not
for lack of effort. Chemistry hit this on Aug 4 within one real drawing: a
student drew the general ester `R-C(=O)-O-R'`, Gemini read it correctly as
`O=C(R)OR`, and the app said "Could not check" because RDKit has no atom called
`R`. Recognition was never the bottleneck. Representation was.

So the honest framing: we are not weakening the promise, we are **moving where
it is enforced**. It used to be enforced by keeping the answer away from the
generator. It is now enforced by keeping the answer away from the *response*.
That is a real downgrade in kind, and the answer firewall below is the work
that has to be done to make it hold anyway.

### What we must never lose

The differentiator was never determinism for its own sake. It is that **a
student cannot use this to skip the work**. Every decision below is measured
against that sentence and nothing else.

---

## The product goal

**A student writes homework by hand, and the page answers back: which line
broke, why that kind of thing breaks, and one worked problem just like it. It
knows the full solution the whole time and never hands it over.**

That is the goal in one paragraph, and everything below is either a way to
widen what it covers or a way to make the last sentence true under pressure.

Three properties make it a product rather than a feature, and none of them
should ever be traded away:

1. **Live, on the page.** Feedback arrives while the student is still writing,
   from the strokes themselves, not from a photo of finished work. Competing
   step-checkers start from a completed page; chat tutors never see the page at
   all.
2. **Precise about where.** It flags the first line where reasoning broke, and
   it distinguishes a proven mistake from a step it could not verify, so it
   never accuses a student of an error it merely failed to understand.
3. **Teaches up to the answer, never past it.** The help gets genuinely
   substantive, up to and including working a step, and it stops short of the
   solution by mechanism rather than by good manners.

The success test is one sentence: **a teacher would let a student use this
during homework, and the student would still have to think.** Any feature that
fails that test is out of scope regardless of how well it works.

## Positioning: what verity.ai now claims

The old pitch leaned on "our AI is too limited to leak the answer." That is no
longer true and it was always the weaker claim, because it describes a
limitation rather than a design. The stronger and now-accurate claim is the
inverse.

**verity.ai solves the problem completely, and then refuses to tell you.**

That reframes every use of AI as a feature rather than a compromise. The system
knows the answer exactly. It withholds it deliberately, and the withholding is
enforced mechanically, not by asking a model to be discreet.

### Motto candidates, to finalise in the deck pass

Recommended: **"It knows the answer. It will never give it to you."**

Alternates, in rough order of preference:

- "Marks the line. Never the answer."
- "Nudges, never solutions."
- "Every step checked. The answer withheld."

Why the recommended one is worth the risk: it is the only line here that makes
the AI a feature. "Nudges, never solutions" is safe and could describe a
worksheet. "It knows the answer and will never give it to you" says there is a
real engine underneath and a deliberate refusal on top, which is exactly the
architecture, and it is the sentence a teacher repeats to another teacher.

The current subtitle on slide 1, "A handwriting-aware tutor that guides
students without giving away the answer", is accurate and survives the pivot
unchanged. It just stops being the *only* claim.

The three product properties above are the messaging spine. Use those three,
in that order, in the deck, the README, and any demo script, rather than
inventing a new framing per surface.

---

## The answer firewall (build this before anything that uses AI for hints)

This is the single most important piece of new engineering in this revision.
Nothing in the hint or model-judge sections ships until it exists, because it is
the thing that replaces the guarantee we are giving up. It is four independent
mechanisms, deliberately overlapping, so no single failure discloses an answer.

### Mechanism 1: the answer vault

The backend already has everything it needs to solve the problem itself. SymPy
solves the equation; RDKit canonicalises the target structure; the balancer
computes the balanced coefficients. Do that **once, at problem setup**, and hold
the result in a server-side object that is never a field on any Pydantic
response model.

The vault holds every form of the answer we can enumerate:

- The solved value or values (`x = 4`).
- Canonical numeric variants: `4`, `4.0`, `04`, `+4`, `4/1`, `"four"`.
- For chemistry, canonical SMILES plus InChIKey plus the molecular formula.
- For balancing, the coefficient vector and the fully balanced equation string.
- The final line of our own worked solution, and each intermediate line that is
  within one step of it.

Rule: the vault is constructed in the endpoint and passed down. It is never
serialised, never logged, and never placed on a schema in `backend/schemas.py`.
A test asserts that no response model, at any nesting depth, has a field that
can hold a vault.

### Mechanism 2: outbound redaction

Every string produced by the hint layer, and every model-authored `detail` or
explanation bound for a student, passes through one function before it is
returned. Not two functions, not a decorator on some paths. One chokepoint,
called in one place, so it can be audited by reading a single file.

The check is deterministic string work, not a model:

- Normalise: unicode NFKC, strip whitespace, collapse repeated spaces,
  lowercase, convert unicode minus and superscripts.
- Tokenise into numbers, identifiers, and operators.
- Reject if any vault form appears as a standalone token, or if a numeric token
  is within floating-point tolerance of a vault value, or if a chemistry hint
  contains a SMILES string that canonicalises to the vault structure.
- Reject the assignment shape specifically: `x = 4`, `x is 4`, `x → 4`.

A rejected hint is regenerated once with the violation named in the retry
prompt. A second rejection falls back to the level-3 template that exists today.
It never fails open, and it never returns an empty hint.

### Mechanism 3: the terminal-step gate

A step is **terminal** if the correct continuation of it is the final answer.
The backend knows this, because it solved the problem in mechanism 1 and can
count how many steps remain.

On a terminal step, level 3 does not work the student's step. It is not a
softer version, it is a different response: the worked analogue from level 2
plus a concept explanation plus, if configured, a link out to a video or a
textbook section. The student is told plainly that this is the last step and
they are finishing it themselves.

This is the mechanism that answers "can't they just press hint 3 on every
line?" They can, and on every line but the last it will teach them the step. On
the last line it will not, so the ladder never terminates in an answer.

### Mechanism 4: escalation budget

Level 3 is metered **per problem**, not per line. A small number of level-3
unlocks per problem, and the counter is server-side and tied to the problem
session rather than to a client-supplied value.

The purpose is not rationing for its own sake. It is that a student who needs
level 3 on every line of a problem is a student who should be told to go back
to the worked examples, and saying so is better tutoring than walking them
through six steps in a row.

### What the firewall does not protect against, stated honestly

Do not let anyone on the team believe this is airtight, because it is not, and
believing it is how it gets shipped badly.

**The near-answer problem.** On a four-step problem, level 3 on step 3 walks the
student to the line immediately before the answer. The final answer never
appears, so redaction passes, but the student is one trivial operation away. The
firewall bounds disclosure; it does not eliminate it. The budget in mechanism 4
is what actually keeps this honest, which is why it is a mechanism and not a
nice-to-have.

**Redaction is a filter, not a proof.** It catches the answer stated. It cannot
catch the answer implied, described in words, or arrived at through a chain the
model spells out. Expect the adversarial suite to find holes and expect to keep
patching it. Anyone who claims a leak class is impossible should be asked for
the test that proves it.

**A wrong problem statement breaks the vault.** If transcription misreads the
problem, the vault holds the wrong answer, so redaction guards the wrong string
and the terminal gate fires on the wrong line. The editable problem field is
therefore load-bearing for safety now, not only for accuracy.

Given all that, the claim we make publicly should stay exactly as narrow as what
we enforce: **the answer is never stated**. Not "the student cannot possibly
work it out", which is not true and would not survive a sharp question from a
teacher.

### Tasks

| Done | Task | Detail |
|------|---|---|
| [ ] | `backend/answer_vault.py` (new) | Construct per-problem answer forms from the deterministic engines. Pure, no I/O, fully unit-testable. Never imported by `schemas.py` |
| [ ] | `backend/redaction.py` (new) | The single outbound chokepoint. Normalisation, tokenisation, numeric tolerance, SMILES canonicalisation, assignment-shape detection. Returns `(allowed: bool, violation: str \| None)` |
| [ ] | Wire the chokepoint | Exactly one call site in the hint path. A test greps the codebase and fails if hint text is returned from anywhere that does not go through it |
| [ ] | Terminal-step detection | Given the vault and the student's current line, decide whether the next correct line is the answer. Lives with the vault, not in the hint layer |
| [ ] | Escalation budget | Server-side per-problem counter for level 3. Decide the number during testing; start at 3 |
| [ ] | Vault-never-serialised test | Walk every model in `backend/schemas.py` recursively and assert no field type can carry vault data |
| [ ] | Adversarial leak suite | The important one. Prompts that try to extract the answer: "just tell me", "what is x", "is the answer 4", non-English, base64, "ignore previous instructions", asking for the answer to a *different* problem whose answer is the same. Every one must be redacted or refused |

---

## Hint strategy v3: the ladder that ships

Supersedes the v2 proposal recorded Aug 4, which had five levels. Three levels,
matching the deck and the existing `HintResponse.max_level`, with each level
redefined.

**All three levels are generated live by the model.** There is no static hint
content in the shipping product. The templates in `hints.py` survive only as the
fallback floor when generation or verification fails.

| Level | Student asks | What they get |
|---|---|---|
| 1 | "Where did I go wrong?" | **Diagnosis.** The line, the operation they actually performed on it, and what to compare against what. Specific to the work in front of them, never a stock sentence |
| 2 | "Show me how this works" | **Demonstration.** A *different* problem, mirroring the structure of theirs with different numbers, worked end to end and verified line by line by our own judge |
| 3 | "Walk me through mine" | **Their own step**, reasoned through, up to but not including the answer. Refused on the terminal step |

The escalation is **diagnose → demonstrate → do it with them**, which is what a
human tutor does. Each rung is a different *kind* of help, not the same help
worded more generously.

### Level 1: diagnosis, not a signpost

Today's level 1 is `"Look closely at line {n}. Compare it to the line right
before it."` — the same sentence for every mistake in every subject, which is
why the ladder feels useless from the first rung.

Level 1 must name **what the student actually did**. That requires seeing their
work, which is exactly what the pivot buys us. It names the operation they
performed, where it went wrong in kind, and what to compare. It does not name
the fix and it does not state a corrected value.

Bad (today): "Look closely at line 3."
Good: "On line 3 you divided both sides by 2. Compare each term on line 3 to the
matching term on line 2 — one of them didn't come through the division."

Same information budget, vastly more useful, and it still contains no answer.

### Level 2: a generated parallel problem, verified before it is shown

**Corrected Aug 5.** An earlier revision of this file proposed pre-generating a
static library keyed by `(topic, error_category)`. **That was wrong and it is
abandoned.** Two reasons, and the first is fatal:

1. **A library keyed by category is not tailored to the student's problem.** A
   generic "sign error" worked example is exactly as canned as the templates we
   are replacing. The complaint was that hints are too vague; a stock example
   for a broad category does not fix that, it relocates it.
2. **The space is not enumerable.** Six maths subjects and six chemistry
   subjects, each with many techniques and many error categories, across every
   problem shape a student might write. There is no finite library here.

The correct design: **the model reads the student's actual problem and writes a
new one that mirrors its structure with different numbers**, then solves it in
full. Same technique, same trap, nothing in common numerically. This is what a
good tutor does at a whiteboard, and it is the thing a model is genuinely better
at than any lookup table.

Why this is safe: a fully worked solution to a *different* problem contains none
of the student's answer. Level 2 is therefore the rung where we can be most
generous at the least risk, which is why it should be the rung students live on.

**The safeguard, and this is non-negotiable.** Generated maths can be wrong, and
a wrong worked example inside a hint is worse than no hint at all. So:

1. The model generates the analogous problem and its complete solution.
2. **Every line of that generated solution is run through our own deterministic
   judge**, the same SymPy or RDKit path that judges the student.
3. Only an example that verifies completely, line by line, is ever shown.
4. If verification fails, regenerate. After a small number of attempts, fall
   back to level 1 content plus a resource link.
5. The redaction filter then confirms the example does not restate the student's
   own problem or contain their answer.

This is the strongest argument for the hybrid architecture in the whole
document: **the generator can be creative precisely because the verifier is
exact.** Hallucinated maths structurally cannot reach a student inside a hint,
not because we trust the prompt, but because SymPy checked every line first.

Verification is cheap — SymPy comparisons are milliseconds. The cost is the one
generation call, which is a hint the student explicitly asked for and can wait a
moment on.

### Level 3: their own step, with the gate

The student's actual line, reasoned through. Terminal-step gate, answer vault,
redaction filter, and escalation budget all apply, per the firewall section.

On a terminal step it does not degrade quietly — it says plainly that this is
the last step and they are finishing it, and offers a fresh level 2 analogue
instead.

### Tasks

| Done | Task | Detail |
|------|---|---|
| [ ] | Rewrite `backend/hints.py` | From a template lookup into a generation pipeline. Keep the existing dictionaries as the fallback floor only |
| [ ] | Level 1 prompt | Receives the problem, the previous line, the flagged line, and the error category. Returns one or two sentences naming the operation performed and what to compare. Must not state a corrected value |
| [ ] | Level 2 prompt | Receives the problem and the error category. Returns a structurally analogous problem with different numbers, plus a full step-by-step solution as a list of lines, plus a one-line statement of the technique |
| [ ] | **Level 2 verification loop** | The critical piece. Feed every line of the generated solution to the existing judge as a step chain. Reject the whole example if any line fails. Retry, then fall back. Nothing unverified is ever rendered |
| [ ] | Level 3 prompt and output contract | Structured output, one step at a time, an explicit field for "this is the terminal step and I am declining" |
| [ ] | `WorkedExample` schema | Problem statement, technique line, ordered solution lines, and a `verified: bool` that is only ever set by the verification loop |
| [ ] | `HintRequest` widening | It gains problem and step context. This is the deliberate, documented exception, and the PR description must say so in those words |
| [ ] | Similarity guard | A generated analogue must not be the student's problem with cosmetic changes. Assert the numbers differ and the answer differs, mechanically, not by prompt instruction |
| [ ] | Extend answer-leak tests | Every generated hint at every level, plus every generated example, asserted free of the vault contents |
| [ ] | Chemistry level 2 | An analogous *structure* or *equation* problem, verified by RDKit or the balancer. Harder than maths and worth prototyping early |
| [ ] | Latency budget for hints | Every level now costs a round trip. Measure it. Show a real loading state, and consider pre-warming level 1 the moment a line is flagged, since it is the most likely next click |
| [ ] | Resource fallback | When generation or verification fails twice, and on the terminal step, link out to a video or textbook section rather than showing nothing |

---

## Architecture: which engine judges

Decided: **hybrid, deterministic-preferred, model-labelled** (the Aug 4 Option
3), with the model's role expanded. The model reads *and* proposes a verdict on
every step. Where a deterministic judge can represent the problem, the
deterministic verdict wins and the model's opinion is discarded before it
reaches the student. Where no deterministic judge can represent it, the model's
verdict surfaces, labelled with its provenance.

### The rules that make it safe

1. **A recogniser reads; it never decides.** The module that turns an image into
   text or SMILES returns what it saw and nothing more. Unchanged from before,
   and it matters more now, not less.
2. **Deterministic beats model, always, where both can speak.** Not "we compare
   and pick". The deterministic verdict is authoritative and the model's is
   dropped. Concrete molecules, linear algebra, and equation balancing stay
   exactly as reliable as they are today.
3. **Provenance is shown, never hidden.** A `judged_by` field of `deterministic`
   or `model` rides on every verdict and reaches the UI. A model verdict must
   never look identical to a proven one. A student and a teacher can always see
   which engine spoke.
4. **The deterministic suite is the model's test harness.** Every case SymPy or
   RDKit can decide is a case where we can check the model automatically. If the
   model path ever disagrees with them on a case they can both judge, that is a
   bug we catch in CI rather than in front of a class. No other architecture
   gives us that, and it is the sharpest argument for this one.
5. **Self-consistency on the model path.** Ask twice, compare. Disagreement
   becomes "ask the student to confirm this line" rather than a confident wrong
   verdict.
6. **The four outcomes survive.** `valid`, `invalid`, `unsupported`,
   `parse_error`. Only `invalid` may flag a line. `unsupported` and
   `parse_error` are our limitations, and showing them as student mistakes is a
   bug. This distinction is why a teacher can trust the product and it does not
   soften under a model judge.

### What this costs, stated plainly

A hallucinated "correct" on a genuinely wrong step becomes possible. That is
the failure that destroys teacher trust fastest: being told "you're right" when
you are not is worse than being told "I can't check this one." Rules 2, 4, and
5 exist specifically to bound it, and the model path is confined to topics that
would otherwise be impossible.

Regression testing on the model path becomes statistical rather than exact, so
"did we break it" gets harder to answer. Budget real time for evaluation, not
just for the build. The build is a prompt and an output contract; the work is
proving it is reliable enough to put in front of a teacher.

### The four cheap fixes, still required

These were listed Aug 4 as things that might remove the pressure to pivot. They
did not remove it, but every one of them is still needed under the hybrid, they
are all small, and together they fix the worst thing a real user has hit.

| Done | Fix | Detail |
|------|---|---|
| [ ] | Render structures as pictures | RDKit draws SVG today with no new dependency (verified). A student cannot verify `O=C(R)OR` but can verify a drawing instantly. Probably the single biggest usability win available |
| [ ] | Support generic structures | Normalise `R`, `R'`, `R1` to the wildcard `*`. `O=C(*)O*` and `*C(=O)O*` both canonicalise to `*OC(*)=O`, so two drawings of the same generic ester compare equal deterministically. Functional-group SMARTS need generic-aware variants, since patterns demanding `[#6]` will not match a wildcard |
| [ ] | Stop throttling the chemistry model call | It runs at 128 output tokens, temperature 0, thinking disabled, all inherited from math where a line is a few symbols. A 2D structure with implicit carbons, ring closures, and stereochemistry is a much harder read and we have switched off the reasoning that would help most |
| [ ] | Route to the judge that matches the question | This is a **frontend** gap, not a backend one. `main.py` already serves `/chemistry/functional-group` (line 92) and `/chemistry/balance` (line 115), but `App.jsx` only ever calls `/chemistry/check` and `/chemistry/transcribe`, so the UI can only ask "match this exact molecule". The Aug 4 ester drawing would have been judged correctly today if the student could have picked "identify the functional group". Cheapest real win in the repo: two working judges are already shipped and unreachable |

### Implementation shape

| Done | Task | Detail |
|------|---|---|
| [ ] | `topic` field on the check request | Selects the judge, and also selects the engine |
| [ ] | Routing table | Topic to authoritative engine, with a third state for "deterministic where possible, model as fallback" |
| [ ] | `judged_by` on every verdict | `deterministic` or `model`, carried into the response and rendered distinctly in the UI |
| [ ] | Verification sandwich | The model proposes; where a deterministic judge can check any part of the claim, it does; only the unverifiable remainder surfaces as a model judgement |
| [ ] | Cross-engine regression suite | Keep every existing deterministic test. Add a mode that runs the model path over the same cases and reports disagreements |
| [ ] | Cost and latency measurement | A model judging every step multiplies call volume well past today's one call per finished line. Measure against the under-2s p95 target before committing, and check per-step cost at realistic session length |

---

## Topic scope

Six subjects each, chosen to match how students and teachers already name them,
which is roughly how Photomath's topic list reads. Each subject lists what a
step looks like, which engine is authoritative for it, and what has to be built.

**Read the "Authoritative engine" column narrowly.** It says which engine
decides correctness *once the line has been read correctly*. It is not a claim
that the topic works end to end, because reading the line is the part we have
never measured. A topic marked "Deterministic" can still fail completely in
front of a student, at the recognition stage, and nothing in the current test
suite would catch it. See the handwriting corpus section below before treating
any row here as evidence.

### Math: the six

> **For whoever picks up math: copy the chemistry functionality across.**
> Chemistry is ahead of math on everything that is not the judge, and none of
> it is chemistry-specific. Port it rather than reinventing it, and port it
> from the files named here.
>
> | Bring across | From | What math has today |
> |---|---|---|
> | The two-level subject and topic selector | `frontend/src/chemistry/topics.js`, served by `GET /chemistry/topics` | One typed problem field |
> | The v3 hint ladder, generated live | `backend/hints.py` | The static template ladder only |
> | The worked example stepped through with a moving tally | `components/WorkedExampleStepper.jsx`, `WorkedExample.equations` | Nothing at level 2 |
> | The answer vault and the session budget | `answer_vault.py`, `sessions.py` | No vault, so no redaction reference |
> | The question written on the page rather than typed | `useRowAsQuestion` in `useChemistry.js`, `QuestionPrompt.jsx` | Typed into the toolbar |
> | Remembering the topic across navigation | `chemistry/topicMemory.js` | Nothing to remember yet |
> | Ten hand-written questions per topic, logged | `testing/chemistry/` | Not started |
>
> Math already has the one thing chemistry copied in the other direction:
> automatic rechecking after every transcription. Chemistry took that from
> `useMathWorkflow.recheck`.



| # | Subject | Grade band | Authoritative engine | Status |
|---|---|---|---|---|
**The six names are fixed.** Elementary math, algebra, geometry, trigonometry,
statistics, calculus. Those exact words, in that order, everywhere they appear:
this file, the landing page, the deck, the README, the UI. No renaming to
"pre-algebra", "statistics and probability", or anything else, because a student
picking a subject and a judge reading the deck should see the same six words.

| # | Subject | Grade band | Authoritative engine | Status |
|---|---|---|---|---|
| 1 | Elementary math | 6-8 | Deterministic | Partly built |
| 2 | Algebra | 8-11 | Deterministic | Partly built |
| 3 | Geometry | 8-11 | Mixed | Not started |
| 4 | Trigonometry | 10-12 | Deterministic | Not started |
| 5 | Statistics | 9-12 | Mixed | Not started |
| 6 | Calculus | 11-12 | Deterministic | Not started |

**1. Elementary math.** Integer and fraction arithmetic, decimals,
percents, ratio and proportion, order of operations, integer exponents, roots,
unit conversion. A step is an arithmetic claim and SymPy compares it exactly.
Almost entirely reachable today.

**2. Algebra.** Linear equations and inequalities in one variable, systems of
two equations, quadratics by every method, polynomial and rational expressions,
logarithms and exponentials, absolute value, sequences. `AlgebraJudge` covers
the first of these; the rest are extensions of the same equivalence check.

**3. Geometry.** Angle chasing, triangle congruence and similarity, circles,
area, surface area and volume, coordinate geometry, transformations, and
two-column proofs. The numeric and coordinate parts are symbolic and
deterministic. **A proof step is a logical claim about a figure and is not
symbolic**, so proofs are the model path with provenance labelling. This is the
subject that most needed the architecture decision.

**4. Trigonometry.** Unit circle values, identities, equation solving over an
interval, law of sines and cosines, graph transformations. `sympy.simplify` and
`trigsimp` decide expression equivalence exactly. Interval solving needs the
solution set compared rather than a single value.

**5. Statistics.** Descriptive statistics, probability rules,
distributions, confidence intervals, hypothesis test arithmetic, regression
coefficients. The arithmetic is deterministic and easy. **Choosing the right
test, reading a distribution, and interpreting a result are judgement calls with
no symbolic form**, so interpretation is the model path.

**6. Calculus.** Limits, derivatives through the chain and product rules,
implicit differentiation, applications of the derivative, definite and
indefinite integrals through substitution, area between curves. Integration is
the elegant one: differentiate the student's answer and compare to the
integrand, since `diff` is always deterministic even where `integrate`
struggles, which scales past what SymPy can integrate.

Physics is the likely seventh and is deliberately not in the six. Formula
manipulation and dimensional consistency are exactly checkable with a units
library; problem setup and modelling are the model path. Add it once the six
hold.

Still out of scope under every option: grading handwriting quality,
presentation, or a student's prose reasoning.

Note: topics 4 and 6 need a second judging mode. The current judge checks "does
line N follow from line N-1". Calculus and identity work want "is this line
equivalent to the correct target". Both are deterministic; they are different
reference choices. Build it as a `mode` flag on `base.py`, not a separate
product.

#### Build brief: the six math subjects, ten questions each

**This is the spec to hand to whoever picks up the math subjects.** One section
per subject. Each one lists the question types a student would actually be set,
the deterministic check that decides a step, and what the judge must refuse
rather than guess.

**The rule for all six: try at least ten example questions per subject.** Ten
real questions, written the way a textbook writes them, each carried through the
full path (problem statement -> handwritten lines -> transcription -> judge ->
verdict -> hint) before the subject is called done. Not ten unit-test
expressions: ten questions, with their working lines, spread across the question
types listed for that subject rather than ten variations of the easiest one. At
least two of the ten must contain a deliberate student mistake, so the error
classifier and the hint ladder are exercised and not just the happy path. Put
them in a fixture file beside the judge module so they run in CI.

**1. Elementary math.** Question types: integer arithmetic with negatives,
fraction addition and subtraction with unlike denominators, fraction
multiplication and division, decimal arithmetic, percent of a number and percent
change, ratio and proportion, order of operations with nested brackets, integer
exponents, square and cube roots, unit conversion. A step is an arithmetic
claim; SymPy compares the two sides exactly under `Rational`, never float
equality. Refuse rather than guess: anything with a variable in it belongs to
algebra.

**2. Algebra.** Question types: one-variable linear equations, linear
inequalities including the direction flip on a negative multiply, two-equation
systems by substitution and by elimination, quadratics by factoring, by
completing the square and by formula, polynomial expansion and factoring,
rational expression simplification, exponent laws, logarithm and exponential
equations, absolute value equations. A step is valid if it preserves the
solution set. `AlgebraJudge` covers the linear case today; the rest reuse the
same equivalence check with the guards in the algebra-depth table above lifted.

**3. Geometry.** Question types: angle chasing on parallel lines, triangle angle
sum and exterior angle, congruence and similarity with a scale factor,
Pythagoras and its converse, circle theorems, area and perimeter of composite
figures, surface area and volume of solids, coordinate distance, midpoint and
slope, transformations, a two-column proof. Numeric and coordinate steps are
symbolic and deterministic. A proof step is a logical claim about a figure with
no symbolic form, so it routes to the model path and comes back
`judged_by="model"`. Refuse rather than guess: a step that depends on a figure
we never saw is `unsupported`, not `invalid`.

**4. Trigonometry.** Question types: exact unit circle values, converting
degrees and radians, evaluating in each quadrant with the right sign, proving a
Pythagorean identity, proving a sum or difference identity, double angle work,
solving an equation over an interval, law of sines, law of cosines, amplitude
and period from a transformed graph. `simplify` and `trigsimp` decide expression
equivalence exactly. Interval solving compares the whole solution set, so a
student who found one root out of two is missing a root, not wrong.

**5. Statistics.** Question types: mean, median, mode and range, variance and
standard deviation, five-number summary and outlier rule, probability of
independent and of mutually exclusive events, conditional probability, binomial
probability, normal distribution and z-scores, a confidence interval for a mean,
the arithmetic of a hypothesis test, least-squares regression coefficients. The
arithmetic is deterministic. Choosing the test, reading a distribution, and
interpreting a result are judgement calls with no symbolic form, so
interpretation is the model path with provenance labelling.

**6. Calculus.** Question types: a limit by direct substitution, a limit needing
factoring or conjugates, the derivative from first principles, power rule
chains, product and quotient rule, chain rule, implicit differentiation, a
tangent line or rate-of-change application, an indefinite integral by
substitution, a definite integral and an area between curves. Integration is
checked by differentiating the student's answer and comparing to the integrand,
which scales past what `integrate` can handle. Constants of integration are
handled by checking the difference is constant, not by requiring the `+ C` to
match.

### Chemistry: the six

| # | Subject | Authoritative engine | Status |
|---|---|---|---|
| 1 | Formulas, moles and stoichiometry | Deterministic | **Built, reachable** |
| 2 | Chemical equations and balancing | Deterministic | **Built, reachable** |
| 3 | Redox and electrochemistry | Deterministic | **Built, reachable** |
| 4 | Solutions, acids, bases and equilibrium | Deterministic | **Built, reachable** |
| 5 | Molecular structure and bonding | Deterministic | **Built, reachable** |
| 6 | Organic: functional groups, naming and reactions | Mixed | **Built, reachable** |

**Reachability warning: resolved Aug 5.** This section used to read: *"Subjects
2, 3, and the functional-group half of 6 are built and tested in the backend
but cannot be reached from the UI, which only calls `/chemistry/check` and
`/chemistry/transcribe`. From a student's or a judge's point of view they do
not exist."*

All six are now reachable. The UI has a two-level subject-then-topic selector
driving eleven endpoints, and `GET /chemistry/topics` serves the routing table
from the backend so the frontend cannot drift out of step with what actually
ships. `tests/test_api_chemistry.py` asserts that every endpoint a topic
advertises is really mounted, so this specific failure cannot recur silently.

**Read the "Status" column narrowly.** It means the code path is written,
unit-tested, and reachable from the UI. It does **not** mean it has been seen
to work on real handwriting. See the handwriting corpus section: that
measurement still has not been taken, and it is the one that decides what the
demo can honestly cover.

**1. Formulas, moles and stoichiometry.** Formula parsing, molar mass, percent
composition, empirical and molecular formula, mole conversions, limiting
reagent, theoretical and percent yield, significant figures. The formula parser
from `chemistry_equations.py` already exists; this is that parser plus an
atomic-weight table plus arithmetic. Needs `periodictable` (pip, tiny, no ML).

**2. Chemical equations and balancing.** Built. Extend with net ionic equations
and spectator-ion identification, which is the same parser plus a solubility
table.

**3. Redox and electrochemistry.** Half-reactions and electron balance are
built. Extend with oxidation-state assignment, which is a deterministic rule
set, and cell potentials, which is table lookup plus arithmetic.

**4. Solutions, acids, bases and equilibrium.** Molarity and dilution, pH and
pOH, strong and weak acid calculations, Ka and Kb, buffers and
Henderson-Hasselbalch, ICE tables, Le Chatelier direction. All of this is
arithmetic and algebra on known constants, so it is fully deterministic and it
is a large, genuinely useful chunk of a chemistry course that needs no new
technology at all. This is the highest value-per-effort subject on either list.

**5. Molecular structure and bonding.** SMILES equivalence is built.
Hand-drawn structure recognition is built and is the highest-risk piece in the
repo. Extend with isomer identification, which is canonical-SMILES comparison
under constraints, and generic structures via the wildcard fix above.

**6. Organic: functional groups, naming and reactions.** Functional group
identification is built with 8 SMARTS patterns. IUPAC naming needs `py2opsin`,
a pip wrapper around OPSIN that requires a Java runtime, so gate the feature on
OPSIN availability rather than making Java a hard requirement for everyone.
**Reaction prediction and mechanism steps are the model path**, since a
mechanism step is a claim about electron movement rather than a structure
comparison. Reaction *products* can often be verified deterministically once
proposed, which is exactly the verification sandwich.

Out of scope: Lewis dot structure recognition from a drawing, 3D geometry and
VSEPR from drawings, and curved-arrow mechanism drawing as an input modality
(mechanism *steps written as structures* are in scope, the arrows are not).

#### Hand-testing pass: ten questions per chemistry topic

Every chemistry topic gets ten questions written **by hand**, on the tablet,
through the real UI, with what actually happened recorded in `testing/`. One
markdown file per topic. This is the measurement the status column above does
not make: "built, unit-tested, reachable" has never meant "seen to work on
handwriting", and this is how that gap gets closed one topic at a time.

**All six topics now have their ten**, sixty questions in `testing/chemistry/`,
each one run through its real judge so the expected column is measured rather
than guessed. Sixty are locked as deterministic tests in
`backend/tests/test_balancing_walkthrough.py` and
`test_chemistry_walkthrough.py`. What is *not* done is the handwriting: these
were driven through the judges directly, and the result rows in each sheet are
blank until someone writes them on a tablet.

| Topic | Sheet | Judge behaviour |
|---|---|---|
| Equations and balancing | `equations-and-balancing.md` | Solid, two holes below |
| Formulas, moles and stoichiometry | `stoichiometry.md` | Solid, shares the quantity hole |
| Solutions, acids and bases | `solutions.md` | The quantity hole is worst here |
| Redox and electrochemistry | `redox.md` | Clean on all ten |
| Molecular structure and bonding | `structure-and-bonding.md` | Clean on all ten |
| Organic groups and naming | `organic.md` | Clean on all eight groups; reactions untested |

**The finding that spans topics, and the most serious one found so far.** The
numeric judges mark a line valid when it matches *any* quantity in the correct
working. That is right for a middle line and wrong for the last one, and
nothing marks a line as the final answer. A student who answers a pH question
with the pOH gets a tick, which is the single most common mistake in that
topic. Same shape as the balancing hole below: the engine checks the line
against the *problem's working* rather than against *what was asked*.

| Done | Finding | Detail |
|------|---|---|
| [ ] | The pOH is accepted as the answer to a pH question | Confirmed on four of the ten solutions questions, and the pKa is accepted on a fifth. Also in stoichiometry, where a molar mass answers a mass question. The fix is not to narrow the quantity set, which would break honest middle lines; it is to know which line is the answer. `xfail` in `test_chemistry_walkthrough.py` |
| [ ] | Reaction prediction has never been exercised by hand | The only model-judged path in chemistry, so the one that most needs a person looking at it, and the least tested. `judged_by` must be visible on the verdict |
| [ ] | Units are optional and ignored in every numeric topic | `0.25`, `0.250 M` and `0.250 mol/L` all pass. A chemistry teacher marks a bare number down. Decide |

Four findings from balancing, before any handwriting was involved:

| Done | Finding | Detail |
|------|---|---|
| [ ] | A balanced equation for a different reaction is accepted | `H2 + O2 -> H2O2` is judged valid against the problem `H2 + O2 -> H2O`. `BalanceJudge.check` parses the reference equation only to report a malformed problem and never compares the student's species against it. Balancing homework exists to break the subscript-editing habit, so this is the serious one |
| [ ] | A fractional coefficient is a `parse_error` | `C2H6 + 3.5O2 -> 2CO2 + 3H2O` fails with `could not read '.5O2' as a formula`. Half coefficients are standard method for combustion. `_split_coefficient` takes leading digits only; accepting `3.5` and `7/2` as a `Fraction` is a small change to the same function |
| [ ] | A balanced multiple of the answer is accepted | `4C3H8 + 20O2 -> 12CO2 + 16H2O` is valid, and `coefficient_distance` reduces before comparing so it reads as zero from the answer. Lowest whole numbers is what a teacher marks. Decide whether that is a verdict, a nudge, or nothing |
| [ ] | Parse error text is written for a developer | All-caps `AL` out of transcription produces `unknown element 'A' in 'AL'`. Students see this string |

---

## Workspace and notebook

The page is the product. Everything else on screen is competing with it, and
until this pass most of it was winning. Research pass over Apple Notes, Samsung
Notes and the stylus-first study apps landed on three things they all do and we
did not: one subject in view rather than every subject at once, a three-dot menu
on every row instead of a scatter of tiny glyphs, and a results panel that docks
and undocks rather than permanently owning a column.

### Done in this pass

| Done | Change | Why |
|------|---|---|
| [x] | Feedback panel is a drawer that slides | A card welded to the right edge is a panel the student writes around |
| [x] | Edge tab with a status dot and one word | Closing the drawer must not mean losing track of whether a line is wrong |
| [x] | The drawer opens itself once when a line is flagged | And does not reopen if you slide it away while the line is still wrong |
| [x] | Read and New question moved to a floating pill at the bottom | The top right of a tablet is the furthest point from the hand holding the pen |
| [x] | Notebook shows one subject at a time | Two whole trees at once was why the shelf read as a file manager |
| [x] | Subject as a real heading, big | It said "First structure" where it should say "Chemistry" |
| [x] | Note search | Every notes app has it |
| [x] | Three-dot menu per row: rename, duplicate, move, delete | Replaces double-click-to-rename and a 13px × |
| [x] | Inline rename, in the sidebar and in the toolbar | Rename where you read the name |
| [x] | New notes are numbered | Four rows called "Chemistry" is a list you open one at a time |
| [x] | Duplicate a note, ink and all | How a student reuses working as a starting point |
| [x] | Per-page delete on the page strip | Double-click to delete a page was undiscoverable and unforgiving |
| [x] | Drive and OneDrive as labelled placeholders | A menu that says "not connected yet" is a promise; an absent menu reads as never having thought about it |
| [x] | Subject sublabel removed from the toolbar | The subject is already the toggle two controls along |
| [x] | Chemistry problem chip is one line, not two | The topic was printed there and again in the panel, reading as a second tab bar |
| [x] | Topic remembered across navigation | Leaving and coming back reset it and threw the work away |
| [x] | Written chemistry checks itself | Math has since the beginning; chemistry waited for a button |
| [x] | Hint loading names the level being fetched | It promised a worked example while fetching level 1 |
| [x] | A new hint scrolls itself into view | On a tablet it landed below the fold |
| [x] | Panel heights in `dvh` plus safe-area inset | `vh` counts a tablet browser's toolbars, so the foot of the panel was behind one |
| [x] | Light is the default theme | Dark is half a theme while the paper cannot invert |
| [x] | Worked-example equations extracted server-side | The client was parsing prose and tallying English words as elements |
| [x] | Pin a note to the top | Apple Notes, Keep and Samsung Notes all have it |
| [x] | Delete a note is undoable | Deleting was silent and final, over a term of homework |
| [x] | Notes name themselves from the question | The question is already transcribed; a name the student chose is never overwritten |
| [x] | Empty page says what to do, and stops once you write | The first screen a student sees was a blank sheet with no invitation |
| [x] | Keyboard shortcuts: undo, redo, toggle the shelf | Teachers will look at this on a laptop |
| [x] | Panel prose cut back | Six status strings and two paragraphs that said what the screen already showed |
| [x] | Page thumbnails instead of numbered squares | "The one with the long division on it" is how people pick a page |
| [x] | Drag a note onto a folder | What people try before they find the menu |
| [x] | The worked example is its own card, not nested in the hint bubble | A stepper, an equation and a row of atom counts were squeezed into a box sized for two sentences |
| [x] | Step progress is a bar, and each step arrives rather than swapping | The dots duplicated the counter and nothing moved between steps |
| [x] | Save a page as a picture | The reason students screenshot their notes, and a screenshot of a scrolling canvas is always the wrong crop |

### Next, in rough order of how much they are worth

| Done | Change | Detail |
|------|---|---|
| [ ] | Undo and redo as a two-finger tap and a three-finger tap | The iPad gesture. Undo already exists, only the gesture is missing |
| [ ] | Pinch to zoom the page | The single most requested thing in every notes app review |
| [ ] | A highlighter | Pen, highlighter, eraser is the whole toolset the research says to offer |
| [ ] | Ruled, squared and blank paper | One CSS-variable swap plus the canvas grid draw |
| [ ] | Swipe left on a note row to delete | Standard on both platforms |
| [ ] | Export a whole note as a PDF | The page export exists; a multi-page one does not |
| [ ] | The drawer resizable by dragging its edge | The stylus research calls out dockable, resizable result panels by name |
| [ ] | More keyboard shortcuts: new note, search, next page | Three exist; these are the next three |
| [ ] | Make the tab draggable, not only tappable | Half a swipe should half-open the drawer |

---

## Backend

### Judge: algebra depth (`backend/judge/algebra.py`)

| Done | Task | Detail |
|------|---|---|
| [ ] | Allow exponents | Delete the `"^" in text or "**" in text` rejection in `_validated_local_dict` (line ~95). `convert_xor` is already in `TRANSFORMS`, so `^` parses today; only the guard blocks it |
| [ ] | Allow degree 2 | In `_support_reason`, change `polynomial.degree() > 1` to `> 2` behind a topic flag, and relax the `Pow` rejection for integer exponents on variables |
| [ ] | Inequalities | `_parse_equation` splits on `=` only. Add `<`, `>`, `<=`, `>=` into SymPy relational objects; equivalence means same solution set, and the scalar-multiple check must account for direction flips when the ratio is negative |
| [ ] | New error classifiers | The classifier design (test a deterministic "repair", claim the category only if the repair makes the step valid) is good; extend with `combining_like_terms`, `dropped_term`, `swapped_sides` |
| [ ] | Ordering audit | `_classify` runs sign, distribution, arithmetic, scaling in fixed order. Adding categories changes which fires first; add a test asserting each classifier's canonical example still maps to its own category after the additions |

### Judge: new modules (`backend/judge/`)

| Done | Task | Detail |
|------|---|---|
| [ ] | `systems.py` (new) | Two-equation systems. A step is valid if its solution set contains the system's unique solution. Handles substitution and elimination without knowing which the student used |
| [ ] | `calculus.py` (new) | `check_derivative` against `sympy.diff`, and `check_antiderivative` comparing `sympy.diff(candidate)` against the integrand, with the constant of integration handled by checking the difference is constant. Add `check_limit` via `sympy.limit` |
| [ ] | `expressions.py` (new) | Expression equivalence for simplification chains (polynomials, rationals, trig, logs). Trig needs `trigsimp`; logs need `posify` or explicit positive symbols so `log(ab) = log a + log b` verifies |
| [ ] | `geometry.py` (new) | Numeric and coordinate geometry deterministically. Proof steps route to the model path and return `judged_by="model"` |
| [ ] | `statistics.py` (new) | Descriptive statistics, probability arithmetic, regression coefficients. Interpretation routes to the model path |
| [x] | `chemistry.py` extend | **Done.** `FunctionalGroupJudge` with 8 SMARTS patterns; exclusions stop an ester counting as an ether or an amide as an amine. Unknown group name raises before any step is checked |
| [x] | `chemistry_equations.py` (new) | **Done.** Parser handles nesting, caret charges, state symbols, and `e-`. Inside an equation a charge needs the caret form, since a bare `+` is ambiguous with a term separator. Atoms are compared before charge |
| [ ] | `stoichiometry.py` (new) | Molar mass from the same formula parser plus `periodictable` weights; percent composition, empirical formula, limiting reagent, and percent yield are arithmetic on top |
| [ ] | `solutions.py` (new) | Molarity, dilution, pH/pOH, Ka/Kb, Henderson-Hasselbalch, ICE tables. Pure arithmetic, no new dependency. Highest value per effort in chemistry |
| [ ] | `naming.py` (new) | `py2opsin` name-to-SMILES, then delegate to `ChemistryJudge`. If OPSIN cannot parse the name, that is `parse_error`, not a wrong answer |
| [ ] | `base.py` | Add a shared `mode` concept (step-chain vs target-answer) here rather than per-judge, and a `judged_by` provenance field on the verdict contract |

### Transcription and recognition

| Done | Task | Detail |
|------|---|---|
| [ ] | `transcription.py` | The prompt already permits `^` and `sqrt()`, so transcription is ahead of the judge. Once exponents and functions are judgeable, extend `_UNICODE_MAP` for superscripts beyond 2-3 and add fraction-bar handling notes to `failures.md` |
| [ ] | `transcription.py` | Confidence: ask Gemini to append a `CONFIDENCE: high/low` token, parse it off, return it in `TranscribeResponse` so the frontend can pre-focus the correction field on low confidence |
| [ ] | `transcription.py` | Log per-call latency server-side (`time.perf_counter` around the API call), target under 2s p95 |
| [x] | `structure_recognition.py` (new) | **Done.** Shares `_decode_png`, `_create_client`, and the error types with `transcription.py` rather than copying them. Prompt element list is generated from `SUPPORTED_ATOMIC_NUMBERS`. Still runs with thinking disabled and a 128-token cap, which the cheap-fixes table above corrects |
| [x] | Failure log discipline | **Done.** `backend/tests/transcription/chemistry_failures.md` exists with the patterns to watch for. Still empty of real samples: fill it |

### API and schemas

| Done | Task | Detail |
|------|---|---|
| [ ] | `schemas.py` | Add `topic` on `CheckRequest` (literal enum across both subjects), `judged_by` on every verdict, `confidence` on `TranscribeResponse`, `SystemCheckRequest`, `StoichiometryRequest`, `SolutionsRequest`, `NamingRequest`. Keep changes additive; this file is the shared contract. Adding a value to an existing `Literal` is additive, changing or removing one is not |
| [ ] | `schemas.py` | Widen `HintRequest` for the v3 ladder, and add a `WorkedExample` model (a list of steps plus a technique line, not a paragraph). Nothing on any response model may carry vault data |
| [ ] | `main.py` | `/check` gains topic routing (one endpoint, judge picked by `topic`, rather than an endpoint per topic). New: `/chemistry/stoichiometry`, `/chemistry/solutions`, `/chemistry/name`. Keep `main.py` thin: parse, dispatch, shape response |
| [~] | `hints.py` | **Partly done:** chemistry categories have level 2 and 3 templates and `HintRequest.error_type` accepts them. Superseded by hint strategy v3 above; the existing templates become the redaction fallback floor |

---

## Frontend

**Status as of the Aug 5 pull (PRs #9 and #10).** The split has started and is
nowhere near done. `frontend/src/canvas/geometry.js` now holds
`distanceToSegment`, `strokeTouchesPoint`, `getStrokeRow`, `segmentIntoLines`,
`DEFAULT_LINE_HEIGHT`, and `DEFAULT_ERASER_RADIUS`, with
`canvas/geometry.test.js` beside it. Vitest is installed and `npm test` runs in
CI. That is genuinely good and it is roughly 70 lines of the file.

`App.jsx` is now **2542 lines**, not the 1906 this file used to say. It grew,
because chemistry mode landed in it. Extracting the pure geometry helpers did
not shrink it meaningfully, because the size is in rendering, state, and six
fetch calls, not in maths helpers. **The split is still a prerequisite, not a
cleanup**, and it is now more urgent than it was, not less.

Note: `frontend/src/canvas/geometry.js` (drawing helpers) and
`backend/judge/geometry.py` (the maths subject) are unrelated despite the name.
Do not let them get confused in conversation.

Tasks are ordered so that two people can work in parallel after task 1 lands.

### 1. Component split (blocking, do first)

| Done | Task | Detail |
|------|---|---|
| [x] | `canvas/geometry.js` | **Done, PR #9.** The four pure helpers plus the two constants, with tests. `App.jsx` imports them at the top rather than defining them |
| [ ] | `canvas/render.js` | Still in `App.jsx`: `renderLineToPng` (line 55) and the ruled-row grid drawing (line ~1104). Both are pure given a stroke list and a canvas, so both belong beside `geometry.js` and both are testable. Take the crop maths with them |
| [ ] | `canvas/StrokeCanvas.jsx` | Stroke capture, pointer handlers, pen state. The canvas should own strokes and expose finished lines, nothing else |
| [ ] | `panels/TranscriptionPanel.jsx` | The editable per-line list |
| [ ] | `panels/VerdictHints.jsx` | Verdict colours and the hint ladder |
| [ ] | `ProblemInput.jsx` | Problem entry, including the subject and topic selector below |
| [ ] | `api.js` | Six fetch calls now, not three: `/check` (512), `/transcribe` (619), `/chemistry/transcribe` (845), `/chemistry/check` (895), and `/hint` twice (943 and 980). Two call sites for the same endpoint is exactly the duplication this module removes. One module, one place to change a base URL |
| [ ] | `theme.js` | The `COLORS` object (line ~15) is referenced throughout. Extract it before the panels move, or every panel drags a copy |
| [ ] | State audit | After the split, write down which component owns `strokes`, `penColor`, `lines`, `verdicts`, and `hintLevel`. Lifting state badly is the usual way a split like this goes wrong |
| [ ] | Line-count gate | Add a CI check that fails if `App.jsx` exceeds a ceiling, and lower the ceiling as pieces come out. Without it this file grows back |

### 2. Input and canvas quality

| Done | Task | Detail |
|------|---|---|
| [ ] | Real segmentation | `getStrokeRow` buckets by vertical centre into fixed `LINE_HEIGHT` rows, which breaks the moment handwriting drifts. Implement pen-lift plus vertical-gap grouping: a new line starts when the pen touches down clearly below the bounding box of the current line's ink. Keep row-bucketing as a fallback behind a flag |
| [ ] | Problem separators | A student finishes a problem, draws a rough horizontal line, and starts the next one underneath. The app does not register that at all, so problem two reads as a continuation of problem one. Detect a long, roughly horizontal stroke with low vertical variance as a divider rather than as content, and start a new problem past it |
| [ ] | Auto-finish | Send a line automatically after N seconds of pen inactivity below it. Keep the Finish Line button as a backup. Make N configurable while we tune it |
| [ ] | Export ink colour | `renderLineToPng` hardcodes `#1a1a2e` (lines 85-86) but `penColor` defaults to `#1f2926` and the user can change it (line 155). So the model already never sees the colour the student drew in. Either export with the drawn colour or force-normalise to dark ink deliberately, and write down which. Normalising is probably right, since a vision model reading pale highlighter is a bad bet |
| [ ] | Undo and eraser polish | Stroke-level undo history; the strokes array already makes this cheap. Redo too. Eraser should show its radius |
| [ ] | Pen tools | Width, colour, and a highlighter. Small, and it is most of what makes a canvas feel finished rather than prototyped |

### 3. Subject and topic UI

| Done | Task | Detail |
|------|---|---|
| [ ] | Subject and topic selector | Two levels: subject (math, chemistry), then topic from the six under it. Selected topic goes into the `/check` request's `topic` field and switches which input UI shows. Do not build a flat 12-item dropdown |
| [ ] | Reach the judges we already shipped | **Do this first in this group.** `/chemistry/functional-group` and `/chemistry/balance` are live, tested, and unreachable from the UI. A problem-type selector plus two request shapes in `api.js` turns two finished backend features into two demoable product features |
| [ ] | Per-topic input surfaces | Structure drawing, typed equation entry for balancing, typed numeric entry for stoichiometry and solutions. Typed input for balancing plays to the parser's strengths and dodges subscript handwriting entirely |
| [ ] | Structure preview | Render the parsed structure back as a picture beside the drawing, from the RDKit SVG the backend now returns. A student cannot verify `O=C(R)OR` but can verify a drawing instantly. Pair it with the editable SMILES field, do not replace it |
| [ ] | Chemistry verdict display | Reuse the green/red/amber scheme. Chemistry needs looser segmentation than math: a molecule is one 2D figure, not rows |

### 4. Trust and verdict UI

| Done | Task | Detail |
|------|---|---|
| [ ] | Provenance badge | Render `judged_by`. A model verdict must be visually distinct from a proven one, in a way a teacher can read at a glance and a student is not alarmed by. Design this carefully; it is the visible face of the architecture decision |
| [ ] | Four outcomes, four treatments | `valid`, `invalid`, `unsupported`, `parse_error` must look like four different things. Amber for "we could not check this" must never read as "you got this wrong" |
| [ ] | Confirm-this-line flow | When self-consistency disagrees, ask the student to confirm the line rather than showing a verdict |
| [ ] | Confidence wiring | When `TranscribeResponse.confidence` is low, auto-focus that line's correction field |

### 5. Hint UI for the v3 ladder

| Done | Task | Detail |
|------|---|---|
| [ ] | Worked-example rendering | Level 2 returns a multi-step solution, not a sentence. Render it as steps with the technique named at the top. Reuse the verdict card styling |
| [ ] | Level 3 loading state | Level 3 costs a round trip. A proper loading state, and a cancel |
| [ ] | Terminal-step message | When level 3 is refused on the final step, that is a designed message, not an error. It should feel like a tutor declining, not like a failure |
| [ ] | Budget display | Show remaining level-3 unlocks for the problem before the student spends one |
| [ ] | Unknown categories | An unrecognised category must render the fallback hint, never a blank |

### 6. Notebook model (start after chemistry base flow is stable)

The app currently behaves like a single-canvas checker rather than something a
student would choose for daily homework. The bar is Apple Notes or Samsung
Notes, because that is what students already use.

| Done | Task | Detail |
|------|---|---|
| [ ] | Multiple notes | Create, name, and switch between problem sets |
| [ ] | Folders by subject | Algebra and chemistry live in separate spaces rather than sharing one surface |
| [ ] | Page model | Discrete pages rather than one canvas that grows forever |
| [ ] | Persistence | Local first. Strokes are already serialisable |
| [ ] | Navigation back through past work | Including which lines were flagged and which hints were used |

---

## The handwriting corpus: the tests we do not have

This section exists because the rest of this file was quietly overstating our
evidence, and someone would eventually have built on that. Read it before
believing any status marked "Done".

### The honest position

**Every test in this repo mocks the model.** All 182 of them. Constraint 5 says
no live Gemini calls in the test suite, which is the right rule for CI, but it
has a consequence nobody wrote down: we have **zero measured evidence about the
only stage that touches a student's actual handwriting**.

What the 182 tests actually prove: given a clean, correct string like
`"2x = 8"`, the judges reach the right verdict. That is worth having and it is
not nothing.

What they do not prove, at all:

- That Gemini reads a real student's handwriting into that clean string.
- That a hand-drawn molecule becomes the right SMILES.
- That subscripts, superscripts, charges, fraction bars, or radicals survive.
- That anything works when handwriting drifts across the ruled rows.
- That a full problem, written by a human, on a tablet, end to end, works once.

The one real-world test we have run was the Aug 4 ester, and **it failed**. That
is a sample size of one, with a 100% failure rate, and it is the entire
empirical basis for the current product. Every "Done" in this file means "the
code path is written and unit-tested", never "we have seen it work on real
handwriting".

### What RDKit and SymPy actually do, precisely

Worth stating flatly, because the topic tables above read more optimistically
than the tools deserve.

**RDKit does not understand chemistry.** It has two relevant capabilities:
canonical SMILES equality, and SMARTS substructure matching. That is the whole
list. It has no concept of an R group, no concept of "a student meant the
general case", no concept of a partially drawn structure, and no tolerance for
anything it cannot parse into a concrete connected molecule. `MolFromSmiles`
returns `None` and there is no gradient of understanding beneath that. The Aug 4
failure was not a bug and it will not be fixed by better code. The wildcard
normalisation in the cheap-fixes table widens the door, it does not remove it.

**SymPy is the same story in a different domain.** It decides symbolic
equivalence exactly, and it decides nothing else. It cannot tell you that a step
was a reasonable move badly executed, cannot judge a geometric argument, and
cannot interpret. Where the topic tables say "Deterministic", read "SymPy can
compare two expressions", not "SymPy can teach this subject".

This is the actual case for the AI pivot, and it is stronger than the coverage
argument: **the deterministic engines are exact about a narrow question, and the
narrow question is often not the one the student asked.**

### The corpus

Build a real one. 100 math samples and 100 chemistry samples, handwritten on a
tablet, by the three of us, before we trust any number in this file.

A **sample** is one complete problem written by hand: the problem statement plus
every working line, three to six lines typically. So 100 math samples is roughly
400 lines through transcription, which is a real measurement rather than a
gesture.

#### Math corpus composition (100 samples)

| Subject | Samples | Must include |
|---|---|---|
| Elementary math | 20 | Fractions with real fraction bars, mixed numbers, decimals, percent signs, long division layout |
| Algebra | 30 | Negative signs everywhere, parentheses, `x` vs `×` vs `+` ambiguity, superscript 2, subscripts on variables, systems written as a brace |
| Trigonometry | 15 | `sin`/`cos`/`tan` written quickly, θ and π, degree symbols, fractions inside functions |
| Calculus | 15 | Integral signs, `dx`, limit notation, primes on functions, Leibniz `dy/dx` stacked |
| Geometry | 10 | Angle symbols, triangle symbols, congruence marks, a figure drawn beside the working |
| Statistics | 10 | x̄ and σ, summation sign, subscripted data points, tables of values |

#### Chemistry corpus composition (100 samples)

| Category | Samples | Must include |
|---|---|---|
| Skeletal structures | 25 | Rings, double and triple bonds, implicit carbons, branches, wedge/dash if drawn |
| Condensed formulas | 15 | `CH3CH2OH` style, written fast, subscripts that sit low rather than small |
| Generic structures with R groups | 15 | The Aug 4 case and its family: `R`, `R'`, `R1`, `Ar`, `X`. Expect these to fail today; that is the point of measuring |
| Functional group identification | 10 | Each of the 8 SMARTS patterns we support, drawn at least once |
| Balancing equations | 15 | Subscripts and coefficients side by side, state symbols, arrows drawn as `->` and as a real arrow |
| Redox half-reactions | 10 | Superscript charges, `e-`, charges that look like plus signs |
| Stoichiometry working | 10 | Units, unit cancellation lines, scientific notation |

#### What gets recorded per sample

One row per sample in a committed file, so a prompt change shows exactly what
regressed:

- The captured PNG, committed alongside.
- **Human ground-truth transcription**, typed by whoever drew it, at the time
  they drew it. Not reconstructed later from the model output, which is how
  corpora quietly become self-fulfilling.
- The expected verdict per line.
- The model's actual output, and the judge's actual verdict.
- Pass or fail, and on fail, which category (see below).
- Latency for the call.

#### The failure taxonomy that actually matters

Not all failures are equal, and the current four-outcome model already knows
this. Grade every failure into one of these, because they have completely
different severities:

| Severity | Failure | Why it matters |
|---|---|---|
| **Fatal** | Misread produces a confident `invalid` on a line the student wrote correctly | Telling a correct student they are wrong. This is the failure that ends a classroom trial. Target: **zero** |
| **Fatal** | Misread produces a confident `valid` on a line the student got wrong | Same trust destruction from the other direction, and the model-judge path makes it newly possible |
| Serious | Correct reading, but the judge returns `unsupported` or `parse_error` | The Aug 4 ester. Reads as broken, but it is honest and correctable |
| Minor | Misread that the student fixes in the correction panel | This is what the editable field exists for. Annoying, not dangerous |
| Minor | Latency over 2s | Demo feel, not correctness |

The headline metric is **not** transcription accuracy. It is the fatal rate. A
system that misreads 20% of lines but never produces a confident wrong verdict
is shippable; a system that reads 95% correctly and confidently mis-flags the
other 5% is not.

### Gates before the demo

Do not present numbers we have not measured. Concretely, before demo day:

- [ ] 100 math samples captured, ground-truthed, and run
- [ ] 100 chemistry samples captured, ground-truthed, and run
- [ ] Fatal-failure rate measured and stated, on both corpora
- [ ] p95 latency measured on real tablet-over-WiFi conditions, not localhost
- [ ] The demo problems chosen **from samples that passed**, and rehearsed on
      the actual demo hardware
- [ ] Every failure filed into `backend/tests/transcription/failures.md` and
      `chemistry_failures.md`, which currently exist and are empty

### Tasks

| Done | Task | Detail |
|------|---|---|
| [ ] | Capture harness | A mode in the app that saves the stroke PNG plus a typed ground-truth field, straight to a folder. Without this, collecting 200 samples by hand is miserable and will not happen |
| [ ] | Split the work | ~35 math and ~35 chemistry samples each across the three of us. One evening, realistically, once the harness exists |
| [ ] | Handwriting variety | Deliberately include fast/messy writing, a left-hander if we have one, different pen widths and colours, and lines that drift across ruled rows. A corpus of careful printing measures nothing |
| [ ] | `run_corpus.py` (new) | Extend the existing `run_samples.py` pattern: run the whole corpus, write per-sample results, diff against `expected.txt`, print the fatal rate as the headline number |
| [ ] | Fatal-rate assertion | Once a baseline exists, CI cannot run it (network), but a pre-demo script must, and it fails loudly if the fatal rate moved |
| [ ] | Revisit the topic tables | After the corpus runs, add a measured recognition-risk rating to every topic row. Several "Deterministic" rows will turn out to be unreachable in practice, and it is much better to learn that now |
| [ ] | Chemistry R-group family | Specifically measure the Aug 4 case class before and after the wildcard fix. It is the one failure we have actually observed and it deserves its own before/after number |

### What this probably means

Expect the corpus to show that chemistry structure recognition is materially
worse than math transcription, that R groups and charges are the worst
categories, and that the honest demo scope is narrower than the topic tables
suggest. That is a good outcome to have on Aug 5 rather than on stage. Plan the
demo around what the corpus says works, and let the topic tables describe the
roadmap rather than the present.

---

## Testing

Current state, counted Aug 5: **182 backend test functions across 8 files**
(`test_algebra_judge` 42, `test_chemistry_equations` 45, `test_api` 35,
`test_structure_recognition` 19, `test_functional_group_judge` 15,
`test_chemistry_judge` 14, `test_hints` 7, `test_transcription` 5). Earlier
revisions of this file said 85 across 5 and the deck says 89; both are stale,
the chemistry work roughly doubled the suite. CI runs backend pytest on Ubuntu
and Windows, plus frontend lint, `npm test`, and build. Frontend testing now
exists: Vitest installed, `canvas/geometry.test.js` covering the four extracted
pure helpers (PR #9). Zero end-to-end tests.

| Done | Task | Detail |
|------|---|---|
| [ ] | Answer firewall suite | The adversarial leak tests from the firewall section. This is the highest-priority test work in the repo now |
| [ ] | Cross-engine agreement | Run the model path over every case the deterministic suite covers and fail on disagreement. This is what makes the hybrid safe |
| [ ] | New judge test files | `test_systems_judge.py`, `test_calculus_judge.py`, `test_expressions_judge.py`, `test_geometry_judge.py`, `test_statistics_judge.py`, `test_stoichiometry.py`, `test_solutions.py`, `test_naming.py`. Note `test_chemistry_equations.py`, `test_functional_group_judge.py`, and `test_structure_recognition.py` already exist and earlier revisions of this file wrongly listed them as to-do |
| [ ] | Per-category classifier tests | For every error category a judge can emit, one canonical wrong step that must classify as exactly that category, plus one near-miss that must stay generic |
| [ ] | Worked-example verification | Test the level 2 loop itself, not a library: feed it deliberately wrong generated solutions (mocked model output) and assert the verifier rejects every one. The failure mode that matters is an unverified example reaching a student, so test the rejection path harder than the happy path |
| [x] | Frontend test harness | **Done, PR #9.** Vitest installed, `npm test` wired into `.github/workflows/ci.yml`, `canvas/geometry.test.js` covering `segmentIntoLines`, `getStrokeRow`, `distanceToSegment`, `strokeTouchesPoint` |
| [ ] | Frontend tests, next targets | The PNG-export crop maths once `renderLineToPng` moves out, the pen-lift version of `segmentIntoLines`, and divider detection. Each of these is a pure function and each is a place a silent bug costs a demo |
| [ ] | Golden-path e2e smoke | One scripted flow: post a known PNG to `/transcribe` (mocked model), pipe to `/check`, request all three hint levels, assert the full contract. Catches schema drift between endpoints |
| [ ] | Sample-set regression harness | `run_samples.py` exists and writes `results.txt`. Add `expected.txt` and diff against it, so prompt changes show exactly which samples regressed. Add chemistry structure samples in a sibling folder with the same harness |
| [ ] | Latency assertions | Not in CI (network). The latency log feeds a manual check before demo: p95 under 2s over shared WiFi, measured with the model judge enabled, not just transcription |

**No live Gemini calls in the test suite.** Mock the client the way
`backend/tests/test_transcription.py` and `test_structure_recognition.py` do.
Real calls are for genuine recognition-quality testing only, logged in
`backend/tests/transcription/`.

---

## Domain and hosting (still priority 1)

Right now the app only runs by opening two terminals locally. That changes
before demo day regardless of what happens with the domain name.

### Domain name

`verity.ai` itself is very likely already taken or held on the aftermarket.
`.ai` domains run about $70-100/year with a mandatory two-year minimum, so a
fresh one is $140-200 up front even if the exact name is free. Options,
cheapest first:

1. The free domain from GitHub's Student Developer Pack (a free `.me` via
   Namecheap, plus other extensions depending on current partner offers).
   `verity.me` or similar costs nothing for a year.
2. A `.dev`, `.app`, or `.io` alternative at $10-20/year (Namecheap, Squarespace
   Domains, Cloudflare Registrar at-cost).
3. Skip a custom domain for the SAIL demo entirely. Every host below gives a
   free subdomain that is perfectly demo-able. Buy the real domain only once you
   know the product continues past the program.
4. If `verity.ai` really matters as a brand, check availability and price
   directly rather than assuming. Aftermarket resale is typically hundreds of
   dollars and not a 10-day-timeline task.

### Hosting

| Piece | Recommended | Why |
|---|---|---|
| Frontend | Vercel or Netlify, free tier | Connect the repo, auto-deploy on push to `main`, free custom domain, zero config for Vite |
| Backend | Render, free web service tier | No credit card, detects Python automatically, free tier sleeps after inactivity which is fine for a demo you control the timing of |
| Alternative backend | Railway | Cleaner UI, credit-based free tier; fine for short demo windows, watch usage |
| Env vars | Set `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`, `CORS_ORIGINS` in the platform dashboard, not a committed file | `.env.example` documents exactly what is needed |
| Vertex AI auth in production | ADC via `gcloud` works locally but not on Render. Needs a service account key or workload identity federation | The one piece needing real research, not just "pick a host" |

Checklist:

**Superseded Aug 10 by what was actually built.** The Render rows below were
already contradicted by the deployment section at the bottom of this file,
which explains why Render is the wrong host: it sits outside GCP and so
*requires* a downloaded service-account key. The backend went to Cloud Run
instead and needs no key at all. Only the frontend row survived contact.

- [x] Decide domain path — free host subdomain for the demo, no purchase.
      `verity-ai.vercel.app` was taken, so the address is
      `verity-ai-lovat.vercel.app`
- [ ] If buying, register it — deferred until the product outlives SAIL
- [~] ~~Create a Render account, connect the repo, deploy `backend/`~~ —
      **abandoned deliberately.** Cloud Run instead, for the auth reason above
- [x] Set up Vertex AI auth for the hosted backend — **no key file exists.**
      The service account identity is read from the Cloud Run metadata
      server. Verified live against `/transcribe`
- [x] Deploy `frontend/` to Vercel, set `VITE_API_BASE_URL` to the Cloud Run
      URL
- [x] Update `CORS_ORIGINS` to include the real frontend URL — all three
      Vercel aliases plus the two localhost origins
- [ ] Point the custom domain (if bought) at the frontend host via DNS
- [~] Test the full pipeline end to end on the hosted URL before the demo —
      partly; see the deployment status section at the bottom for exactly
      what was and was not exercised
- [x] Add the live URL to `README.md`

---

## Documentation: bring the story in line

The pivot makes three documents wrong. They are not cosmetic; they are what a
judge or a teacher reads.

| Done | Doc | What changes |
|------|---|---|
| [ ] | `CLAUDE.md` | "AI never judges correctness" and "the hint layer only ever receives a line number and an error category" are both now false. Replace with the answer-firewall rules and the deterministic-preferred routing rule |
| [ ] | `README.md` | "The AI never grades" and "Hints cannot leak the answer... This is structural" need rewriting to the new guarantee. Add the `judged_by` concept to the architecture section |
| [ ] | Deck slide 6 | "The AI never decides whether the student is correct" is the line to replace |
| [ ] | Deck slide 7 | The Hints row ("No model input means no leak path") and the Verdict row both change |
| [ ] | Deck slide 10 | The whole slide is built on the old guarantee. It becomes the strongest slide in the deck under the new one, because "it solves it and refuses to tell you" is a better story than "it is too limited to tell you" |
| [ ] | Deck slide 4 | Already says "the hint writer receives the error category and enough context to phrase a relevant hint", which is closer to the new design than to the old code. It only needs the leak mechanism updated |
| [ ] | Deck slide 11 | Status slide: chemistry is no longer "not yet". Balancing, redox, functional groups, structure recognition, and chemistry mode in the frontend all ship today |
| [ ] | Deck slides 3 and 12 | "Math now, chemistry next" is out of date, and the roadmap milestones are all either done or superseded |

---

## Cleanup and repo hygiene

| Done | Item | Action |
|------|---|---|
| [x] | `README.md` | Done. Retitled to verity.ai; `PROJECT_NOTES.md` and the default Vite `frontend/README.md` folded in. Repo is now `verity_ai`, so the old product name is gone from the codebase |
| [ ] | `frontend/README.md` | Untouched default Vite template text. Replace with three lines pointing at the root README, or delete |
| [ ] | `frontend/src/assets/react.svg`, `vite.svg` | Default template assets. `grep -r "react.svg" frontend/src`, delete if unused |
| [ ] | `frontend/src/assets/hero.png` | Verify it is rendered somewhere; delete if not |
| [ ] | `backend/tests/transcription/results.txt` | Machine-regenerated output from `run_samples.py`. Gitignore it; `expected.txt` (curated) is the committed artifact |
| [ ] | `backend/start_backend.ps1` | Intentional backward-compat wrapper around `start-backend.ps1`. Keep |
| [ ] | `backend/scripts/check_gemini_connection.py` | Correctly excluded from pytest (real network calls). Keep, it is the fastest auth sanity check |
| [ ] | Dependency additions | `backend/requirements.txt` gains `periodictable` (stoichiometry) and `py2opsin` (naming; needs a Java runtime, so gate the naming feature on OPSIN availability rather than making Java a hard requirement) |

---

## Priority order for the remaining days

Revised Aug 5. Not milestones, just the order that keeps the demo safe.

**Already done:** chemistry equation balancing and redox, functional-group
identification, hand-drawn structure recognition with its failure log, the
chemistry endpoints, chemistry hint templates, chemistry mode in the frontend,
and the repo cleanup and rebrand.

**Blocking, do first:**

0. **The handwriting corpus.** 200 real samples, captured and measured. This
   comes before everything, including the firewall, because it is the only way
   to find out which of the "Done" rows in this file are actually true. Every
   other priority below is planned against assumptions the corpus will either
   confirm or destroy, and finding out after we have built on them is the
   expensive version. The capture harness is a few hours; the capture is one
   evening across three people.

0b. **The answer firewall.** It replaces the guarantee we are giving up, and
   every AI-touching task below is unsafe to ship without it. Second only to
   knowing whether we can read a page at all.

**Then, roughly in parallel:**

1. **The four cheap fixes.** Small, needed under any architecture, and together
   they fix the worst thing a real user has hit. Render structures as pictures
   first; it is the single biggest usability win available.
2. **Frontend component split.** Prerequisite for all parallel frontend work.
   Nobody adds another mode to `App.jsx` before this lands.
3. **Domain and hosting.** Still blocked on nobody. Get off local terminals and
   onto a real URL. Vertex AI auth on a hosted backend is the one piece needing
   real research.
4. **Hint ladder v3, levels 1 and 2.** The highest-value product change
   available. Level 1 is one prompt and turns the weakest thing in the product
   into a real diagnosis. Level 2 is the generated-and-verified parallel
   problem, which is the feature people will remember. Ship both before level 3,
   because level 3 is the only rung that needs the full firewall to be safe.
5. **Solutions, acids and bases** (`solutions.py`). Highest value per effort on
   either subject list, no new dependency, entirely deterministic.
6. **Algebra depth** (exponents, quadratics, inequalities, new classifiers).
   Small diffs to proven code, immediate visible win.
7. **Calculus judge.** High wow-factor per line of code; differentiate-to-verify
   is genuinely simple.

**Then, once the above holds:**

8. **Hint level 3** with the terminal gate and the budget, behind everything in
   step 0.
9. **The model judge path** with provenance labelling, and the cross-engine
   agreement suite alongside it, not after it.
10. **The notebook model.** This decides whether a demo can cover more than one
    problem without awkwardness, so do not leave it to the last week.
11. **Geometry proofs, statistics interpretation, organic reactions.** The
    topics the architecture decision unlocked.
12. **Naming via OPSIN, stoichiometry breadth, physics.** Nice-to-have breadth.

---

# Chemistry status and what is left — added Aug 5, end of the chemistry pass

Everything above this line is the plan. This section is what actually
happened, what remains, and how deployment works. Read it first if you are
picking the work back up.

## What shipped in this pass

All six chemistry subjects are built, tested, and reachable from the UI.
The backend suite went from **182 tests to 555**; the frontend from 6 to 29.

### The engines

| Module | What it does |
|---|---|
| `judge/quantities.py` (new) | Reads a written numeric claim: value, unit, label, sig figs. Handles `500 mL` = `0.5 L` and scientific notation in four spellings, and refuses a line containing two numbers rather than guessing which one was the answer |
| `judge/numeric.py` (new) | The shared shape of a solved problem. The backend solves first and compares second, which is what makes the answer vault, terminal-step detection, and worked-example verification all fall out for free |
| `judge/stoichiometry.py` (new) | Molar mass, percent composition, mole conversions, empirical and molecular formula, limiting reagent, theoretical and percent yield. Atomic weights come from RDKit rather than adding the `periodictable` dependency this file originally specified |
| `judge/solutions.py` (new) | Molarity, dilution, pH/pOH, strong and weak acids and bases, Ka/Kb, buffers, ICE tables solved as an exact quadratic, titration, percent by mass |
| `judge/redox.py` (new) | Oxidation-state assignment from the standard rule set, and standard cell potentials from a 34-entry table |
| `judge/net_ionic.py` (new) | Ion table, solubility rules, dissociation, spectator-ion cancellation |
| `judge/naming.py` (new) | IUPAC naming via OPSIN, gated on availability so Java is not a hard requirement |
| `judge/chemistry_equations.py` | Extended with an exact rational balancer, the balanced-equation string, and `coefficient_distance` for terminal-step detection |
| `judge/chemistry.py` | Extended with R-group normalisation, generic-aware SMARTS, `IsomerJudge`, and SVG rendering |
| `chem_model.py` (new) | The model path for reaction prediction: deterministic checks first, model only for the remainder, asked twice, always labelled `judged_by="model"` |

### The Aug 4 ester

The one real-world failure we had observed is fixed. `normalise_generic_smiles`
rewrites `R`, `R'`, `R1`, `Ar`, and `X` onto the SMILES wildcard `*`, so
`O=C(R)OR'` and `*C(=O)O*` both canonicalise to `*OC(*)=O` and compare equal.
The functional-group patterns gained generic-aware variants, used only when
the drawing actually contains a wildcard, so the exclusions still hold: a
generic ether is still not an ester.

`tests/test_generic_structures.py` is the before/after. Every test in it fails
against the pre-fix judge.

### The four cheap fixes, all done

- **Structures render as pictures.** `/chemistry/render` returns RDKit SVG, and
  `/chemistry/transcribe` now returns the drawing read back as a picture
  alongside the SMILES.
- **Generic structures supported**, as above.
- **The chemistry model call is no longer throttled.** It ran at 128 output
  tokens with thinking disabled, inherited from math. `model.py` now holds
  named per-job budgets, and structure reading gets dynamic thinking.
- **The UI reaches the judges we already shipped**, plus nine more.

### The answer firewall

All four mechanisms are built and tested: `answer_vault.py`, `redaction.py`,
the terminal-step gate, and the per-problem level-3 budget in `sessions.py`.
`tests/test_answer_firewall.py` includes the adversarial suite. Every way we
could think of to state an answer — assignment shapes, scientific notation,
unicode minus, fullwidth equals, an interpunct decimal point, digits with
spaces wedged between them, an equivalent SMILES, the molecular formula — is
asserted to be blocked.

Two structural tests are worth knowing about, because they fail loudly if
someone refactors carelessly. One greps `hints.py` and fails if `HintResponse`
is constructed anywhere but `_finalise`. The other walks every model in
`schemas.py` recursively and fails if any field could carry vault data.

### Hints v3

Levels 1, 2, and 3 all generate live for chemistry. The level-2 verification
loop is the important piece: the model returns a worked example *plus a
machine-checkable spec*, our own engine solves that spec independently, and
every numeric line of the generated working must match a quantity our solver
produced. One invented intermediate and the whole example is thrown away.
`tests/test_hints_v3.py` spends most of its length on that rejection path.

Math is untouched. It still uses the static template ladder, and a test
asserts the math path never calls a model.

---

## What is left, in the order I would do it

### 1. The handwriting corpus — still the blocking item

**Nothing above has been seen to work on real handwriting.** All 555 tests
mock the model. The capture harness is built and it is one click, so the
excuse for not having a corpus is gone:

```powershell
$env:VERITY_CAPTURE_DIR = "backend/tests/transcription/samples/chemistry"
$env:VITE_CAPTURE = "1"
# start the backend and frontend, draw, type what you drew, press Capture Sample
```

Then measure:

```powershell
.\backend\venv\Scripts\python.exe backend\tests\transcription\run_chemistry_corpus.py
```

It prints the **fatal-failure rate** as the headline number — a confident
verdict on a misread drawing, or a wrong verdict on a correctly read one.
Target zero. Everything else is recoverable in the correction panel.

100 chemistry samples across three people is one evening. Do it before
believing any status in this file.

- [ ] 100 chemistry samples captured, ground-truthed, and run
- [ ] Fatal rate measured and stated
- [ ] Failures filed into `chemistry_failures.md`
- [ ] Demo problems chosen **from samples that passed**
- [ ] Specifically measure the R-group family before and after the wildcard fix

### 2. Run the live check once, end to end

Never yet run against a live model, because the ADC token expired mid-pass:

```powershell
gcloud auth application-default login
.\backend\venv\Scripts\python.exe backend\scripts\live_chemistry_check.py
```

It makes real calls across all six topics, asserts every generated hint is
leak-free, and asserts every level-2 example passed verification. It prints a
pass/fail table and exits non-zero on failure. **Run this before the demo.**
Until it has run once, "hints generate" is an untested claim.

- [ ] `live_chemistry_check.py` passes on all six topics
- [ ] p95 latency measured over WiFi rather than localhost, against the
      under-2s target

### 3. Smaller chemistry gaps

- [ ] **Cross-engine agreement suite.** Run the model path over every case the
      deterministic suite covers and fail on disagreement. This is what makes
      the hybrid safe, and it is not built.
- [ ] **Le Chatelier direction.** `wrong_direction` exists as an error category
      with hint text, but no judge emits it. Either build the judge or drop
      the category.
- [ ] **Redox problems open no session.** `topics.js` returns `null` from
      `session()` for oxidation state and cell potential, so hints there fall
      back to templates. `answer_vault.py` already has
      `vault_for_oxidation_state` and `vault_for_cell_potential`; they are
      simply not wired to an endpoint yet.
- [ ] **Isomer and reaction problems open no session** either, same fix.
- [ ] **Net ionic opens a balancing-shaped session**, so its vault holds the
      balanced equation rather than the net ionic one. `vault_for_net_ionic`
      exists and is unused.
- [ ] **Golden-path e2e smoke test.** One scripted flow through transcribe →
      check → all three hint levels, asserting the full contract. Catches
      schema drift between endpoints.
- [ ] **Per-category classifier tests.** For every chemistry error category,
      one canonical wrong step that must classify as exactly that category.

### 4. Frontend polish

- [x] `App.jsx` now coordinates the major modes while canvas input, math
      workflow, and panel details live in focused hooks/components. The CI
      line-count gate is active with a 260-line ceiling and an extraction-first
      failure message.
- [x] `canvas/render.js` owns `renderLineToPng`, including the recognition
      dark-ink normalization, crop bounds, scaling, and asynchronous PNG export.
- [x] Written chemistry uses the same row segmentation as math. Each readable
      row becomes an ordered editable step; editing/removing a row invalidates
      that row and downstream verdicts, while structure drawings remain one
      whole-page figure.
- [x] The structure preview keeps the RDKit SVG trust-boundary comment and
      requires an identity-based wrapper created only around RDKit endpoint
      responses before using `dangerouslySetInnerHTML`; matching object fields
      or copied SVG strings cannot forge that trust.

### 5. Not started at all

- [ ] Lewis structures, VSEPR, mechanism arrows — explicitly out of scope
- [ ] Gas laws, thermochemistry, kinetics — a seventh and eighth subject
- [ ] Everything in the math sections above. This pass was chemistry only.

---

## Deployment: how it works, in plain language

### The problem this solves

Running the app today means two terminals, a laptop that must stay awake, and
re-running `gcloud auth application-default login` whenever the token expires.
None of that survives contact with a demo.

### The shape of the answer

**One box, one link.**

The app needs Python 3.11, RDKit, SymPy, FastAPI, and Node to build the React
frontend. All of that was installed on a laptop over weeks. A fresh server in
a Google datacentre has none of it.

The `Dockerfile` is a **written recipe** for building a small computer from
scratch: start from clean Linux with Python 3.11, install these system
libraries, install these Python packages, build the React app, copy everything
in, run this command to start. Google reads the recipe, follows it once, and
freezes the result into an **image** — a snapshot of a whole working machine
with the app already installed. Running the app means booting a copy of that
snapshot, so it behaves identically every time, on any machine.

Docker does not need to be installed to deploy. Google builds the image in the
cloud from the recipe. Docker locally is only useful for testing an image
change in two minutes instead of five.

**This is also why the two-terminal problem disappears.** The recipe builds the
React app into plain files and places them next to the Python app, and one
Python process serves both. One box, one URL, and no CORS to configure.
`main.py` also treats `/api/check` and `/check` as the same endpoint, so the
frontend needs no build-time configuration and behaves identically in
development and in production.

### The authentication answer

This was listed above as "the one piece needing real research". It has a clean
answer.

`gcloud auth application-default login` exists because a laptop has no
identity of its own. **A Cloud Run service does.** Deployed into
`cs-sail-2b08`, the service runs as a service account that already exists in
that project, and the Google client libraries read that identity straight from
the metadata server. `transcription.py` already does the right thing; not one
line of application code changes.

- No `gcloud auth` command on the server, ever
- **No service-account JSON key** — nothing to download, store, rotate, or
  accidentally commit
- One IAM grant, `roles/aiplatform.user`, and it is done

This is also why Render, suggested in the hosting section above, is the wrong
choice despite its free tier: Render sits outside GCP, so it *requires* a
downloaded key file, which is exactly the thing worth avoiding.

Note that there are **two separate Google logins** on a developer laptop, and
they expire independently. `gcloud auth login` lets *you* run gcloud commands,
including deploying. `gcloud auth application-default login` lets the app
*running on your laptop* call Gemini. The deployed service needs neither.

### What "instances" means

An **instance** is one running copy of the frozen box.

- `--max-instances 1` — never run more than one copy. Two reasons, and the
  first is a correctness requirement rather than caution: problem sessions,
  meaning the answer vault and the level-3 budget, live in the serving
  process's memory. A second instance would hold its own separate set, and a
  hint request landing on the wrong one would silently fall back to the static
  template. It is also a hard ceiling on spend, since one box cannot run up a
  bill.
- `--min-instances 0` — when nobody is using it, shut the box down entirely.
  Free while idle. The cost is that the first request after a quiet spell
  waits a few seconds while a box boots. That is the "cold start", and it is
  the ordinary trade for "free when nobody is using it".
- `--min-instances 1` — always keep one box running. Instant for everyone, but
  billed around the clock whether anyone shows up or not. **This is the only
  setting here that charges while nothing is happening.** Turn it on the
  morning of the demo and off afterwards; `deploy.ps1` prints both commands.

### What it costs

| Thing | Cost |
|---|---|
| Building the image | Free tier, roughly 5 minutes per deploy |
| Storing the image | Pennies a month |
| Running, at min-instances 0 | Only while handling requests. The free tier covers roughly 50 hours of active CPU a month |
| Gemini calls | Fractions of a cent each — the main variable cost |
| min-instances 1 | The only thing that bills while idle |

Nothing here charges by the minute for merely existing. Idle is genuinely
free. Confirm current figures on Google's pricing page, which changes; the
orders of magnitude are what matter.

Because the billing account is shared across the whole programme, an
account-wide budget alert would notify fifty people and probably cannot be
created without permissions we have. Two alternatives that work at project
scope instead:

- [ ] A budget **scoped to `cs-sail-2b08`**, if billing permissions allow it
- [ ] A **daily quota cap on the Vertex AI API** for this project, which is a
      real circuit breaker rather than a notification
- Failing both: Billing → Reports, filtered to this project, checked
  occasionally. `--max-instances 1` already bounds the worst case.

### How to deploy

```powershell
gcloud auth login          # only when the session has expired
.\deploy.ps1
```

The script is idempotent. The first run does the one-time setup — enable APIs,
create the service account, grant the IAM role — and then deploys; every run
after that just deploys. It checks the exit code after every command and stops
at the first failure. An earlier version did not, and cheerfully printed a
success banner for a deploy that had failed at every step.

### Status of the deployment

**The image builds and the container runs correctly.** Verified locally: it
starts, serves `/health`, serves the frontend, and routes `/api/*` to the
right endpoints.

One real bug was found and fixed on the way. `python:3.11-slim` does not ship
`libexpat1`, which RDKit's drawing module needs, so the container crashed at
*import* time — taking down the whole service rather than one endpoint. The
Dockerfile now installs it along with the other system libraries RDKit links
against.

- [x] `Dockerfile`, `.dockerignore`, and `deploy.ps1` written
- [x] Single-process serving of both the frontend and the API
- [x] Image builds and the container starts clean
- [x] **`.\deploy.ps1` run to completion.** Aug 10. Service `verity-ai`,
      revision `verity-ai-00003-ts9`, at
      `https://verity-ai-389644353290.us-central1.run.app`
- [x] Live URL added to `README.md`
- [~] **Full pipeline tested on the hosted URL.** Verified live: `/health`,
      `/chemistry/topics`, `/check` (a wrong final step is flagged on the
      right line, `judged_by="deterministic"`), and `/transcribe` against a
      real rendered image, which returned `2x = 8` at high confidence. That
      last one is the one that mattered: **Vertex AI authenticates from the
      Cloud Run metadata server with no key file**, exactly as this section
      predicted. Not yet exercised on the hosted URL: the chemistry judges
      beyond the topic list, and any hint level. `live_chemistry_check.py`
      still has not been run and is still the honest gate
- [x] Frontend also on Vercel, at `https://verity-ai-lovat.vercel.app`, built
      from `frontend/` with `VITE_API_BASE_URL` pointing at the Cloud Run
      API. This is a second origin, so `CORS_ORIGINS` on the service now
      lists every Vercel alias. Cloud Run keeps serving its own copy of the
      frontend, so the single-origin deployment above still works untouched
- [x] **The Vercel link is the canonical one.**
      `https://verity-ai-lovat.vercel.app` is what goes in the README, the
      deck, and anything said out loud. The Cloud Run URL stays a working
      fallback and is not the address to hand anyone
- [ ] Optional: Firebase Hosting in front, for a `verity-ai.web.app` address
      rather than a Cloud Run hash. Ten minutes, free, and a much better link
      to say out loud at a demo. Do this instead of buying a domain before
      SAIL; buy one only if the product continues afterwards. **Largely
      superseded** by the Vercel address, which is already a speakable link

### "Failed to fetch" on Vercel, and the fix — Aug 11

Opening the app from the Vercel dashboard's Deployments tab loaded the page
and then failed every API call with `Failed to fetch`. Diagnosed by sending
preflights by hand against the live service:

| Origin | Preflight |
|---|---|
| `verity-ai-lovat.vercel.app` | 200, allowed |
| `verity-ai-git-main-akshitg19.vercel.app` | 400, blocked |
| `verity-ai-<hash>-akshitg19.vercel.app` | 400, blocked |

**Vercel gives every deployment its own hostname.** Listing origins by name
allowed exactly one of them, which is not a safety property, just a hostname
that drifts on every push. Nothing was wrong with the app; the browser was
refusing to send the request, and "Failed to fetch" is the only thing it is
permitted to tell JavaScript, which is why this looked like a mystery rather
than a configuration line.

Fixed with `CORS_ORIGIN_REGEX` in `main.py`, defaulting to
`https://verity-ai[a-z0-9-]*\.vercel\.app`, set by `deploy.ps1` so it
survives redeploys, and pinned by five tests in `tests/test_api.py`
including one asserting an unrelated origin is still refused.

**Requires a redeploy to take effect.** Until `.\deploy.ps1` runs, only
`verity-ai-lovat.vercel.app` works.

### Standing settings for a link that is always up — Aug 11

- `--min-instances 1`. The site is live the instant anyone opens it. At 0,
  the first request after an idle spell waits for a container to boot and
  import RDKit, which reads as broken to anyone who did not build it. This
  is the only setting that bills while idle
- `--cpu 2`, `--memory 2Gi`. One instance serves everybody, so three people
  writing at once means overlapping transcription, judging and hint
  generation in one process
- `--max-instances 1` **stays at 1**, and no amount of budget changes that.
  Sessions are in-process memory, so a second instance would silently serve
  static fallback hints to whoever landed on it. Raising it needs a shared
  session store first
- Nobody has ever run three sessions at once. Worth ten minutes before the
  demo rather than finding out in the room
- Vertex AI quota is shared across the whole `cs-sail-2b08` project, which
  is the programme's project, not ours. Unmeasured, and outside our control

### Deploying itself on a push — Aug 11

The gap nobody had written down: **Vercel redeploys the frontend on every
merge and Cloud Run did not.** So any pull request touching `backend/` was
live only if somebody remembered to run a script, and "the site is broken"
and "nobody ran the script" look identical from the outside. That is what
made this feel like a recurring bug rather than a missing step.

`cloudbuild.yaml` is now the single definition of a deploy, and `deploy.ps1`
submits it rather than carrying its own copy of the flags. Running the
script by hand and pushing to main therefore produce an identical revision.
Two copies of a deploy configuration drift silently until the day they
matter, so there is only one.

**One-time setup, and it needs a browser once.** The GitHub connection
cannot be made from the CLI:

1. <https://console.cloud.google.com/cloud-build/triggers?project=cs-sail-2b08>
2. Connect Repository, pick GitHub, authorise, choose `akshitg19/verity_ai`
3. Then, from a terminal:

```powershell
gcloud builds triggers create github `
    --name verity-ai-main `
    --region us-central1 `
    --repo-owner akshitg19 `
    --repo-name verity_ai `
    --branch-pattern "^main$" `
    --build-config cloudbuild.yaml `
    --substitutions _TAG='$SHORT_SHA'
```

After that, a merge to main deploys the backend by itself and nobody needs
`gcloud` on a laptop for anything.

- [ ] GitHub connected in the Cloud Build console
- [ ] Trigger created and seen to fire once
- [ ] Confirm the deployed revision matches the merge commit

### The shared-secret header — built Aug 11, off

`VERITY_API_SECRET` on the service and `VITE_API_SECRET` on the Vercel build.
When both are set to the same value, every API call must carry it in
`X-Verity-Key` or the request is a 401. Unset, which is how it ships, nothing
changes at all.

Deliberately not protected, and each for a reason that bites if forgotten:
`/health`, because Cloud Run probes it with no headers of ours and would kill
the revision; `OPTIONS`, because a preflight carries no custom headers by
definition and rejecting it makes the browser report a CORS failure instead
of the real one; and the frontend itself, which is served from the same
process and must stay reachable. `tests/test_api_secret.py` pins all three.

The protected set is built from the app's own routes rather than a hand
written list, so a new endpoint is covered the day it is added.

**What it is worth, plainly.** The frontend has to know the value to send it,
and the frontend is JavaScript delivered to a browser, so anyone who opens
developer tools can read it. It stops a crawler and a casually forwarded
link from spending Vertex AI quota on the shared programme project. It is
not authentication and must never be described as any. Real authentication
means accounts.

It lives in `cloudbuild.yaml` as the `_API_SECRET` substitution rather than
being applied by hand, because the deploy uses `--set-env-vars`, which
replaces the whole environment: a value set out of band would be wiped by the
next push. If it ever needs to be a real secret, move it to Secret Manager
and use `--set-secrets`, which is a separate flag and is not wiped.

- [ ] Decide whether to turn it on before the link goes anywhere public

### Known deployment caveats

- **Sessions are in-memory.** Fine at `--max-instances 1`. If that ever rises,
  sessions need a shared store or Cloud Run session affinity.
- **`/capture/chemistry` writes to disk**, and a container's filesystem is
  ephemeral. It is gated on `VERITY_CAPTURE_DIR`, so simply do not set that
  variable in production. Corpus capture is a local-machine activity anyway.
- **IUPAC naming needs Java**, which is deliberately not in the image: it adds
  roughly 200 MB and slows cold start. `judge/naming.py` reports `unsupported`
  cleanly without it. A commented three-line block in the Dockerfile enables
  it if naming is part of the demo.
- **The URL is public and unauthenticated.** Fine while only three people have
  an unguessable Cloud Run address, and `--max-instances 1` bounds the damage.
  If the link is ever posted anywhere, add a shared-secret header first.

---

# The student walkthrough — opened Aug 10

A running list, written while actually using the hosted app on a tablet as a
student would, rather than as the person who built it. **This section is
append-only and grows every session.** Items keep their numbers once written,
so "do 2.3 next" means something a week from now.

Everything here is front end unless it says otherwise, but do not treat that
as a boundary: several of these turn out to be backend or schema work once
you follow them down.

## How each item is written

**What happened** — the observed behaviour, in a student's words.
**Why** — the actual cause, with the file and line, or "not yet diagnosed"
where that is the honest answer.
**Fix** — the approach, at enough detail to start.
**Edge cases** — the things that will break the naive version. This is the
part worth reading twice; most of these items are easy to half-do.

Where an item is a guess rather than a diagnosis, it says so. Do not let a
guess in this file harden into a fact the way the topic tables did.

---

## 1. Theme: it is dark, and nobody asked for that

### 1.1 The app has no dark mode. The browser invented one.

**What happened.** Opened on a tablet in system dark mode. The whole app came
up dark, too dark, and unpleasant.

**Why.** This is the important finding, and it is not what it looks like.
**There is no dark mode in this codebase.** `theme.js` is entirely light —
`background: "#f7f6f2"`, `SURFACES.paper: "#faf8f2"` — and the string
`prefers-color-scheme` appears nowhere in `frontend/src`. Neither
`index.html` nor `index.css` declares `color-scheme`.

Chrome on Android and Samsung Internet both apply **automatic dark theming**
to pages that do not declare support for a scheme. So the tablet inverted a
carefully chosen light palette algorithmically. That is why it looks wrong
rather than merely dark: nothing in it was designed.

**Fix.** Two steps, and the first is one line and stops the bleeding today:

| Done | Task | Detail |
|------|---|---|
| [ ] | Declare the scheme | `<meta name="color-scheme" content="light">` in `index.html`, and `:root { color-scheme: light; }` in `index.css`. Auto-darkening stops immediately and the app looks as designed. Ship this before the next demo regardless of what happens with 1.2 |
| [ ] | `theme-color` meta | Colours the tablet browser chrome to match the app instead of leaving a mismatched bar above it |

**Edge case.** Once 1.2 lands, `color-scheme` must become `light dark` and
track the active theme, or the browser will fight the real dark mode the same
way it invented this one.

### 1.2 A real light/dark theme

**Fix.** `theme.js` currently exports flat objects consumed directly as inline
styles all over the app (`COLORS.surface` and friends appear in nearly every
component). Swapping palettes at runtime by re-exporting a different object
will not work, because inline styles are captured at render time by many
components that will not re-render.

The approach that actually works here, and is the smallest change to the way
the code is already written:

| Done | Task | Detail |
|------|---|---|
| [ ] | Palette to CSS custom properties | Emit every value in `theme.js` as a `--verity-*` custom property on `:root`, and change the exported objects to reference `var(--verity-surface)` etc. Every existing `COLORS.surface` call site keeps working untouched, and a theme switch becomes one attribute on `<html>` |
| [ ] | `data-theme` on the root | `light`, `dark`, and `system`. `system` follows `prefers-color-scheme` live via a `matchMedia` listener, not just at load |
| [ ] | Persist the choice | `localStorage`, read **before first paint** in a tiny inline script in `index.html`. Reading it in a `useEffect` gives a flash of the wrong theme on every load, which looks broken on a tablet |
| [ ] | Dark values for all four verdict styles | `VERDICT_STYLES` backgrounds are near-white tints (`#edf8f2`, `#fff0f0`). On dark they need re-picking, not darkening — and the four must stay distinguishable, since 4-outcome legibility is a product rule, not a preference |

**Edge cases, and these are the ones that will bite:**

- **The canvas is not CSS.** Ink is drawn with a hardcoded default of
  `#1f2926` (`useCanvas.js`, `drawStroke`). On a dark page that is nearly
  invisible. The paper surface and the ruled lines are drawn in canvas too.
- **The PNG sent to Gemini must not change.** `canvas/render.js` renders the
  line for recognition. If dark mode flips ink to white-on-dark and that
  reaches the model, recognition quality moves for a reason nobody will
  connect to a theme switch. **Force-normalise the exported PNG to dark ink
  on white regardless of theme**, and write that down where the next person
  will find it. This is already an open item elsewhere in this file; dark
  mode makes it urgent rather than tidy.
- **The RDKit structure preview will disappear.** `/chemistry/render` returns
  SVG with black strokes, injected via `dangerouslySetInnerHTML`. Black on a
  dark card is invisible. Either post-process the SVG to `currentColor` on
  the client, or have the endpoint take a colour. The client-side rewrite is
  preferable: it keeps the backend contract unchanged and the SVG is ours.
- **Highlighter colours** (item 4.1) are chosen against white paper. They
  need a second set for dark, or the paper stays light in both themes —
  which is a legitimate choice a real notes app makes, and worth considering.

### 1.3 Where the switch lives, and the hand tool

**What happened.** "What is this hand symbol? Maybe remove it and put dark
mode there." The toolbar is crowded and the hand is not obviously earning its
slot.

**Why the hand exists, and why removing it naively breaks the app.**
`CanvasSurface.jsx:47` sets `touchAction: activeTool === "scroll" ? "pan-y" :
"none"`. In pen mode the canvas swallows touch entirely, so **the hand tool
is currently the only way to scroll the page on a tablet.** Delete the button
and a student is trapped on one screen.

**Fix.** The hand slot can be freed, but the scroll problem has to be solved
first, and it is solvable cleanly:

| Done | Task | Detail |
|------|---|---|
| [ ] | Let touch scroll natively | Touch already never draws — `useCanvas.js:214` returns early for `pointerType === "touch"`. So `touch-action` can be `pan-y` at all times. Finger scrolls, stylus draws, which is exactly the Samsung Notes and iPad model the app is being measured against |
| [ ] | Remove the `preventDefault` on touch move | `handlePointerMove` calls `event.preventDefault()` for touch, which fights native scrolling. It is only needed to suppress the selection loupe while a pen is down |
| [ ] | Then retire the hand tool | Only after the two above are verified on a real tablet. Keep it behind a flag for one session in case palm rejection turns out worse than expected |
| [ ] | Put the theme control in that slot | A single icon that cycles or opens a small popover. Not a third row of chrome |

**Edge case.** Palm rejection. Today `touch-action: none` plus ignoring touch
means a resting palm does nothing at all. With `pan-y`, a resting palm may
scroll the page mid-stroke. Test with a hand actually resting on the tablet,
not with a fingertip. If it is a problem, suppress touch scrolling only while
a pen pointer is active, which is a narrow and testable rule.

### 1.4 The tab says "frontend"

**What happened.** Browser tab and any bookmark read `frontend`.

**Why.** `index.html` still has the Vite default `<title>frontend</title>`.

**Fix.** Title, description meta, an apple-touch-icon, and a real favicon —
which is item 3.2, since it needs the logo. Trivial, embarrassing on a
projector, and it is the first thing a judge sees when the tab is open.

---

## 2. The question should be written, not typed

This is the biggest item in this section and the most valuable. It is worth
reading in full before starting any of it.

### 2.1 What is wrong now

**What happened.** Wrote `N₂ + H₂ -> NH₃` on the notes page as the question,
then discovered the app expected the question typed into a panel field. The
grey `C3H8 + O2 -> CO2 + H2O` in that field is a **placeholder**
(`chemistry/topics.js:333-335`), not a value, so it reads as already filled.
The check silently never runs: `WrittenChemistrySteps.jsx:190` renders
"Fill in the question above first" and every row sits at "Waiting" forever.

**Why it matters beyond the bug.** A handwriting-first app that requires the
problem to be typed has a seam down the middle of it. The first and most
natural way to enter a question is to write it, exactly as on paper.

### 2.2 The interaction: a selection-style popover

**Fix.** When a line is finished and no question has been set for the current
problem, show a small floating menu anchored just above that line's ink —
the shape of the iOS text-selection menu (*Select All · Copy · Look Up*).

| Done | Task | Detail |
|------|---|---|
| [ ] | Floating action bar component | Anchored to a row's bounding box, which `inkModel.js` already tracks in `index.bounds`. Must flip below the line when the line is near the top of the page |
| [ ] | "Make this the question" as the primary action | Plus "This is my working" to dismiss. Two actions, not five |
| [ ] | Offer it on the first written line | The overwhelmingly common case: the first thing on a fresh page is the question |
| [ ] | Never cover the ink it refers to | Offset above the row, and re-anchor on scroll |
| [ ] | Dismiss on next pen-down | It must never be something to fight with. Writing again is the clearest "not now" a student can express |
| [ ] | Keyboard and screen-reader path | It is a button; give it a focus ring and a label |

### 2.3 Knowing where the question ends

**The hard part, and do not pretend otherwise.** A question can run to two or
three written lines. Committing to "the first row is the question" is wrong
often enough to be annoying.

| Done | Task | Detail |
|------|---|---|
| [ ] | Multi-row questions | Let the popover's target grow: after tapping "Make this the question", show "＋ add the next line too" until the student starts working |
| [ ] | The `?` marker idea | The suggested convention — a leading dot or `?` marks a question. Cheap to support: it is a string test on text we already transcribe, needing no new recognition. Worth building **as an accelerator, not as the only path**, since a student who does not know the convention must still succeed |
| [ ] | Never guess silently | If it is ambiguous, ask with the popover. A wrongly-chosen question is much worse than one extra tap — see 2.6 |

### 2.4 A second problem on the same page

**What happened.** "The next thing I write on the same page should also have
a lookup saying this is the first question."

| Done | Task | Detail |
|------|---|---|
| [ ] | Offer the popover again after a problem is answered | Once the current problem has a verdict on its last line, the next new row is a strong candidate for a new question |
| [ ] | Reuse the divider idea already in this file | "Problem separators" under Input and canvas quality: a long, roughly horizontal, low-variance stroke is a divider, not content. Combine the two — a divider is the clearest possible signal, and it is what students already draw |
| [ ] | One session per problem, not per page | Each new question opens a new `/chemistry/session`. The vault, terminal-step gate, and level-3 budget are all per problem, so this is required for correctness, not tidiness |
| [ ] | Show which problem is active | With two problems on a page, the student must be able to see which one a verdict belongs to |

### 2.5 Routing written ink into the right request

**Why this is not just a UI change.** The eleven chemistry endpoints take
different shapes: `reference_equation` for balancing, `target_smiles` for
structure, a numeric `task` plus named fields for stoichiometry and
solutions. A written question has to become one of those.

| Done | Task | Detail |
|------|---|---|
| [ ] | Question text to request shape, per topic | Balancing is easy: the transcribed string *is* `reference_equation`. Numeric topics are hard: `"What is the pH of 0.100 M acetic acid, Ka = 1.8e-5"` has to become `{task, concentration_m, ka}` |
| [ ] | Decide who parses | Either a small model call returning a structured object against the topic's schema, or keep typed fields for numeric topics and written questions for equation and structure topics. **The second is much cheaper and should probably ship first** |
| [ ] | Show what it understood, editably | Whatever is parsed out, render it back in the panel as an editable field. This is the existing correction affordance and it must not be lost |

### 2.6 The safety consequence, which is not optional

`answer_vault.py` builds the vault **from the problem statement**. This file
already says it, under the firewall's honest limitations:

> **A wrong problem statement breaks the vault.** If transcription misreads
> the problem, the vault holds the wrong answer, so redaction guards the
> wrong string and the terminal gate fires on the wrong line. The editable
> problem field is therefore load-bearing for safety now, not only for
> accuracy.

Reading the question off handwriting puts a recognition step in front of the
vault. That is a real increase in risk and it must be handled explicitly:

| Done | Task | Detail |
|------|---|---|
| [ ] | Confirm the question before opening a session | Show the transcribed question and require a confirm. One tap, and it is the only thing standing between a misread and a wrongly-guarded vault |
| [ ] | Low confidence pre-focuses the correction | `TranscribeResponse.confidence` already exists. On `low`, focus the field |
| [ ] | Re-open the session when the question is edited | A corrected question must rebuild the vault. A stale vault after a correction is the worst version of this bug, because everything looks fine |

### 2.7 Keep the typed field

Do not delete it. It is the fallback when recognition fails, it is how a
teacher sets a problem, and it is the only sane path for the numeric topics
until 2.5 is solved. **Demote it, do not remove it** — and fix the
placeholder that reads as a value (item 5.3) either way.

---

## 3. Design system: palette, logo, identity

**What happened.** "We need a colour palette and logo. Take inspiration from
a nice app. Very intuitive, very good looking, colour-scheme wise."

Noting honestly: the reference app named in conversation was not one I could
identify with confidence, so **bring three screenshots of what you like** and
we pick from those rather than guessing at a name.

| Done | Task | Detail |
|------|---|---|
| [ ] | Commit to one palette | `theme.js` already has a coherent light palette. The gap is not that it is bad, it is that it is unfinished: no dark values, no elevation scale, and per-component one-off colours creeping in |
| [ ] | Two accents, kept | `SUBJECTS.math` green and `SUBJECTS.chemistry` blue already make the two subjects read as different spaces. Keep that; it is working |
| [ ] | Contrast audit | Every text-on-surface pair to WCAG AA, in both themes. `COLORS.muted` on `SURFACES.paper` is the first one to check |
| [ ] | Logo | Currently a plain `V`. Needs a real mark, a favicon, and an apple-touch-icon for a tablet home screen |
| [ ] | One button vocabulary | Primary, secondary, ghost, destructive, and one disabled treatment. Right now buttons are styled inline at each call site — `WorkspaceToolbar.jsx:322` is a 300-character inline style — so nothing is consistent and nothing can be changed centrally |
| [ ] | Spacing and radius scale | `RADIUS` exists and is good. Add spacing, and use both instead of ad-hoc pixel values |

---

## 4. Notes-app parity

**What happened.** "It should resemble Samsung Notes or iPad Notes, with
every formatting option, colour option, highlighting, text option."

This is the bar the app is actually measured against, because it is what
students already use. Sub-items are roughly in value order.

| Done | Task | Detail |
|------|---|---|
| [ ] | Highlighter | A wide, low-opacity stroke drawn **beneath** ink. Needs a second canvas layer or a per-stroke composite mode, so it is not purely cosmetic. **Must never reach the recognition PNG** or it will wreck the read |
| [ ] | Pen widths and colours | Partly there — `penColor` and `penWidth` exist. Needs a real picker, not a menu |
| [ ] | Redo | Undo exists (`handleUndo`); there is no redo. The strokes array makes it cheap |
| [ ] | **The eraser** | Big enough to need its own item — see 4.1 below |
| [ ] | Lasso select, move, delete | The single biggest "feels like a real notes app" feature, and the largest job here |
| [ ] | Typed text boxes | Mentioned as "text option". Interacts with recognition: a typed box should bypass transcription entirely and go straight to the judge, which is a **feature**, not a complication |
| [ ] | Ruler and straight-line snap | Useful for reaction arrows and fraction bars |
| [ ] | Real pages, and page navigation | Already an open item under the notebook model |
| [ ] | Pressure and tilt | `getPoint` already captures `p`. Nothing uses it. Cheap richness for a stylus |

**Edge case running through all of it.** Every new ink kind — highlighter,
typed text, lasso-moved strokes — has to answer: *does this reach the
recognition PNG, and does moving it change which row it belongs to?* The row
index is identity for the whole recognition and verdict pipeline. Moving ink
across rows without updating that index will produce verdicts attached to the
wrong line, which is the failure class this product cannot afford.

### 4.1 The eraser should rub out, not delete objects

**What happened.** "Make the eraser more intuitive and easy to use, from a
small brush to a large eraser brush, and it doesn't erase by object but like
a real eraser, in a smooth way."

**Why it feels wrong today, and it is worse than it looks.** Two separate
problems:

1. **It deletes whole strokes.** `handlePointerDown` finds the last stroke
   within `DEFAULT_ERASER_RADIUS` of the touch point and removes *all* of it.
   Clip the tail of one long stroke and the entire stroke vanishes.
2. **It only fires on pointer-down.** The eraser branch lives in
   `handlePointerDown` and returns; there is no eraser case in
   `handlePointerMove` at all. So dragging the eraser across the page does
   nothing — a student must tap, lift, tap, lift, once per stroke. That is
   almost certainly what made it feel unusable, and it is the cheaper half to
   fix.

| Done | Task | Detail |
|------|---|---|
| [ ] | Erase continuously while dragging | An eraser case in `handlePointerMove`, sampling along the path between the last point and this one so a fast drag does not leave gaps. This alone makes it feel like an eraser |
| [ ] | Partial erase by splitting strokes | Remove the points inside the eraser disc and re-emit what remains as **one or two strokes**. A pure function over `(stroke, centre, radius) -> stroke[]`, so it is unit-testable without a canvas, like `geometry.js` |
| [ ] | Variable radius | A size control from a fine ~6px tip to a broad ~48px block, beside the pen width control. `DEFAULT_ERASER_RADIUS` (18) becomes the default, not the only value |
| [ ] | Live radius cursor | Draw the eraser circle on the overlay canvas, following the pointer, at the true current radius. A student cannot aim something invisible |
| [ ] | Keep object-erase as a second mode | Samsung Notes offers both, and stroke-erase is genuinely faster for removing a whole character. Default to the pixel eraser; offer "erase whole stroke" in the same popover as the size |

**Edge cases — the reason this is not a one-hour job:**

- **Splitting changes stroke identity.** `findStrokeRow` matches by object
  identity, and the new segments are new objects. The ink index must be
  rebuilt for the affected rows and their versions bumped, or recognition
  re-runs against stale ink — or worse, does not re-run at all.
- **A split can move ink between rows.** Erasing the middle of a long stroke
  can leave two fragments whose bounds resolve to different rows. That is
  correct behaviour, but it must go through the same row resolution as a new
  stroke, not be assumed to stay put.
- **Undo granularity.** One erase gesture must be one undo, not one per
  split segment. Undo is currently "drop the last stroke"
  (`handleUndo`), which cannot express this. **This forces a real undo
  stack of operations rather than a stroke list** — the right change anyway,
  and it is what unblocks redo.
- **Performance.** Point-level hit-testing against every stroke at pointer
  rate will drop frames on a tablet. `inkIndex.bounds` already gives a cheap
  rejection test per row; use it to consider only rows the eraser disc
  actually overlaps.
- **Erasing to nothing.** A stroke fully inside the disc yields zero
  segments. Make sure that removes it cleanly and does not leave an empty
  stroke in the index — `getStrokeBounds` returns `null` for a pointless
  stroke, and `addStrokeToInkIndex` would then fall back to a `NaN` row key.
- **The dirty-rect redraw.** Static ink is redrawn from a bounds rectangle.
  An erase gesture's dirty region is the swept path of the disc, not a single
  point, or trails will be left behind on screen.
- **Highlighter interaction.** Once highlighter exists (above), decide
  whether the eraser takes both layers or only ink. Samsung Notes erases
  both; that is probably right, but it should be a decision rather than an
  accident.

---

## 5. Panel and toolbar noise

### 5.1 Too much on screen at once

**What happened.** "So much text, so many things here left and right, things
we can't control."

| Done | Task | Detail |
|------|---|---|
| [ ] | Audit what is on screen before a student has done anything | Currently: subject toggle, topic strip, blurb, question dropdown, question field, per-step cards, a check button, and the toolbar. Most is irrelevant until there is ink |
| [ ] | Progressive disclosure | Show the canvas and a minimal toolbar. Reveal the panel when there is something to say |
| [ ] | Collapse the topic grid once chosen | Six tiles plus a blurb is a lot of permanent furniture for a choice made once |

### 5.2 Hints must be collapsed by default

**What happened, earlier in the project.** Feedback that on-screen help while
writing is "super disturbing".

| Done | Task | Detail |
|------|---|---|
| [ ] | Hints collapsed until asked for | Nothing from the hint ladder renders until the student opens it |
| [ ] | A quiet affordance | One unobtrusive control on a flagged line. Not a panel that grows on its own |
| [ ] | Never steal focus or move the canvas | Opening a hint must not reflow what is being written |
| [ ] | Remember the preference per session | A student who closes hints wants them closed |

### 5.3 The placeholder that reads as a filled value

**Fix.** Style placeholders so they cannot be mistaken for content, mark the
field required, and — the real fix — say *what* is missing on the disabled
button rather than the generic "Fill in the question above first".

### 5.4 "Waiting" that waits forever

**What happened.** Two rows sat at "Waiting" indefinitely with no explanation.

**Fix.** "Waiting" must distinguish *not yet checked* from *cannot be checked
because X*. A state that cannot advance has to say why, on the row itself.
Related: an idle timer fires recognition 1500ms after the last stroke
(`useCanvas.js`), so "nothing happened" is sometimes just that timer — a
visible in-progress state would remove the ambiguity entirely.

---

## 6. Carried over — found this session, not yet fixed

These came out of the deployment and live-testing work, and they are not
front end.

| Done | Item | Detail |
|------|---|---|
| [ ] | **Hint level 2 always falls back** | Tested live on two different problems: both returned `source: "fallback"`. The worked-example verification loop rejects every generated example, so the level-2 parallel problem — the feature people will remember — never reaches a student. The safeguard is working; the generator is not. **Highest-value backend item here** |
| [ ] | Hint latency is 5-6s, and once 19s | Against an under-2s target elsewhere in this file. Needs measuring properly, then a real loading state, then pre-warming level 1 when a line is flagged |
| [ ] | A confident misread was observed | `/chemistry/transcribe-text` read a rendered `C3H8 + 5O2 -> 3CO2 + 4H2O` back as `... + 4H2`, dropping the O, and reported `confidence: high`. One sample, rendered text rather than handwriting, so it is a signal and not a measurement — but a confident wrong read is the fatal category in this file's own taxonomy |
| [ ] | Redox, isomer, and reaction problems open no session | Already listed above; re-confirmed live. Hints there fall back to templates no matter what else is fixed |
| [ ] | The corpus is still the blocking item | One hand-drawn equation surfaced two bugs that 555 backend and 67 frontend tests did not, because every one of them mocks the model and none touch segmentation of real ink |

---

---

# Walkthrough, session 2 (Aug 10, after the theme and eraser pass)

## 7. Hints: where they live and what they do

### 7.1 Level 2 is fixed. What was actually wrong.

**Done.** Recorded because the shape of the failure matters more than the fix.

Level 2 never rendered on any topic. Three independent bugs, each of which
rejected a *correct* example:

1. Balancing verification parsed the whole step line as an equation, so
   "The balanced equation is 4Fe + 3O2 -> 2Fe2O3" failed to parse.
2. Numeric verification demanded every numeric line be a quantity our solver
   produced, so an algebraic intermediate like `x^2 = 4.5e-6` threw the
   example away.
3. Redaction blocked a bare "3", because a balancing vault holds
   coefficients and every worked example about every reaction contains one.

**All three shipped because the suite tested only the rejection path.** The
instruction in this file, to test rejection harder than acceptance, was taken
far enough that acceptance was never tested at all. The lesson generalises:
for any filter, test that the good case survives it.

Fix (3) relaxes firewall mechanism 2. It is narrow, it is flagged in
`check_outbound`, and it has its own tests: bare integers below ten, worked
examples only.

### 7.2 The hint should come to the student, not the other way round

**What happened.** "Once it highlights it red, it should pop up: stuck, get a
hint." Right now a flagged line sits there and the hint control is somewhere
else entirely.

| Done | Task | Detail |
|------|---|---|
| [ ] | Offer the hint at the flagged line | When a line goes red, surface the offer next to that line, the way the question popover already anchors to a row. `inkIndex.bounds` gives the anchor |
| [ ] | Do not auto-open | Offer, never expand on its own. The complaint about the panel being distracting applies double to something that appears while writing |
| [ ] | One offer at a time | With several wrong lines, offer at the first wrong one only. It is already the line the product is opinionated about |

### 7.3 The right panel should be dismissible

**What happened.** "I don't want this right panel visible all the time when
I'm writing because it's distracting. It could be there if the user wants it,
but there should be an option to put it in and out."

| Done | Task | Detail |
|------|---|---|
| [ ] | Collapse and expand the feedback panel | A persistent edge control. Remember the state |
| [ ] | Auto-reveal only on a verdict | A result is worth interrupting for; an empty panel is not |
| [ ] | Give the canvas the space back | The canvas is sized from `getCanvasDisplaySize`, which reserves 360px for the panel unconditionally. Collapsing has to widen the page, not leave a gap |
| [ ] | Hints open in the panel | Level 1, 2 and 3 render there rather than inline, so the writing surface stays clean |

### 7.4 The button was cut in half on a Samsung tablet

**What happened.** Half the "Stuck? Get a hint" button was off screen, and it
could not be scrolled or zoomed to.

**Not yet diagnosed.** Likely candidates, in order: the panel is
`position: fixed` with a `max-height` and no internal scroll, so anything past
the fold is unreachable; the mobile breakpoint is 700px and a tablet in
landscape is wider than that, so it gets the desktop layout in a space that
cannot hold it; and `user-select: none` plus `touch-action: none` on the
shell suppress the zoom a student would otherwise use to escape.

| Done | Task | Detail |
|------|---|---|
| [ ] | Reproduce at the real viewport | Samsung Tab S9, both orientations, before changing anything |
| [ ] | Make the panel scroll internally | `overflow-y: auto` on the panel body, so nothing inside it can be unreachable |
| [ ] | Revisit the 700px breakpoint | A tablet is not a desktop. Probably wants its own layout rather than one of the two existing ones |
| [ ] | Never trap the student | If content overflows and cannot scroll, that is a bug class, not one button. Worth a check that every panel has a scroll container |

### 7.5 Level 2 should be shown, not just listed

**What happened.** "Like Brainly or Chegg. Not a video, a simulation of the
question. It reframes it, does the balancing, and shows the 2 moving from
NH3 to N2, with arrows and animations."

The content is now correct and verified. This is about rendering it.

| Done | Task | Detail |
|------|---|---|
| [ ] | Render the example as a sequence, not a list | One step at a time with a next control, so the student watches it happen rather than reading a paragraph of five lines |
| [ ] | Show the coefficient changing | For balancing, animate the coefficient appearing on the species it belongs to, and highlight the atom count on each side as it comes into balance. This is the single most explanatory thing available and it is plain DOM or SVG, no new dependency |
| [ ] | Atom tally beside the equation | A small left-vs-right count per element, updating per step. It is what a teacher writes in the margin |
| [ ] | Respect reduced motion | `prefers-reduced-motion` turns animation into a static final state |
| [ ] | Numeric topics get the same treatment | Highlight the quantity that changed per line rather than animating structure |

### 7.6 Level 3 has to work the step

**What happened.** "Level 3 should work through the problem step by step. It
should work through the step, not the answer." And separately, "if it gives
the answer at the end of the day, it's fine. We can think about not giving
the answer afterwards."

**This is a product decision, not an implementation detail, and the two
sentences point in different directions. It is blocked on an answer, not on
code.** See the question raised at the end of this section.

What is true today: level 3 generates live and works on multi-step topics.
On balancing it always refuses, because a balancing session reports
`total_steps: 1`, so every step is the terminal step and the gate fires
correctly. That is why level 3 looks broken when tested on balancing.

| Done | Task | Detail |
|------|---|---|
| [ ] | Decide the answer policy | Blocking. See below |
| [ ] | Give balancing real steps | A balancing problem is one step to the vault and several to a student: balance this element, then that one. Until the vault models that, level 3 can never demonstrate on the topic most likely to be demoed |
| [ ] | Then animate level 3 too | Same renderer as 7.5, applied to the student's own problem |

### 7.7 Level 1 tone

**What happened.** "Hint one was okay. It could be a bit less AI."

| Done | Task | Detail |
|------|---|---|
| [ ] | Rewrite the level 1 prompt register | Shorter sentences, second person, no throat-clearing. "You balanced the hydrogens but the nitrogens no longer match" beats "The student attempted to balance the equation by adding coefficients, but..." |
| [ ] | Never say "the student" | It is talking *to* them |
| [ ] | No em dashes anywhere in generated text | A standing rule for this repo, and it applies to prompt text because the model copies the register it is given |

---

## 8. Notebook: folders and files

**Decided:** math and chemistry stay separate spaces.

| Done | Task | Detail |
|------|---|---|
| [ ] | Real folders | Create, rename, delete, inside a subject. Not the two fixed buckets there are now |
| [ ] | Real files | Explicit "new note", renameable, deletable, not created implicitly by switching subject |
| [ ] | Pages inside a note | A thumbnail strip. "Page 1 of 1 +" is the thing that reads as unfinished |
| [ ] | Follow the conventions of the apps students already use | Long press or right click for rename, duplicate, delete. Nothing invented |
| [ ] | Keep local persistence | Strokes already serialise |
| [ ] | Do not break row identity | The recognition queue and verdict map key off row integers per page. Moving or reordering pages must not silently repoint verdicts |

---

## 9. Landing page

**What happened.** A public front page describing the product and the stack,
with "Try for free", and separate entries into math and chemistry.

| Done | Task | Detail |
|------|---|---|
| [ ] | Add routing | There is none today. `/`, `/math`, `/chemistry` |
| [ ] | SPA fallback in both places it is served | A Vercel rewrite, and Cloud Run's `StaticFiles(html=True)` mount will not serve `/math` either. A deep link that 404s on one host and works on the other is worse than neither |
| [ ] | The three product properties as the spine | Live on the page, precise about where, teaches up to the answer. This file already says to use those three in that order everywhere rather than inventing a framing per surface |
| [ ] | Show it working | A short loop of real ink being read and marked beats any paragraph |
| [ ] | Honest status | Do not claim corpus numbers we have not measured |
| [ ] | Keep the entry fast | The landing page must not pull the canvas bundle. Route-level code splitting |

---

---

# Measured, Aug 10: the first real numbers in this file

Everything above was written against assumptions. This section is the first
thing here backed by a measurement, taken by
`backend/scripts/student_walkthrough.py` against the deployed service.

Thirty questions, ten each for balancing, solutions and stoichiometry. Per
question it does what a student does: open the problem, submit the correct
working and expect `valid`, submit a plausible wrong line and expect
`invalid`, then ask for hints 1, 2 and 3.

## The headline

| | First run | After the fix |
|---|---|---|
| Level 1 generated | 27/30 (90%) | 27/30 (90%) |
| Level 2 generated | 24/30 (80%) | 24/30 (80%) |
| Level 3 generated | 29/30 (97%) | 27/30 (90%) |
| Em dashes in hints | 0 | 0 |
| **Fatal judging failures** | **3** | **0** |

Before this pass, level 2 generated on **zero** questions on every topic.

The second run is the one to quote: **thirty out of thirty correct answers
accepted, thirty out of thirty wrong answers caught.** The level-3 dip from
97% to 90% is generation variance on three stoichiometry questions, not a
regression from the fix, which touched only the numeric matcher.

Where the floor still shows: level 1 and level 2 both fall back on the three
strong-acid and strong-base pH questions, in both runs, which is a pattern
rather than variance and is worth chasing next. Level 2 also falls back on
the buffer and on two others that differ between runs, which is variance.

## The fatal three, and why they matter more than the rest

`strong acid pH`, `strong base pH` and `weak base pH` each accepted an answer
that was wrong. That is the top row of this file's own failure taxonomy, the
one with a stated target of zero, because being told you are right when you
are not is what ends a classroom trial.

The cause was not recognition and not the model. A pH answer group
deliberately holds pH, pOH, `[H+]` and `[OH-]` so a student may state
whichever form the question asked for. `WorkedSolution.match` used a label to
disambiguate but never to reject, so when a known label disagreed on value it
fell through to matching any step in the group. A student writing `pH = 12.00`
on a problem whose pH is `2.00` matched the pOH, which is 12.00, and was told
they were correct.

**The suite did not catch this and could not have.** All 576 tests mock the
model, and this bug lives in the judge, not the model. What found it was
running the thing the way a person runs it. That is the argument for the
harness, and the argument for the handwriting corpus that is still not built:
the same class of bug is presumably sitting in the recognition stage, and
nothing in CI will ever find it.

## Standing gates

- [ ] Run `student_walkthrough.py` before any demo, and after any change to
      a judge, a vault, or a prompt
- [ ] Fatal failures must be zero. Not low, zero
- [ ] Level 2 generation above 80%. It is the rung students should live on
- [ ] Extend to the other three chemistry topics: redox, structure, organic
- [ ] Extend to math, which has no equivalent harness at all

---

# The withholding decision, Aug 10

Recorded here because it contradicts this file and `CLAUDE.md`, and a
contradiction that is not written down becomes a surprise later.

**Decision: functionality first, withholding second.** Every question gets
all three hint levels, and level 3 works the student's step through to the
end, including on the last step of a problem.

What that turned off, all behind one flag, `hints.WITHHOLD_ANSWER`:

- the terminal-step gate (firewall mechanism 3)
- the per-problem level-3 budget (firewall mechanism 4)
- the answer check inside redaction, for level 3 only

What is still on:

- the answer vault is still built for every problem
- redaction still runs on levels 1 and 2 in full
- sessions still track their budget, they just do not enforce it
- every test of every mechanism still exists and still passes, pinned to the
  flag being on

Re-arming is one line, or `VERITY_WITHHOLD_ANSWER=1` in the environment.

The honest cost: **the guarantee at the top of this file is currently not in
force.** "The answer is never stated" is not true of level 3 today. Anyone
writing a deck slide, a README paragraph or a demo script should say what the
product does now, not what this section used to promise. The reason the gate
fired so often was itself a bug worth knowing about: a balancing session
reports `total_steps: 1`, so every step was the terminal step and level 3 was
unreachable on the topic most likely to be demoed.

- [ ] Decide before any public claim whether withholding comes back on
- [ ] If it does, give balancing real steps first, or the gate makes level 3
      useless there again

---

## Suggested order

Not a schedule, just the order that gets the most value per hour.

1. **1.1** — one line, stops the app looking broken on every tablet in the room.
2. **5.3 and 5.4** — the trap that already cost a real test session.
2b. **4.1, first two rows only** — erase-on-drag and a visible radius. Small,
    and it turns the eraser from broken into usable without the stroke-splitting
    work behind it.
3. **1.3** — free the hand slot by letting touch scroll; needed before any toolbar work.
4. **1.2** — the real theme, once 1.3 has settled the toolbar.
5. **2.2 → 2.3 → 2.6** — the written question, for equation topics only at first. Ship it narrow.
6. **6, level 2 hints** — backend, parallelisable with all of the above.
7. **3** — palette and logo, once the surfaces have stopped moving.
8. **4** — notes parity, largest and least urgent for a demo.
9. **2.5** — numeric-topic question parsing, the hardest and most deferrable piece.

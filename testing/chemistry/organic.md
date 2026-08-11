# Chemistry: organic groups, naming and reactions

Topic `organic`, endpoints `/chemistry/functional-group`, `/chemistry/name`,
`/chemistry/reaction`. Judges are `backend/judge/chemistry.py` (eight SMARTS
patterns) and `judge/naming.py`.

This is the only chemistry topic where a model gets a vote, and only on
reaction prediction. Groups and naming are deterministic.

Ten questions: eight groups, and the two paths that are not deterministic.

---

## Functional groups

Draw a structure, and the question is whether it contains the named group. The
whole value of this judge is in the **exclusions**, so every question below is
a near miss rather than an obvious no.

| # | Group asked for | Draw | Expected | The trap |
|---|---|---|---|---|
| 1 | alcohol | Ethanol `CCO` | valid | |
| 2 | alcohol | Acetic acid `CC(=O)O` | invalid, `wrong_functional_group` | An acid has an OH and is not an alcohol |
| 3 | ester | Methyl acetate `CC(=O)OC` | valid | |
| 4 | ester | Diethyl ether `CCOC` | invalid | An ether is not an ester |
| 5 | ether | `CCOC` | valid | |
| 6 | ether | Methyl acetate `CC(=O)OC` | invalid | An ester contains a C-O-C and is still not an ether |
| 7 | ketone | Acetone `CC(=O)C` | valid | |
| 8 | ketone | Acetaldehyde `CC=O` | invalid | An aldehyde is not a ketone |
| 9 | amine | Ethylamine `CCN` | valid | |
| 10 | amine | Acetamide `CC(=O)N` | invalid | An amide is not an amine |

All ten confirmed against the judge. The reverse of each also holds: aldehyde
rejects the ketone, amide rejects the amine.

**Send the id, never the label.** `carboxylic_acid` works and
`carboxylic acid` raises a 422. That is the right behaviour for a caller
mistake, and it means the UI must never put a human-readable label on the
wire.

## Naming

`/chemistry/name` needs OPSIN, which needs Java, which is deliberately absent
from the container. In production this reports `unsupported`, and locally it
depends on the machine.

| # | Question | Expected in production | Expected locally with Java |
|---|---|---|---|
| 11 | Name ethanol | `unsupported` | valid for `CCO` |

`unsupported` is our limitation, not a student mistake, so the only thing worth
checking here is that it does not render red. Do that check in production, not
locally, because locally it may quietly work and prove nothing.

## Reactions

`/chemistry/reaction` is the one model-judged path in chemistry. Every verdict
carries `judged_by`, and the UI must never show a model verdict as a proven
one. Two things to look at rather than a right answer:

| # | What to check |
|---|---|
| 12 | The verdict is labelled as model-judged, visibly, in the UI |
| 13 | Asking twice on the same line and disagreeing produces "confirm this line" rather than a confident verdict |

**Result:**

- Ran on:
- Verdicts matched:
- `judged_by` visible on the reaction verdict:
- Naming rendered as a limitation, not a mistake:
- Notes:

---

## Findings

1. **The eight group patterns and their exclusions all hold.** This is the
   most solid judge in the repo after balancing, and the exclusions are what
   make it worth having: an ester counting as an ether would be the kind of
   error a teacher notices immediately.
2. **Naming is a production-only test.** It passes locally on a machine with
   Java and reports `unsupported` in the container, so testing it locally
   proves nothing about what a student sees.
3. **The reaction path has not been exercised by hand at all.** It is the only
   place a model decides, which makes it the one that most needs a human
   looking at it, and it is the least tested. Worth its own session.

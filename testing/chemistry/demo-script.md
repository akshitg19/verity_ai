# Demo script: the exact questions to write on stage

Written Aug 12, the night before the demo. One section per feature, in the
order they get demoed. Every line here was run through the real judge before
it was written down, so the expected verdict is measured, not guessed.

**How to read a row.** "Write" is what goes on the tablet in that row of the
page. "Verdict" is what the judge actually returned for that exact string.

---

## 1. Moles and stoichiometry: molar mass

Topic **Moles & stoichiometry**, problem type **Molar mass**.

### The page

The formula goes in the labelled slot at the top of the page (the box that
says **Formula**). Everything written below the slot is working, and every
row down there is judged on its own.

### The question

> **Aluminium sulfate, Al2(SO4)3. Find its molar mass.**

Chosen because it is the one that separates students: the `3` outside the
bracket has to multiply the S *and* the four O, and forgetting that is the
classic mistake. It also exercises the parenthesis path in the formula
parser, which is worth showing.

Say the question out loud, write the formula in the slot, and work below it.

### The correct run (all four lines return valid)

| Row | Write | Verdict | Matched |
|---|---|---|---|
| Slot | `Al2(SO4)3` | — | the Formula slot |
| 1 | `Al = 53.96` | valid | mass of Al |
| 2 | `S = 96.20` | valid | mass of S |
| 3 | `O = 191.99` | valid | mass of O |
| 4 | `342.15 g/mol` | valid | **molar mass, the answer** |

The three intermediate lines are not decoration. They show the judge accepts
a student's working, not only their final number, which is the thing that
separates this from an answer checker.

### The deliberate mistake (line 4 flags, and this is the one to demo)

Write the first three lines exactly as above, then instead of line 4:

| Row | Write | Verdict |
|---|---|---|
| 4 | `149.04 g/mol` | **invalid, `wrong_value`** |

That number is what you get by reading `Al2(SO4)3` as two Al plus one S plus
four O, so the `3` outside the bracket got dropped. It is the single most
common molar-mass error and it is worth naming out loud when the line goes
red.

Then take the hint ladder on that line: level 1 diagnoses, level 2 works a
parallel problem end to end, level 3 walks their own step.

### Backup question, if something goes wrong with the first

> **Calcium nitrate, Ca(NO3)2.**

| Write | Verdict |
|---|---|
| `Ca = 40.08` | valid |
| `N = 28.01` | valid |
| `O = 95.99` | valid |
| `164.09 g/mol` | valid, the answer |
| `102.09 g/mol` | invalid, the same dropped-bracket error |

### Rules for writing it, all verified against the judge

**One number per line.** This is the one that will trip the demo if it is
forgotten. A row containing two numbers comes back `parse_error`:

- `2(26.98) + 96.20 + 191.99` → **parse_error**, "contains more than one
  number; write the result alone"

**Arithmetic is fine as long as the result is alone after the `=`.** The
judge splits on the equals sign and reads only what follows it:

- `2 x 26.98 = 53.96` → **valid**
- `3 x 32.06 = 96.18` → **valid**

**Units are optional, but a wrong one is flagged.**

- `342.15 g/mol` → valid
- `342.15` → valid, no unit at all is accepted
- `342.2` → valid (4 sig figs)
- `342` → valid (3 sig figs; the tolerance widens to what was written)
- `53.96 g` → **invalid, `wrong_unit`.** Grams is a mass, not a molar mass
- `342.15 gmol-1` → **parse_error.** The `-1` reads as a second number.
  Known bug, avoid the notation on stage and write `g/mol`

**Labels are optional and help.** `M = 342.15`, `MM = 342.15 g/mol`, and a
bare `342.15` all match. Element symbols work as labels too, which is why
`Al = 53.96` matches the aluminium contribution specifically.

**Do not write a hydrate.** The formula parser has no `·` support, so
`CuSO4·5H2O` will not parse. Nothing in this demo needs one.

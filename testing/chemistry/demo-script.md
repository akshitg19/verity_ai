# Demo script: the exact questions to write on stage

Written Aug 12, the night before the demo. One section per feature, in the
order they get demoed. Every verdict here was produced by the real judge, and
the molar mass flow was driven through the real UI in a browser.

---

## 1. Moles and stoichiometry: molar mass

Topic **Moles & stoichiometry**, problem type **Molar mass**.

### What the page looks like

Three zones, drawn as boxes on the notes:

```
Molar mass:  [ write the formula here ]

Your working, laid out however you like
[                                               ]
[   grows as you write                          ]
[                                               ]

ANSWER
[                    ]  g/mol
```

- The **formula box** fills the question by itself. Write in it, nothing to tap.
- The **working box** is never read and never judged. Multiply, divide, cross
  things out, lay it out however you like. Nothing in there can be marked wrong.
- The **answer box** is the only thing checked. The `g/mol` sits outside it, so
  write the number and nothing else.

### The question

> **Aluminium sulfate, Al2(SO4)3. Find its molar mass.**

Chosen because the `3` outside the bracket has to multiply the S *and* the four
O, and forgetting that is the classic mistake. It also exercises the
parenthesis path in the formula parser.

### The correct run

| Where | Write |
|---|---|
| Formula box | `Al2(SO4)3` |
| Working | whatever you like, e.g. `2 x 26.98 = 53.96`, `3 x 32.06 = 96.18`, `12 x 16.00 = 192.0` |
| Answer box | `342.15` |

Answer box goes green, panel says **Correct / That is the answer.**

### The two mistakes to demo, in this order

**1. Stopping one step early.** Answer box: `53.96`

> **Not the answer.** "That is a quantity from the working, not the final answer"

This is the one worth pausing on. That number is real, it is the mass of the
aluminium, and **until today the app marked it correct**, because the judge
accepted any quantity from the working. It knows which line is the answer now,
so it catches it. This is the top row of our own failure taxonomy: being told
you are right when you are not.

The same bug had a twin in the pH topic, found the same day by running every
concept against the live model: 0.010 M HCl has a pH of 2.00 and a pOH of
12.00, and the answer box accepted either. Both are fixed, both have tests,
and section 25 of `final_tasks.md` has the numbers. Worth having ready if
someone asks how we know the judge is right.

### If asked "does it work on every topic?"

Yes, and it has been measured rather than asserted. Thirty concepts, two
questions each, all three hint levels, against the real model:

- every correct answer accepted and every wrong one caught, 60 out of 60
- level 3 generated on all 60
- level 1 on 54, level 2 on 51

The remaining gap is level 2 falling back to a static hint on nine
questions, which is a worse hint and never a wrong one.

**2. The dropped bracket.** Answer box: `149.04`

> **Not the answer.** "No quantity in the correct working has this value"

That is `Al2(SO4)3` read as two Al plus one S plus four O. Note the message is
*different* from the first one, on purpose: stopping early and inventing a
number are different mistakes.

Then take the hint ladder on that line: level 1 diagnoses, level 2 works a
parallel problem end to end, level 3 walks the step.

### Backup question

> **Calcium nitrate, Ca(NO3)2.**

Answer `164.09`. The dropped-bracket error gives `102.09`. The stop-early
error gives `40.08` (the calcium) or `95.99` (the oxygen).

### What to write in the answer box, verified

- `342.15` → correct. **The unit is printed outside the box, so do not write it.**
- `342.2` → correct (4 sig figs; tolerance follows what you wrote)
- `342` → correct (3 sig figs)
- `342.15 g` → **wrong unit.** Grams is a mass, not a molar mass
- One number only. Working belongs in the working box

### Two things to avoid on stage

- **No hydrates.** The formula parser has no support for the `·` in
  `CuSO4·5H2O`. Nothing in this demo needs one.
- **Don't write `gmol-1`** anywhere the judge reads. The `-1` parses as a
  second number. Not an issue if you leave the answer box unitless, which is
  what the printed `g/mol` is there for.

### If recognition misreads the formula

The **Formula** field in the right-hand panel is the escape hatch. Fix it
there and the check re-runs. That field is a correction surface now, not the
way in.

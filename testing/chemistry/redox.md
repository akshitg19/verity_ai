# Chemistry: redox and electrochemistry

Topic `redox`, three endpoints: `/chemistry/balance` for half-reactions,
`/chemistry/oxidation-state`, and `/chemistry/cell-potential`. Judges are
`backend/judge/redox.py` and `chemistry_equations.py`.

Ten questions: six oxidation states, two cells, two half-reactions. The
half-reactions are the only place in the product where charge is checked, so
they matter out of proportion to their number.

---

## Oxidation states

Type the species and the element, write the state.

| # | Species | Element | Answer | Also try | Expected |
|---|---|---|---|---|---|
| 1 | `Cr2O7^2-` | Cr | **+6** | `+7` | invalid, `wrong_oxidation_state` |
| 2 | `MnO4^-` | Mn | **+7** | `+6` | invalid |
| 3 | `H2SO4` | S | **+6** | `+4` | invalid |
| 4 | `NaH` | H | **-1** | `+1` | invalid |
| 5 | `Fe2O3` | Fe | **+3** | `+2` | invalid |
| 6 | `O2` | O | **0** | `-2` | invalid |

Question 4 is the one worth writing by hand twice. Hydrogen is +1 everywhere
except in a metal hydride, and a student who has learned the rule as "hydrogen
is always +1" writes `+1` with confidence. It is also a good hint test: level 1
should name the rule, not the number.

Question 6 tests the other half of the same habit: an element on its own is
zero, and students who have just learned that oxygen is usually -2 write -2.

Both `+6` and `6` are accepted. A bare `6` for a negative state is not the same
thing, so question 4 is also the sign test.

## Cell potentials

| # | Cathode | Anode | Answer | Also try | Expected |
|---|---|---|---|---|---|
| 7 | `Cu^2+ + 2e- -> Cu` | `Zn^2+ + 2e- -> Zn` | **1.10 V** | `0.42` | invalid |
| 8 | `Ag^+ + e- -> Ag` | `Cu^2+ + 2e- -> Cu` | **0.46 V** | | valid |

The Daniell cell is the one in every textbook, so question 7 is the demo one.
Question 8 is worth having because the electron counts differ between the two
half-reactions, and the standard potential does *not* get multiplied, which is
the trap.

## Half-reactions

These go through the balancing endpoint. See
`equations-and-balancing.md` question 3 for the permanganate one, which is
already written up. The second:

| # | Half-reaction to balance | Answer |
|---|---|---|
| 9 | `Cr2O7^2- + H^+ + e- -> Cr^3+ + H2O` | **Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O** |
| 10 | Same, written with 7 electrons | invalid, `unbalanced_charge` |

Confirmed: the balanced form comes back valid, and an electron count that is
off by one is a charge error with every atom already correct.

**Result:**

- Ran on:
- Transcription read superscript charges correctly:
- Verdicts matched:
- Hints 1, 2, 3:
- Notes:

---

## Findings

1. **Superscript charges are the transcription risk here, not the chemistry.**
   `Cr2O7^2-` written by hand is a subscript, a superscript, and a sign in one
   token. Nothing in the judge can help if the reading is wrong, so this topic
   is the strongest argument for the handwriting corpus in `final_tasks.md`.
2. **The oxidation state judge takes a bare number or a signed one.** `+6` and
   `6` both pass. Decide whether an unsigned answer should pass for a negative
   state, which is question 4.

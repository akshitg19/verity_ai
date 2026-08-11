# Chemistry: formulas, moles and stoichiometry

Topic `stoichiometry`, endpoint `/chemistry/stoichiometry`, judge
`backend/judge/stoichiometry.py`. Deterministic: it solves the problem exactly
and compares each written line against the quantities in that solution.

Ten questions, one per task the judge supports, so no two test the same code
path. Every expected verdict below came from running the judge, not from
reading it. The same ten are locked in
`backend/tests/test_chemistry_walkthrough.py`.

**How the judge decides, and why it matters for what you write.** A line is
valid when it matches *any* quantity in the correct working, not only the final
answer. That is right for a middle line and wrong for the last one. See the
finding at the bottom before you call a green tick a pass.

**Answer format.** Units are optional and both `0.25` and `0.250 M` pass.
Rounding is tolerated to the sig figs a student would write.

---

| # | Question | Type in | Answer | Also try | Expected |
|---|---|---|---|---|---|
| 1 | Molar mass of sulfuric acid | task `molar_mass`, formula `H2SO4` | **98.08** | `98.1` | valid, valid |
| | | | | `96.06` | invalid, `wrong_value` |
| 2 | Percent by mass of oxygen in water | `percent_composition`, `H2O`, element `O` | **88.81 %** | `11.19` (the hydrogen) | invalid, `wrong_value` |
| 3 | Moles in 36.0 g of water | `moles_from_mass`, `H2O`, 36.0 g | **2.00 mol** | `2.5` | invalid, `wrong_value` |
| 4 | Mass of 0.500 mol of salt | `mass_from_moles`, `NaCl`, 0.5 mol | **29.22 g** | `58.44` (the molar mass) | **valid**, see finding 1 |
| 5 | Particles in 2.00 mol | `particles_from_moles`, `H2O`, 2.0 | **1.204e24** | `6.022e23` | invalid, `wrong_value` |
| 6 | Empirical formula from 40.0 % C, 6.7 % H, 53.3 % O | `empirical_formula` | **CH2O** | `C2H4O2` | invalid, `wrong_formula` |
| 7 | Molecular formula, same percentages, molar mass 180 | `molecular_formula`, target 180 | **C6H12O6** | `CH2O` | invalid, `wrong_formula` |
| 8 | Limiting reagent, 28 g N2 with 4 g H2 | `limiting_reagent`, `N2 + 3H2 -> 2NH3` | **H2** | `N2` | invalid, `wrong_species` |
| 9 | Theoretical yield of NH3, 28 g N2 with 6 g H2 | `theoretical_yield`, product `NH3` | **33.79 g** | `34.06` (2 mol exactly) | invalid, `wrong_value` |
| 10 | Percent yield when 30.0 g is collected | `percent_yield`, actual 30.0 g | **88.78 %** | `89.5` | invalid, `wrong_value` |

Questions 8 to 10 run on from each other, which is worth doing in one sitting:
it is the sequence a real problem set uses, and it is the one place where an
error in the first line should not cascade into the next two.

**Result:**

- Ran on:
- Transcription read every line correctly:
- Verdicts matched:
- Hints 1, 2, 3:
- Notes:

---

## Findings

1. **Any quantity from the working is accepted, including on the answer
   line.** Question 4 asks for a mass and `58.44`, the molar mass, is marked
   correct. Question 9 accepts the molar mass of ammonia. The judge asks "is
   this one of the numbers in the correct working", which is exactly right for
   a middle line and wrong for the last one. Nothing marks a line as the final
   answer. Shared with the solutions topic, where it is worse. See
   `solutions.md` finding 1.
2. **A wrong intermediate is invisible if it never gets written.** The judge
   only sees the lines a student writes, so a student who does the whole thing
   in their head and writes one number gets one verdict. That is correct
   behaviour, and it means the hint quality on a single-line answer is worth
   checking separately from the multi-line case.
3. **`limiting_reagent` answers with a species, not a number**, and its wrong
   answer comes back as `wrong_species`. Check that the UI does not render
   that as `wrong_value`, since the two want different hints.

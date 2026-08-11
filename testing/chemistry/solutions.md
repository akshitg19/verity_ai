# Chemistry: solutions, acids and bases

Topic `solutions`, endpoint `/chemistry/solutions`, judge
`backend/judge/solutions.py`. Deterministic arithmetic on known constants, and
`final_tasks.md` calls it the highest value per effort in chemistry, so it is
the topic most likely to carry a demo.

Ten questions across dilution, pH, buffers and titration. Verdicts below came
from running the judge. Locked in `backend/tests/test_chemistry_walkthrough.py`.

---

| # | Question | Type in | Answer | Also try | Expected |
|---|---|---|---|---|---|
| 1 | Molarity of 0.5 mol in 2.0 L | `molarity`, moles 0.5, volume 2.0 | **0.25 M** | `1.0` | invalid, `wrong_value` |
| 2 | Molarity of 58.44 g NaCl in 1.0 L | `molarity`, formula `NaCl`, mass 58.44 | **1.00 M** | | valid |
| 3 | Dilute 50 mL of 6.0 M to 500 mL | `dilution` | **0.60 M** | `0.06` | invalid, `wrong_value` |
| 4 | pH when [H+] is 1.0e-3 | `ph_from_concentration` | **3.00** | `11` (the pOH) | **valid**, see finding 1 |
| 5 | pH of 0.010 M HCl | `strong_acid_ph` | **2.00** | `12` (the pOH) | **valid**, see finding 1 |
| 6 | pH of 0.010 M NaOH | `strong_base_ph` | **12.00** | `2` (the pOH) | **valid**, see finding 1 |
| 7 | pH of 0.10 M acetic acid, Ka 1.8e-5 | `weak_acid_ph` | **2.87** | `4.74` (the pKa) | **valid**, see finding 1 |
| 8 | Buffer pH, equal acid and base, pKa 4.74 | `buffer_ph` | **4.74** | `7.00` | invalid, `wrong_value` |
| 9 | Titration: 25.0 mL of 0.100 M into 20.0 mL | `titration_concentration` | **0.125 M** | `0.08` | invalid, `wrong_value` |
| 10 | Percent by mass, 5.0 g in 105.0 g | `percent_by_mass` | **4.76 %** | `5.0` | invalid, `wrong_value` |

Questions 4 to 7 are the important run. They are the four ways a student
reaches a pH, and they are also where the judge is weakest.

**Result:**

- Ran on:
- Transcription read every line correctly:
- Verdicts matched:
- Hints 1, 2, 3:
- Notes:

---

## Findings

1. **The pOH is accepted as the answer to a pH question.** Confirmed on
   questions 4, 5, 6 and 8, and the pKa is accepted on question 7. The judge
   marks a line valid when it matches any quantity in the correct working, and
   the pOH is in the working of every pH problem. A student who forgets to
   subtract from 14, which is the single most common mistake in this topic,
   gets a green tick.

   This is the same shape as the balancing hole in
   `equations-and-balancing.md`: the engine checks the line against the
   *problem's working* rather than against *what was asked for*. It is the
   more serious of the two, because in balancing the student at least wrote a
   balanced equation, and here they wrote the wrong number.

   The fix is not to narrow the quantity set, which would break honest middle
   lines. It is to know which line is the answer. `xfail` recorded in
   `test_chemistry_walkthrough.py::test_the_poh_should_not_answer_a_ph_question`.

2. **Units are optional and ignored.** `0.25`, `0.250 M` and `0.250 mol/L` all
   pass. Fine for a first pass, and worth deciding on: a chemistry teacher
   marks a bare number down.

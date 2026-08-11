# Chemistry: equations and balancing

Topic `balancing`, endpoint `/chemistry/balance`, judge
`backend/judge/chemistry_equations.py`. Deterministic: the judge parses both
sides into atom counts and a net charge and compares them. It never asks a
model whether a line is right.

Target is ten questions. Five are written up below, chosen so that no two test
the same thing: different reaction types, and a different kind of student
mistake in each. Questions 6 to 10 are listed as gaps at the bottom.

**The judge only emits four outcomes here**: `unbalanced_atoms`,
`unbalanced_charge`, `parse_error`, `unsupported`. The first two are student
mistakes. The last two are our limitations and must never be rendered as the
student getting it wrong.

The expected column below was produced by running each line through the real
judge, not by reading the code. `backend/tests/test_balancing_walkthrough.py`
holds the same five questions as automated tests, so if the judge changes,
that file fails before this sheet goes stale.

How to run one: chemistry page, subject **Equations & balancing**, type
**Balance the equation**, put the unbalanced equation in the problem field,
then handwrite each working line.

---

## Q1. Combustion of propane

**Type into the problem field:** `C3H8 + O2 -> CO2 + H2O`

**Correct answer:** `C3H8 + 5O2 -> 3CO2 + 4H2O`

**What is being tested:** the standard multi-element balance where oxygen is
left until last. The deliberate mistake is a **dropped coefficient on one
species**, which is the most common real error: the student balances carbon and
oxygen, then miscounts hydrogen.

Write these lines in order:

| # | Write by hand | Expected verdict | Expected message |
|---|---|---|---|
| 1 | `C3H8 + O2 -> 3CO2 + H2O` | invalid, `unbalanced_atoms` | Atom counts differ for: H, O |
| 2 | `C3H8 + 5O2 -> 3CO2 + 3H2O` | invalid, `unbalanced_atoms` | Atom counts differ for: H, O |
| 3 | `C3H8 + 5O2 -> 3CO2 + 4H2O` | valid | |

Watch for: the message must not mention **C**, because carbon is right from
line 1 onward. Line 2 is one coefficient from the answer, so it is the terminal
step, which is where level 3 used to refuse and currently does not.

**Hint check on line 2.** Level 1 should name hydrogen and say what to compare.
Level 2 should be a different equation worked all the way through. Level 3
should walk their own line without printing `4H2O`.

**Result:**

- Ran on:
- Transcription read every line correctly:
- Verdicts matched:
- Hint 1:
- Hint 2:
- Hint 3:
- Notes:

---

## Q2. Precipitation with polyatomic ions

**Type into the problem field:** `Ca(NO3)2 + Na3PO4 -> Ca3(PO4)2 + NaNO3`

**Correct answer:** `3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 6NaNO3`

**What is being tested:** parentheses and polyatomic groups, both in the
handwriting and in the parser. The deliberate mistake is **a coefficient that
was not distributed through the group**: the student counts one nitrate per
formula unit instead of two, so three elements break at once.

| # | Write by hand | Expected verdict | Expected message |
|---|---|---|---|
| 1 | `3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 3NaNO3` | invalid, `unbalanced_atoms` | Atom counts differ for: N, Na, O |
| 2 | `3Ca(NO3)2 + 2Na3PO4 -> Ca3(PO4)2 + 6NaNO3` | valid | |

Watch for: whether the handwritten parentheses and the subscript after the
closing bracket survive transcription. This is the question most likely to fail
at reading rather than at judging. Also watch whether the hint treats the
nitrate as one unit or talks about N and O separately; a hint that says "count
the nitrates" is the good one.

**Result:**

- Ran on:
- Transcription read every line correctly:
- Verdicts matched:
- Hint 1:
- Hint 2:
- Hint 3:
- Notes:

---

## Q3. Permanganate half-reaction in acid

**Type into the problem field:** `MnO4^- + H^+ + e- -> Mn^2+ + H2O`

**Correct answer:** `MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O`

**What is being tested:** the charge path, which no other question reaches. The
deliberate mistake is **the wrong number of electrons**: every atom balances
and the line is still wrong. Nothing that only counts atoms can catch this.

| # | Write by hand | Expected verdict | Expected message |
|---|---|---|---|
| 1 | `MnO4^- + 8H^+ + 3e- -> Mn^2+ + 4H2O` | invalid, `unbalanced_charge` | Net charge differs: 4 on the left, 2 on the right |
| 2 | `MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O` | valid | |

Watch for: the verdict must say charge, not atoms. If it says atoms, the
student goes off to recount oxygens that were never wrong. Also check the
superscript charges survive handwriting: `Mn^2+` written as `Mn2+` still parses,
but `MnO4-` inside an equation is ambiguous with a term separator, so this is
worth writing carefully and seeing what comes back.

**Result:**

- Ran on:
- Transcription read every line correctly:
- Verdicts matched:
- Hint 1:
- Hint 2:
- Hint 3:
- Notes:

---

## Q4. Subscript changed instead of a coefficient

**Type into the problem field:** `H2 + O2 -> H2O`

**Correct answer:** `2H2 + O2 -> 2H2O`

**What is being tested:** this is a probe, not a pass. The deliberate mistake is
the classic one every teacher warns about: **balancing by editing a subscript**,
which changes the substance. The student writes hydrogen peroxide instead of
water, and it balances.

| # | Write by hand | Expected verdict today | Should be |
|---|---|---|---|
| 1 | `H2 + O2 -> H2O2` | **valid** | flagged: that is not the product in the question |
| 2 | `2H2 + O2 -> 2H2O` | valid | valid |

Confirmed against the judge: line 1 comes back valid. The reference equation is
passed to the judge but only parsed to check the problem is well formed, so
nothing compares the student's species against the question's. Any balanced
equation passes, whatever it is an equation for.

If line 1 comes back valid in the app too, that is a **finding, not a pass**.
Do not put this question in the demo until it is fixed.

**Result:**

- Ran on:
- Transcription read every line correctly:
- Verdict on line 1:
- Notes:

---

## Q5. Fractional coefficient, then doubled

**Type into the problem field:** `C2H6 + O2 -> CO2 + H2O`

**Correct answer:** `2C2H6 + 7O2 -> 4CO2 + 6H2O`

**What is being tested:** also a probe. Balancing combustion with a half
coefficient and then doubling through is how the method is taught, so the first
line here is **correct chemistry that the parser cannot read**.

| # | Write by hand | Expected verdict today | Should be |
|---|---|---|---|
| 1 | `C2H6 + 3.5O2 -> 2CO2 + 3H2O` | `parse_error` | valid |
| 2 | `2C2H6 + 7O2 -> 4CO2 + 6H2O` | valid | valid |

Confirmed against the judge: `could not read '.5O2' as a formula`.

The thing to watch in the app is not the verdict, it is the **rendering**. A
`parse_error` is our limitation. It must not be styled or worded as the student
being wrong, and it must not be counted as the first wrong line. Check the row
colour and the wording against a real `unbalanced_atoms` row from Q1.

**Result:**

- Ran on:
- Line 1 rendered as a limitation, not a mistake:
- Verdict on line 2:
- Notes:

---

## Findings so far

Recorded from running the judge directly, before any handwriting. Each of these
needs a decision, and none of them is a transcription problem.

1. **A balanced equation for a different reaction is accepted.** Q4. The
   student's species are never compared to the reference equation. This is the
   one that would embarrass us in front of a teacher, because editing
   subscripts is the exact habit balancing homework exists to break.
2. **A legitimate fractional coefficient is a parse error.** Q5. Half
   coefficients are standard method for combustion, and refusing them pushes
   the student off the path their textbook taught.
3. **A balanced multiple of the answer is accepted.** `4C3H8 + 20O2 -> 12CO2 +
   16H2O` comes back valid, and `coefficient_distance` reduces before comparing
   so it reads as zero steps from the answer. Most teachers want lowest whole
   numbers. Decide whether that is a verdict, a nudge, or nothing.
4. **Parse error text is written for a developer.** An all-caps `AL` from
   transcription produces `unknown element 'A' in 'AL'`. A student needs
   something closer to "there is no element AL, did you mean Al".

## Q6 to Q10

Chosen to keep covering new ground rather than more of the same. Verdicts
confirmed against the judge; hint behaviour still to be checked by hand.

### Q6. Net ionic equation

The other endpoint on this topic, and it was completely untested.

**Type into the problem field:** `AgNO3 + NaCl -> AgCl + NaNO3`, type **Net
ionic equation**.

| Write | Expected |
|---|---|
| `Ag^+ + Cl^- -> AgCl` | valid |
| `AgNO3 + NaCl -> AgCl + NaNO3` (the molecular equation again) | invalid, `wrong_species`, "the species on this line are not the ones that react" |

### Q7. Neutralisation, net ionic

**Problem:** `HCl + NaOH -> NaCl + H2O`. **Answer:** `H^+ + OH^- -> H2O`.
Confirmed valid. Worth having because the spectator ions are on both sides and
the product is one molecule, so the reduction is more dramatic than Q6.

### Q8. Several wrong lines in a row

**Problem:** `C3H8 + O2 -> CO2 + H2O` again, but balance oxygen first, which
forces you to come back and redo it.

| Write | Expected |
|---|---|
| `C3H8 + 5O2 -> CO2 + H2O` | invalid, atoms differ for C, H |
| `C3H8 + 5O2 -> 3CO2 + H2O` | invalid, atoms differ for H, O |
| `C3H8 + 5O2 -> 3CO2 + 4H2O` | valid |

The thing being tested is not the verdicts, it is the flagging rule: **a wrong
line is flagged once and gently**, and the line after it is judged on its own
rather than against the wrong line before it. Confirmed at the judge level in
`test_q1_wrong_line_does_not_poison_the_line_after_it`. Check what the page
looks like with two red rows in a row.

### Q9. Dichromate half-reaction in acid

**Problem:** `Cr2O7^2- + H^+ + e- -> Cr^3+ + H2O`
**Answer:** `Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O`

A second pass through the charge path with different ions and a coefficient on
the product. Writing `7e-` instead of `6e-` gives `unbalanced_charge` with
every atom already correct.

### Q10. Already correct on line one

**Problem:** `Fe + O2 -> Fe2O3`. Write `4Fe + 3O2 -> 2Fe2O3` and nothing else.

Expected: valid immediately, nothing flagged, no hint offered, and the hint
ladder should not be inviting. A student who gets it right first time is the
case least often tested and the one a teacher will try first.

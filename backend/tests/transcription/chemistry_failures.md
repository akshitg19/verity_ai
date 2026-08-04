# Structure recognition failure log

The chemistry counterpart to `failures.md`. Same discipline: every real
drawing that comes back wrong gets a row here before the prompt is touched,
and a prompt change must cite the rows it fixes and must not regress the
ones already passing.

Format: file | drawn | expected SMILES | actual | notes

Recognition is the highest-risk stage in the product, so treat this log as
the evidence base for whether hand-drawn chemistry is demo-ready. The
editable SMILES correction panel is the safety net; this log is how we find
out how often a student would need it.

## What to capture for each sample

- The PNG itself, in `samples/chemistry/` alongside the math samples.
- What was drawn, in words ("skeletal butan-2-one, carbonyl on C2").
- The expected SMILES, canonicalised with RDKit so alternative spellings of
  the same structure do not read as failures.
- The raw model output, before `_clean` ran, when the failure is a
  formatting one rather than a chemistry one.

A sample is only a real failure if the returned SMILES is a *different
molecule*, not merely a different spelling of the same one. Check with
`Chem.CanonSmiles(a) == Chem.CanonSmiles(b)` before logging a row.

## Samples

_No real drawings tested yet. The prompt is written but unproven against
handwriting: everything below the line is what to watch for first, based on
the patterns the math log already established._

| file | drawn | expected | actual | notes |
|---|---|---|---|---|
| | | | | |

## Patterns to watch for

Carried over from the math failure log, since they are properties of the
paper and the model rather than of algebra:

1. **Ruled-line confusion.** Printed ruling lines were misread as `=` and
   `-` in the math samples. A ruling line running through a skeletal
   structure is a strong candidate to be read as a bond. The prompt warns
   against this explicitly; confirm whether the warning holds.
2. **Non-deterministic wrapping.** The same math image came back with and
   without `$...$` across runs even at temperature 0. Expect the same for
   code fences around SMILES. `_clean` strips them, but log it if it
   happens, because it signals the prompt is not being followed exactly.
3. **Degradation on cramped or small drawings.** Math accuracy fell off
   sharply on both. A crowded ring system is the chemistry equivalent.

Chemistry-specific things to check that have no math analogue:

4. **Implicit hydrogens.** A skeletal drawing leaves carbons and hydrogens
   implicit. Does the model add explicit `[CH3]` style atoms, and does that
   change the canonical form?
5. **Aromatic versus Kekulé.** `c1ccccc1` and `C1=CC=CC=C1` are the same
   molecule and must not be logged as failures. A drawn ring with an inner
   circle versus alternating double bonds may return either.
6. **Ring closure digits.** A misplaced ring-closure number produces a
   valid SMILES for the wrong molecule, which is the most dangerous failure
   mode here: it will not show up as a parse error, only as a silently
   wrong structure.
7. **Stereochemistry.** Wedge and dash bonds carry stereochemistry that the
   judge treats as part of the structure. If the model ignores wedges, a
   correct drawing will read as a mismatch.

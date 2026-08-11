# Chemistry: molecular structure and bonding

Topic `structure`, endpoints `/chemistry/check` and `/chemistry/isomer`, judge
`backend/judge/chemistry.py` on RDKit canonical SMILES.

This is the topic `final_tasks.md` calls the highest-risk piece in the repo,
because the input is a hand-drawn structure rather than writing. The judge is
solid; the reading is the question. Ten questions, and for this topic the
result you are recording is mostly **did it read the drawing**, not **did it
judge it**.

Draw each structure. The panel shows the SMILES it read and renders it back as
a picture, so check the picture before checking the verdict.

---

| # | Draw this | Target | Expected | What it tests |
|---|---|---|---|---|
| 1 | Ethanol | `CCO` | valid | The simplest possible read |
| 2 | Ethanol drawn right to left | `CCO` | valid | `OCC` is the same molecule |
| 3 | Ethanol with the OH branched | `CCO` | valid | `C(C)O` is the same again |
| 4 | Propane | `CCO` | invalid, `structure_mismatch` | A different molecule, cleanly rejected |
| 5 | Benzene as alternating double bonds | `c1ccccc1` | valid | Kekulé and aromatic are one molecule |
| 6 | Cyclohexane | `c1ccccc1` | invalid, `structure_mismatch` | The ring is right, the bonds are not |
| 7 | Acetic acid | `CC(=O)O` | valid | Carbonyl plus hydroxyl read together |
| 8 | Acetic acid drawn from the OH end | `CC(=O)O` | valid | `OC(=O)C` |
| 9 | Isobutane | `CC(C)C` | valid | A branch point |
| 10 | Butane against an isobutane target | `CC(C)C` | invalid, `structure_mismatch` | Same formula, different structure |

## Isomers

Endpoint `/chemistry/isomer`, type `constitutional`, reference `CCCC`.

| Draw | Expected | Why |
|---|---|---|
| Isobutane `CC(C)C` | valid | Same formula, different connectivity |
| Butane `CCCC` again | invalid, `structure_mismatch`, "this is the reference redrawn" | Not an isomer of itself |
| Pentane `CCCCC` | invalid, `wrong_formula` | An isomer must keep the formula |

Confirmed: those two rejections carry **different** error types, which is
right. "You drew the same thing" and "you drew a different compound" are
different mistakes and want different hints. Check the UI keeps them apart.

**Result:**

- Ran on:
- The picture it drew back matched what I drew:
- Verdicts matched:
- Hints 1, 2, 3:
- Notes:

---

## Findings

1. **The judge is not the risk here.** Every one of these behaves exactly as
   it should, including the two aromatic forms of benzene and both drawings of
   acetic acid. Anything that goes wrong in this topic during a demo will be
   the drawing being read wrong, and the render-back is the mitigation that
   already exists.
2. **Record the SMILES it read for every drawing.** That is the corpus
   `final_tasks.md` asks for, and this topic is where it is worth collecting
   even by hand.

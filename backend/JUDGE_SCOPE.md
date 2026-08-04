# Judge MVP scope

The `/check` API keeps the field name `latex` for backward compatibility, but
the current judge expects plain-text math, not LaTeX. Examples include
`3(x - 4) = 2x + 5`, `x = 17`, and `7 + 5`.

## Supported input

- One-variable linear equations with rational coefficients
- Rational-number arithmetic without variables
- Equivalent rearrangements that preserve the equation's solution set

## Outside the MVP

The judge reports these inputs as `unsupported` rather than trying to grade
them:

- Equations with more than one variable
- Exponents and nonlinear expressions such as `x^2 = 4` or `x(x + 1) = 2`
- Scientific notation such as `1e6`
- Variables in denominators, such as `1/x = 2`
- Functions, inequalities, systems of equations, and other advanced notation

Malformed text that cannot be parsed is reported separately as `parse_error`.

## Verdict status meanings

- `valid`: the step is mathematically equivalent to the previous valid line.
- `invalid`: the judge supports and understands the step, but it contains a
  mathematical mistake. Only this status can set `first_wrong_line`.
- `unsupported`: the input is understandable enough to identify it as outside
  the current product scope.
- `parse_error`: the input is malformed or could not be read as math.

`unsupported` and `parse_error` are capability/input-quality outcomes, not
evidence that the student made a mathematical mistake. If the problem itself
has either status, `/check` returns it in `problem_error` and leaves `verdicts`
empty.

## Chemistry MVP scope

`POST /chemistry/check` deterministically compares each student SMILES string
with a target SMILES structure using RDKit. It is deliberately a molecular
structure-equivalence exercise, not a chemistry-step or reaction judge.

Supported structures are single connected molecules composed of common organic
atoms (`C`, `N`, `O`, `S`, `P`, `F`, `Cl`, `Br`, and `I`) with single, double,
triple, or aromatic bonds. Formal charge and stereochemistry, when present,
are part of the structure and must match. Equivalent alternative SMILES
spellings are accepted.

The endpoint returns:

- `valid` when a submitted structure is equivalent to the target;
- `invalid` with `structure_mismatch` when both structures are supported but
  differ;
- `parse_error` for malformed SMILES; and
- `unsupported` for valid SMILES outside this narrow scope, including salts
  and other disconnected structures, metals, atom maps, wildcards, isotopes,
  reactions, and unsupported bond types.

The target is never returned to the caller, so a verdict cannot reveal the
answer structure.

## Functional group scope

`POST /chemistry/functional-group` asks whether a submitted structure contains
a named functional group, rather than whether it matches one exact molecule.
The `target_group` is a name, not a SMILES; the supported names are `ester`,
`ether`, `alcohol`, `ketone`, `aldehyde`, `carboxylic_acid`, `amine`, and
`amide`. Parsing and the supported-structure scope are shared with
`/chemistry/check`, so the same salts, metals, isotopes, and reaction SMILES
are reported as `unsupported` here too.

A supported structure that does not contain the group is `invalid` with
`wrong_functional_group`. An unrecognised group name is a caller error and
returns HTTP 422 rather than a verdict, since it is not a student mistake.

The patterns deliberately distinguish confusable groups: an ester is not
counted as an ether, an amide is not counted as an amine, and a carboxylic
acid is counted as neither an alcohol nor a ketone.

## Equation balancing scope

`POST /chemistry/balance` checks whether each submitted equation balances. It
parses formulas arithmetically and does no structural chemistry, so it accepts
any element symbol from the periodic table rather than only the organic subset
above.

Supported notation: stoichiometric coefficients, nested parenthesised groups
such as `(NH4)2SO4`, state symbols `(s)`, `(l)`, `(g)`, and `(aq)`, which are
stripped, ionic charges written with a caret such as `Fe^3+` or `SO4^2-`, and
electrons written `e-`. The separator may be `->`, `=`, `=>`, `→`, `⟶`, `⇌`,
or `<=>`.

Inside an equation, an ionic charge must use the caret form, because a bare
`+` cannot be told apart from a term separator. `parse_formula` alone still
reads bare forms such as `Ca2+`.

A line is `valid` when both sides hold the same count of every element and the
same net charge. Atom counts are compared first, so a line wrong in both ways
is reported as `unbalanced_atoms` rather than `unbalanced_charge`. A
half-reaction whose atoms all balance and whose electron count is wrong is
`unbalanced_charge`. Text that is not a readable equation, including an
unknown element symbol, is `parse_error`.

The reference equation is used only to report a malformed problem. A step is
judged on its own arithmetic, so an equation that balances but describes a
different reaction than the reference is currently accepted.

## Still outside this MVP

Handwriting-to-structure recognition, chemical naming, Lewis structures,
stoichiometry and molar mass, and reaction mechanisms.

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from judge.net_ionic import (
    NetIonicJudge,
    dissociates,
    is_soluble,
    net_ionic_equation,
    split_into_ions,
)
from schemas import ChemistryEquationStep


judge = NetIonicJudge()


def check(molecular: str, *equations: str):
    steps = [
        ChemistryEquationStep(line_number=index + 1, equation=value)
        for index, value in enumerate(equations)
    ]
    return judge.check(molecular, steps)


# ---------------------------------------------------------------------------
# Splitting salts into ions
# ---------------------------------------------------------------------------


def test_a_simple_salt_splits_one_to_one():
    cation, cation_count, anion, anion_count = split_into_ions("NaCl")

    assert (cation.formula, cation_count) == ("Na", 1)
    assert (anion.formula, anion_count) == ("Cl", 1)


def test_charge_balance_sets_the_counts():
    cation, cation_count, anion, anion_count = split_into_ions("CaCl2")

    assert (cation.formula, cation_count) == ("Ca", 1)
    assert (anion.formula, anion_count) == ("Cl", 2)


def test_a_polyatomic_ion_is_matched_by_atoms_not_by_spelling():
    """Ca(NO3)2 and CaN2O6 are the same salt written two ways."""
    assert split_into_ions("Ca(NO3)2")[2].formula == "NO3"
    assert split_into_ions("CaN2O6")[2].formula == "NO3"


def test_ammonium_sulfate_splits_correctly():
    cation, cation_count, anion, anion_count = split_into_ions("(NH4)2SO4")

    assert (cation.formula, cation_count) == ("NH4", 2)
    assert (anion.formula, anion_count) == ("SO4", 1)


def test_a_molecular_species_does_not_split():
    assert split_into_ions("H2O") is None
    assert split_into_ions("CO2") is None


# ---------------------------------------------------------------------------
# Solubility rules, in priority order
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "formula,soluble",
    [
        ("NaCl", True),
        ("KNO3", True),
        ("(NH4)2SO4", True),
        ("AgCl", False),
        ("PbI2", False),
        ("BaSO4", False),
        ("CaCO3", False),
        ("Na2CO3", True),
        ("Ba(OH)2", True),
        ("Fe(OH)3", False),
    ],
)
def test_solubility_rules(formula, soluble):
    assert is_soluble(formula) is soluble


def test_a_strong_acid_dissociates_and_a_weak_one_does_not():
    assert dissociates("HCl") is True
    assert dissociates("H2O") is False


# ---------------------------------------------------------------------------
# Net ionic equations
# ---------------------------------------------------------------------------


def test_a_precipitation_reaction():
    result = net_ionic_equation("AgNO3 + NaCl -> AgCl + NaNO3")

    assert result.net_ionic == "Ag^+ + Cl^- -> AgCl"
    assert sorted(result.spectator_ions) == ["NO3^-", "Na^+"]


def test_a_neutralisation_reaction():
    result = net_ionic_equation("HCl + NaOH -> NaCl + H2O")

    assert result.net_ionic == "H^+ + OH^- -> H2O"


def test_coefficients_survive_into_the_net_ionic_equation():
    result = net_ionic_equation("Pb(NO3)2 + KI -> PbI2 + KNO3")

    assert result.net_ionic == "Pb^2+ + 2I^- -> PbI2"


def test_a_gas_forming_reaction_keeps_the_molecular_products():
    result = net_ionic_equation("Na2CO3 + HCl -> NaCl + H2O + CO2")

    assert "CO2" in result.net_ionic
    assert "Na^+" in result.spectator_ions


def test_the_complete_ionic_equation_is_kept_separately():
    result = net_ionic_equation("AgNO3 + NaCl -> AgCl + NaNO3")

    assert "Na^+" in result.complete_ionic
    assert "NO3^-" in result.complete_ionic


# ---------------------------------------------------------------------------
# Judging
# ---------------------------------------------------------------------------


def test_the_correct_net_ionic_equation_is_accepted():
    verdicts = check("AgNO3 + NaCl -> AgCl + NaNO3", "Ag^+ + Cl^- -> AgCl")

    assert verdicts[0].status == "valid"


def test_term_order_does_not_matter():
    verdicts = check("AgNO3 + NaCl -> AgCl + NaNO3", "Cl^- + Ag^+ -> AgCl")

    assert verdicts[0].status == "valid"


def test_writing_the_complete_ionic_equation_gets_its_own_category():
    """Stopping one step early is a specific, common, teachable mistake and
    a student deserves to be told which one it is."""
    verdicts = check(
        "AgNO3 + NaCl -> AgCl + NaNO3",
        "Ag^+ + NO3^- + Na^+ + Cl^- -> AgCl + Na^+ + NO3^-",
    )

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "not_net_ionic"


def test_the_wrong_species_is_flagged_as_such():
    verdicts = check("AgNO3 + NaCl -> AgCl + NaNO3", "Na^+ + NO3^- -> NaNO3")

    assert verdicts[0].status == "invalid"
    assert verdicts[0].error_type == "wrong_species"


def test_an_unparseable_line_is_a_parse_error():
    verdicts = check("AgNO3 + NaCl -> AgCl + NaNO3", "silver and chloride")

    assert verdicts[0].status == "parse_error"


def test_an_unparseable_problem_reports_line_zero():
    verdicts = check("not an equation", "Ag^+ + Cl^- -> AgCl")

    assert verdicts[0].line_number == 0

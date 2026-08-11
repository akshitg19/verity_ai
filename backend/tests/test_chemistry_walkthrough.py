"""Ten questions per chemistry topic, run through the real judges.

The companion sheets live in `testing/chemistry/`. Those are what a person
follows while writing on a tablet; this is the same set of questions with the
handwriting removed, so a regression fails in CI rather than mid-demo.

Every expectation here was produced by running the judge, not by reading the
code. Where the judge does something we do not want, the test says so plainly
and an xfail records what it should do instead.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from judge.chemistry import ChemistryJudge, FunctionalGroupJudge, IsomerJudge
from judge.net_ionic import NetIonicJudge
from judge.redox import (
    CellPotentialJudge,
    CellPotentialProblem,
    OxidationStateJudge,
    OxidationStateProblem,
)
from judge.solutions import SolutionsJudge, SolutionsProblem
from judge.stoichiometry import StoichiometryJudge, StoichiometryProblem
from schemas import ChemistryEquationStep, ChemistryStep


def steps(*values):
    return [ChemistryStep(line_number=i + 1, smiles=v) for i, v in enumerate(values)]


def statuses(verdicts):
    return [
        getattr(verdict, "status", None) or ("valid" if verdict.valid else "invalid")
        for verdict in verdicts
    ]


# ---------------------------------------------------------------------------
# Stoichiometry. Ten questions, one per task the judge supports.
# ---------------------------------------------------------------------------

stoichiometry = StoichiometryJudge()


def solve(**kwargs):
    answers = kwargs.pop("answers")
    problem = StoichiometryProblem(**kwargs)
    return statuses(stoichiometry.check(problem, steps(*answers)))


def test_s1_molar_mass_accepts_either_rounding():
    assert solve(task="molar_mass", formula="H2SO4", answers=["98.08", "98.1", "96.06"]) == [
        "valid",
        "valid",
        "invalid",
    ]


def test_s2_percent_composition():
    assert solve(
        task="percent_composition", formula="H2O", element="O", answers=["88.81", "11.19"]
    ) == ["valid", "invalid"]


def test_s3_moles_from_mass():
    assert solve(
        task="moles_from_mass", formula="H2O", mass_g=36.0, answers=["2.00", "2.5"]
    ) == ["valid", "invalid"]


def test_s4_mass_from_moles():
    assert solve(
        task="mass_from_moles", formula="NaCl", moles=0.5, answers=["29.22", "58.44"]
    ) == ["valid", "valid"]  # 58.44 is the molar mass, not the answer. See below.


def test_s5_particles_from_moles():
    assert solve(
        task="particles_from_moles", formula="H2O", moles=2.0, answers=["1.204e24", "6.022e23"]
    ) == ["valid", "invalid"]


def test_s6_empirical_formula():
    assert solve(
        task="empirical_formula",
        composition={"C": 40.0, "H": 6.7, "O": 53.3},
        answers=["CH2O", "C2H4O2"],
    ) == ["valid", "invalid"]


def test_s7_molecular_formula_needs_the_target_mass():
    assert solve(
        task="molecular_formula",
        composition={"C": 40.0, "H": 6.7, "O": 53.3},
        target_molar_mass=180.0,
        answers=["C6H12O6", "CH2O"],
    ) == ["valid", "invalid"]


def test_s8_limiting_reagent_names_a_species_not_a_number():
    assert solve(
        task="limiting_reagent",
        equation="N2 + 3H2 -> 2NH3",
        amounts={"N2": 28.0, "H2": 4.0},
        answers=["H2", "N2"],
    ) == ["valid", "invalid"]


def test_s9_theoretical_yield():
    assert solve(
        task="theoretical_yield",
        equation="N2 + 3H2 -> 2NH3",
        amounts={"N2": 28.0, "H2": 6.0},
        product="NH3",
        answers=["33.79", "34.06"],
    ) == ["valid", "invalid"]


def test_s10_percent_yield():
    assert solve(
        task="percent_yield",
        equation="N2 + 3H2 -> 2NH3",
        amounts={"N2": 28.0, "H2": 6.0},
        product="NH3",
        actual_yield_g=30.0,
        answers=["88.78", "89.5"],
    ) == ["valid", "invalid"]


# ---------------------------------------------------------------------------
# Solutions. Ten questions across the acid, base and dilution arithmetic.
# ---------------------------------------------------------------------------

solutions = SolutionsJudge()


def dissolve(**kwargs):
    answers = kwargs.pop("answers")
    problem = SolutionsProblem(**kwargs)
    return statuses(solutions.check(problem, steps(*answers)))


def test_q1_molarity_from_moles_and_volume():
    assert dissolve(task="molarity", moles=0.5, volume_l=2.0, answers=["0.25", "1.0"]) == [
        "valid",
        "invalid",
    ]


def test_q2_molarity_from_a_mass():
    assert dissolve(
        task="molarity", formula="NaCl", mass_g=58.44, volume_l=1.0, answers=["1.0 M"]
    ) == ["valid"]


def test_q3_dilution():
    assert dissolve(
        task="dilution",
        initial_concentration_m=6.0,
        initial_volume_l=0.05,
        final_volume_l=0.5,
        answers=["0.60", "0.06"],
    ) == ["valid", "invalid"]


def test_q4_ph_from_hydrogen_concentration():
    assert dissolve(
        task="ph_from_concentration", hydrogen_concentration_m=1e-3, answers=["3.00"]
    ) == ["valid"]


def test_q5_strong_acid_ph():
    assert dissolve(task="strong_acid_ph", concentration_m=0.01, answers=["2.00"]) == ["valid"]


def test_q6_strong_base_ph():
    assert dissolve(task="strong_base_ph", concentration_m=0.01, answers=["12.00"]) == ["valid"]


def test_q7_weak_acid_ph_uses_the_ice_table():
    assert dissolve(
        task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5, answers=["2.87", "1.00"]
    ) == ["valid", "invalid"]


def test_q8_buffer_ph_by_henderson_hasselbalch():
    # 9.26 is the pOH of the same buffer, and it is accepted, which is the
    # quantity-not-answer hole again. Recorded here rather than asserted away.
    assert dissolve(
        task="buffer_ph",
        acid_concentration_m=0.1,
        base_concentration_m=0.1,
        pka=4.74,
        answers=["4.74", "9.26", "7.00"],
    ) == ["valid", "valid", "invalid"]


def test_q9_titration_concentration():
    assert dissolve(
        task="titration_concentration",
        titrant_concentration_m=0.1,
        titrant_volume_l=0.025,
        analyte_volume_l=0.020,
        answers=["0.125", "0.08"],
    ) == ["valid", "invalid"]


def test_q10_percent_by_mass():
    assert dissolve(
        task="percent_by_mass", solute_mass_g=5.0, solution_mass_g=105.0, answers=["4.76", "5.0"]
    ) == ["valid", "invalid"]


# ---------------------------------------------------------------------------
# The hole these two topics share.
#
# The numeric judge asks "is this one of the quantities in the correct
# working", which is exactly right for a middle line and wrong for the last
# one. A student who answers a pH question with the pOH gets a tick, because
# the pOH is in the working. Nothing marks a line as the final answer.
# ---------------------------------------------------------------------------


def test_the_poh_is_accepted_as_an_answer_to_a_ph_question():
    assert dissolve(task="strong_acid_ph", concentration_m=0.01, answers=["12"]) == ["valid"]


def test_a_molar_mass_is_accepted_as_an_answer_to_a_mass_question():
    assert solve(task="mass_from_moles", formula="NaCl", moles=0.5, answers=["58.44"]) == [
        "valid"
    ]


@pytest.mark.xfail(
    reason="every line is judged as a step, so an intermediate quantity on the "
    "answer line passes. The last line needs to be checked against the answer, "
    "not against the set of everything in the working",
    strict=True,
)
def test_the_poh_should_not_answer_a_ph_question():
    assert dissolve(task="strong_acid_ph", concentration_m=0.01, answers=["12"]) == ["invalid"]


# ---------------------------------------------------------------------------
# Redox. Six oxidation states and two cells.
# ---------------------------------------------------------------------------

oxidation = OxidationStateJudge()
cells = CellPotentialJudge()


def oxidation_state(formula, element, *answers):
    problem = OxidationStateProblem(formula=formula, element=element)
    return statuses(oxidation.check(problem, steps(*answers)))


def test_r1_chromium_in_dichromate():
    assert oxidation_state("Cr2O7^2-", "Cr", "+6", "+7") == ["valid", "invalid"]


def test_r2_manganese_in_permanganate():
    assert oxidation_state("MnO4^-", "Mn", "+7", "+6") == ["valid", "invalid"]


def test_r3_sulfur_in_sulfuric_acid():
    assert oxidation_state("H2SO4", "S", "+6", "+4") == ["valid", "invalid"]


def test_r4_hydrogen_in_a_metal_hydride_is_negative():
    # The rule students get wrong: hydrogen is +1 except with a metal.
    assert oxidation_state("NaH", "H", "-1", "+1") == ["valid", "invalid"]


def test_r5_iron_in_iron_three_oxide():
    assert oxidation_state("Fe2O3", "Fe", "+3", "+2") == ["valid", "invalid"]


def test_r6_an_element_on_its_own_is_zero():
    assert oxidation_state("O2", "O", "0", "-2") == ["valid", "invalid"]


def test_r7_daniell_cell_potential():
    problem = CellPotentialProblem(cathode="Cu^2+ + 2e- -> Cu", anode="Zn^2+ + 2e- -> Zn")
    assert statuses(cells.check(problem, steps("1.10", "0.42"))) == ["valid", "invalid"]


def test_r8_silver_copper_cell():
    problem = CellPotentialProblem(cathode="Ag^+ + e- -> Ag", anode="Cu^2+ + 2e- -> Cu")
    assert statuses(cells.check(problem, steps("0.46"))) == ["valid"]


# ---------------------------------------------------------------------------
# Structure and bonding. Equivalence, aromatic forms, and isomers.
# ---------------------------------------------------------------------------

structure = ChemistryJudge()


def test_t1_the_same_molecule_written_backwards_is_the_same_molecule():
    assert statuses(structure.check("CCO", steps("CCO", "OCC", "C(C)O", "CCC"))) == [
        "valid",
        "valid",
        "valid",
        "invalid",
    ]


def test_t2_kekule_and_aromatic_benzene_are_the_same():
    assert statuses(structure.check("c1ccccc1", steps("C1=CC=CC=C1", "C1CCCCC1"))) == [
        "valid",
        "invalid",
    ]


def test_t3_acetic_acid_either_way_round():
    assert statuses(structure.check("CC(=O)O", steps("OC(=O)C", "CCOO"))) == [
        "valid",
        "invalid",
    ]


def test_t4_a_branch_is_not_a_straight_chain():
    assert statuses(structure.check("CC(C)C", steps("CC(C)C", "CCCC"))) == ["valid", "invalid"]


def test_t5_an_isomer_must_differ_but_keep_the_formula():
    verdicts = IsomerJudge("constitutional").check("CCCC", steps("CC(C)C", "CCCC", "CCCCC"))

    assert statuses(verdicts) == ["valid", "invalid", "invalid"]
    # The two rejections are different mistakes and must not read the same.
    assert verdicts[1].error_type == "structure_mismatch"
    assert verdicts[2].error_type == "wrong_formula"


# ---------------------------------------------------------------------------
# Organic. The exclusions are the whole point: an ester is not an ether, an
# amide is not an amine, and an aldehyde is not a ketone.
# ---------------------------------------------------------------------------

groups = FunctionalGroupJudge()


def group(name, *answers):
    return statuses(groups.check(name, steps(*answers)))


def test_o1_alcohol_excludes_the_acid_and_the_ether():
    assert group("alcohol", "CCO", "CC(=O)O", "CCOC") == ["valid", "invalid", "invalid"]


def test_o2_ester_is_not_an_ether():
    assert group("ester", "CC(=O)OC", "CCOC") == ["valid", "invalid"]


def test_o3_ether_is_not_an_ester():
    assert group("ether", "CCOC", "CC(=O)OC") == ["valid", "invalid"]


def test_o4_ketone_is_not_an_aldehyde():
    assert group("ketone", "CC(=O)C", "CC=O") == ["valid", "invalid"]


def test_o5_aldehyde_is_not_a_ketone():
    assert group("aldehyde", "CC=O", "CC(=O)C") == ["valid", "invalid"]


def test_o6_amine_is_not_an_amide():
    assert group("amine", "CCN", "CC(=O)N") == ["valid", "invalid"]


def test_o7_amide_is_not_an_amine():
    assert group("amide", "CC(=O)N", "CCN") == ["valid", "invalid"]


def test_o8_the_group_name_takes_an_underscore():
    # "carboxylic acid" raises rather than quietly checking nothing, which is
    # right, but it means the UI must send the id and never the label.
    assert group("carboxylic_acid", "CC(=O)O", "CCO") == ["valid", "invalid"]

    with pytest.raises(ValueError):
        groups.check("carboxylic acid", steps("CC(=O)O"))


# ---------------------------------------------------------------------------
# Net ionic, the other half of the balancing topic and untested until now.
# ---------------------------------------------------------------------------

net_ionic = NetIonicJudge()


def ionic(molecular, *equations):
    return statuses(
        net_ionic.check(
            molecular,
            [
                ChemistryEquationStep(line_number=i + 1, equation=value)
                for i, value in enumerate(equations)
            ],
        )
    )


def test_n1_precipitation_drops_the_spectators():
    assert ionic(
        "AgNO3 + NaCl -> AgCl + NaNO3",
        "Ag^+ + Cl^- -> AgCl",
        "AgNO3 + NaCl -> AgCl + NaNO3",
    ) == ["valid", "invalid"]


def test_n2_neutralisation_is_just_water():
    assert ionic("HCl + NaOH -> NaCl + H2O", "H^+ + OH^- -> H2O") == ["valid"]

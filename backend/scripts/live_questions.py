"""Two real questions for every chemistry concept the UI offers.

Separate from the runner so the questions can be read and argued with on
their own. Each entry carries what a student would actually have on the
page: the problem, the working they wrote, the answer they wrote, and the
answer that is correct.

`answer` is the correct final line. It is used twice: to check that the
deterministic judge accepts it, and as the string that must never appear in
a level 1 or level 2 hint. `wrong` is a mistake a real student makes, not a
random number, because the hint is only as good as the error it is given.

`session` is the body for POST /chemistry/session, minus topic and problem.
`check` is (path, body) for the endpoint that judges the answer, or None
where no deterministic endpoint judges that concept on its own.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Question:
    concept: str
    topic: str
    problem: str
    session: dict
    correct: str
    wrong: str
    error_type: str
    working: list[str]
    check_path: str | None = None
    check_body: dict = field(default_factory=dict)
    step_key: str = "smiles"
    # A substring of the correct answer that must not appear in a level 1 or
    # level 2 hint. Defaults to `correct` when not given.
    leak: str | None = None
    # Set where the deterministic judge is known not to cover this concept,
    # so `unsupported` is a limitation rather than a failure.
    judge_optional: bool = False


def _stoich(task: str, **params) -> dict:
    return {"task": task, **params, "steps": [{"line_number": 1, "smiles": "0"}]}


def _sol(task: str, **params) -> dict:
    return {"task": task, **params, "steps": [{"line_number": 1, "smiles": "0"}]}


QUESTIONS: list[Question] = [
    # ---------------------------------------------------------- stoichiometry
    Question(
        concept="molar_mass", topic="stoichiometry",
        problem="Find the molar mass of Al2(SO4)3",
        session={"stoichiometry": _stoich("molar_mass", formula="Al2(SO4)3")},
        correct="342.15", wrong="214.14", error_type="wrong_value", leak="342",
        working=["Al 2 x 26.98 = 53.96", "S 3 x 32.06 = 96.18",
                 "O 4 x 16.00 = 64.00", "53.96 + 96.18 + 64.00 = 214.14"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "molar_mass", "formula": "Al2(SO4)3"},
    ), # for some reason sometimes when Im writing working it creates new rows sometimes it doesnt in every text box for working or even answer key would add a really small + symbol below to just add like 3 rows and unlimited + symbols for unlimited rows btw don stop that feature  even for answer box ( do this for all 30 concepts not just stochio)
    Question(
        concept="molar_mass", topic="stoichiometry",
        problem="Find the molar mass of Ca(NO3)2",
        session={"stoichiometry": _stoich("molar_mass", formula="Ca(NO3)2")},
        correct="164.09", wrong="102.09", error_type="wrong_value", leak="164",
        working=["Ca = 40.08", "N = 14.01", "O 3 x 16.00 = 48.00",
                 "40.08 + 14.01 + 48.00 = 102.09"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "molar_mass", "formula": "Ca(NO3)2"},
    ),
    Question(
        concept="percent_composition", topic="stoichiometry",
        problem="Find the percent by mass of carbon in C6H12O6",
        session={"stoichiometry": _stoich("percent_composition",
                                          formula="C6H12O6", element="C")},
        correct="40.0", wrong="12.5", error_type="wrong_value", leak="40.0",
        working=["C = 12.01", "molar mass C6H12O6 = 96.13",
                 "12.01 / 96.13 = 0.125", "0.125 x 100 = 12.5"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "percent_composition", "formula": "C6H12O6",
                    "element": "C"},# the hint 3 for all the places do not actually consider the working right cause I actually wrote gibberish and it just said to look how many nitorgen atoms were in the compound instead step 3 should maybe give a part of the answer obv this differs for every concept but maybe it could give the molar mass of nitrogen and the total molar mass? similar logical hint 3's for all stochio chem parts
    ),
    Question(
        concept="percent_composition", topic="stoichiometry",
        problem="Find the percent by mass of nitrogen in (NH4)2SO4",
        session={"stoichiometry": _stoich("percent_composition",
                                          formula="(NH4)2SO4", element="N")},
        correct="21.2", wrong="10.6", error_type="wrong_value", leak="21.2",
        working=["N = 14.01", "molar mass (NH4)2SO4 = 132.14",
                 "14.01 / 132.14 = 0.106", "0.106 x 100 = 10.6"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "percent_composition", "formula": "(NH4)2SO4",
                    "element": "N"}, # also why are decimal places alwasy not gconsidered in the answer and even if I write the whole number its showing right is this something we can fix or no if not its fine dont waste speed and tokens and API fpprr this
    ),
    Question(
        concept="moles_from_mass", topic="stoichiometry",
        problem="How many moles are in 36.03 g of H2O?",
        session={"stoichiometry": _stoich("moles_from_mass", formula="H2O",
                                          mass_g=36.03)},
        correct="2.00", wrong="36.0", error_type="wrong_value", leak="2.00",
        working=["molar mass H2O = 18.02", "36.03 g of water", "n = 36.0"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "moles_from_mass", "formula": "H2O", "mass_g": 36.03},
    ),
    Question(
        concept="moles_from_mass", topic="stoichiometry",
        problem="How many moles are in 22.00 g of CO2?",
        session={"stoichiometry": _stoich("moles_from_mass", formula="CO2",
                                          mass_g=22.0)},
        correct="0.500", wrong="2.00", error_type="wrong_value", leak="0.50",
        working=["molar mass CO2 = 44.01", "44.01 / 22.00 = 2.00", "n = 2.00"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "moles_from_mass", "formula": "CO2", "mass_g": 22.0}, # hints 1 is  beautiful so if hint 3 is too hard to make perfect leave for now ask me before doing okay WAIT I spoke too soon why does hint for this link me to libre txt but not even an example of the question is this something that can be fixed why is it built in rather just asking AI to solve(tell me in clade no changes to code)
    ),
    Question(
        concept="mass_from_moles", topic="stoichiometry",
        problem="What is the mass of 0.25 mol of NaCl?",
        session={"stoichiometry": _stoich("mass_from_moles", formula="NaCl",
                                          moles=0.25)},
        correct="14.61", wrong="0.25", error_type="wrong_value", leak="14.6",
        working=["molar mass NaCl = 58.44", "0.25 mol", "m = 0.25"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "mass_from_moles", "formula": "NaCl", "moles": 0.25}, # nice but could add atomic masses of na and cl 
    ),
    Question(
        concept="mass_from_moles", topic="stoichiometry",
        problem="What is the mass of 2.00 mol of CO2?",
        session={"stoichiometry": _stoich("mass_from_moles", formula="CO2",
                                          moles=2.0)},
        correct="88.02", wrong="44.01", error_type="wrong_value", leak="88.0",
        working=["molar mass CO2 = 44.01", "2 mol of CO2", "m = 44.01"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "mass_from_moles", "formula": "CO2", "moles": 2.0},
    ),
    Question(
        concept="empirical_formula", topic="stoichiometry",
        problem="A compound is 40.0% C, 6.7% H, 53.3% O by mass. Find the "
                "empirical formula.",
        session={"stoichiometry": _stoich("empirical_formula",
                                          composition={"C": 40.0, "H": 6.7,
                                                       "O": 53.3})},
        correct="CH2O", wrong="CH2O2", error_type="wrong_formula",
        working=["C 40.0 / 12.01 = 3.33", "H 6.7 / 1.008 = 6.65",
                 "O 53.3 / 16.00 = 3.33", "divide by 3.33: C 1 H 2 O 2"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "empirical_formula",
                    "composition": {"C": 40.0, "H": 6.7, "O": 53.3}},
    ),
    Question(
        concept="empirical_formula", topic="stoichiometry",
        problem="A compound is 69.9% Fe and 30.1% O by mass. Find the "
                "empirical formula.",
        session={"stoichiometry": _stoich("empirical_formula",
                                          composition={"Fe": 69.9, "O": 30.1})},
        correct="Fe2O3", wrong="FeO1.5", error_type="wrong_formula",
        working=["Fe 69.9 / 55.85 = 1.25", "O 30.1 / 16.00 = 1.88",
                 "divide by 1.25: Fe 1 O 1.5"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "empirical_formula",
                    "composition": {"Fe": 69.9, "O": 30.1}}, # hint 2 again leads to some random website but ig its fine for now
    ),
    Question(
        concept="molecular_formula", topic="stoichiometry",
        problem="A compound is 40.0% C, 6.7% H, 53.3% O and has a molar mass "
                "of 180 g/mol. Find the molecular formula.",
        session={"stoichiometry": _stoich("molecular_formula",
                                          composition={"C": 40.0, "H": 6.7,
                                                       "O": 53.3},
                                          target_molar_mass=180.0)},
        correct="C6H12O6", wrong="CH2O", error_type="wrong_formula",
        working=["empirical formula CH2O", "empirical mass = 30.03",
                 "answer CH2O"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "molecular_formula",
                    "composition": {"C": 40.0, "H": 6.7, "O": 53.3},
                    "target_molar_mass": 180.0},
    ),
    Question(
        concept="molecular_formula", topic="stoichiometry",
        problem="A compound is 92.3% C and 7.7% H and has a molar mass of "
                "78 g/mol. Find the molecular formula.",
        session={"stoichiometry": _stoich("molecular_formula",
                                          composition={"C": 92.3, "H": 7.7},
                                          target_molar_mass=78.0)},
        correct="C6H6", wrong="CH", error_type="wrong_formula",
        working=["C 92.3 / 12.01 = 7.69", "H 7.7 / 1.008 = 7.64",
                 "ratio 1 to 1 so CH", "answer CH"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "molecular_formula",
                    "composition": {"C": 92.3, "H": 7.7},
                    "target_molar_mass": 78.0}, # hint 2 same thing as above linking tor andom website
    ),
    Question(
        concept="limiting_reagent", topic="stoichiometry",
        problem="28.0 g N2 reacts with 6.0 g H2 in N2 + H2 -> NH3. Which is "
                "limiting?",
        session={"stoichiometry": _stoich("limiting_reagent",
                                          equation="N2 + H2 -> NH3",
                                          amounts={"N2": 28.0, "H2": 6.0})},
        correct="H2", wrong="N2", error_type="wrong_species",
        working=["N2 28.0 / 28.02 = 1.00 mol", "H2 6.0 / 2.02 = 2.97 mol",
                 "N2 is the smaller number of moles so N2 is limiting"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "limiting_reagent", "equation": "N2 + H2 -> NH3",
                    "amounts": {"N2": 28.0, "H2": 6.0}},
    ),
    Question(
        concept="limiting_reagent", topic="stoichiometry",
        problem="24.0 g Mg reacts with 32.0 g O2 in Mg + O2 -> MgO. Which is "
                "limiting?",
        session={"stoichiometry": _stoich("limiting_reagent",
                                          equation="Mg + O2 -> MgO",
                                          amounts={"Mg": 24.0, "O2": 32.0})},
        correct="Mg", wrong="O2", error_type="wrong_species",
        working=["Mg 24.0 / 24.31 = 0.987 mol", "O2 32.0 / 32.00 = 1.00 mol",
                 "2 Mg needs 1 O2", "O2 is limiting"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "limiting_reagent", "equation": "Mg + O2 -> MgO",
                    "amounts": {"Mg": 24.0, "O2": 32.0}}, # hint 1, 2 had a read more the first time but then hint 2 only has it the second time and hint 3 doesnt work for this atm for many of these because it doesnt consider the working but this makes sense rn no need ot change
    ),
    Question(
        concept="theoretical_yield", topic="stoichiometry",
        problem="28.0 g N2 reacts with 6.0 g H2 in N2 + H2 -> NH3. What mass "
                "of NH3 can form?",
        session={"stoichiometry": _stoich("theoretical_yield",
                                          equation="N2 + H2 -> NH3",
                                          amounts={"N2": 28.0, "H2": 6.0},
                                          product="NH3")},
        correct="33.79", wrong="34.06", error_type="wrong_value", leak="33.7",
        working=["N2 = 1.00 mol", "1 N2 gives 2 NH3 so 2.00 mol NH3",
                 "2.00 x 17.03 = 34.06"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "theoretical_yield", "equation": "N2 + H2 -> NH3",
                    "amounts": {"N2": 28.0, "H2": 6.0}, "product": "NH3"},
    ),
    Question(
        concept="theoretical_yield", topic="stoichiometry",
        problem="24.0 g Mg reacts with 32.0 g O2 in Mg + O2 -> MgO. What mass "
                "of MgO can form?",
        session={"stoichiometry": _stoich("theoretical_yield",
                                          equation="Mg + O2 -> MgO",
                                          amounts={"Mg": 24.0, "O2": 32.0},
                                          product="MgO")},
        correct="39.79", wrong="80.61", error_type="wrong_value", leak="39.7",
        working=["O2 = 1.00 mol", "1 O2 gives 2 MgO so 2.00 mol",
                 "2.00 x 40.30 = 80.61"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "theoretical_yield", "equation": "Mg + O2 -> MgO",
                    "amounts": {"Mg": 24.0, "O2": 32.0}, "product": "MgO"},
    ),
    Question(
        concept="percent_yield", topic="stoichiometry",
        problem="28.0 g N2 and 6.0 g H2 give 25.0 g NH3. What is the percent "
                "yield?",
        session={"stoichiometry": _stoich("percent_yield",
                                          equation="N2 + H2 -> NH3",
                                          amounts={"N2": 28.0, "H2": 6.0},
                                          product="NH3", actual_yield_g=25.0)},
        correct="74.0", wrong="73.4", error_type="wrong_value", leak="74.0",
        working=["theoretical = 34.06 g", "25.0 / 34.06 = 0.734",
                 "0.734 x 100 = 73.4"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "percent_yield", "equation": "N2 + H2 -> NH3",
                    "amounts": {"N2": 28.0, "H2": 6.0}, "product": "NH3",
                    "actual_yield_g": 25.0},
    ),
    Question(
        concept="percent_yield", topic="stoichiometry",
        problem="4.0 g H2 and 32.0 g O2 give 30.0 g H2O. What is the percent "
                "yield?",
        session={"stoichiometry": _stoich("percent_yield",
                                          equation="H2 + O2 -> H2O",
                                          amounts={"H2": 4.0, "O2": 32.0},
                                          product="H2O", actual_yield_g=30.0)},
        correct="83.9", wrong="120", error_type="wrong_value", leak="83.9",
        working=["theoretical = 25.0 g", "30.0 / 25.0 = 1.20", "120 percent"],
        check_path="/chemistry/stoichiometry",
        check_body={"task": "percent_yield", "equation": "H2 + O2 -> H2O",
                    "amounts": {"H2": 4.0, "O2": 32.0}, "product": "H2O",
                    "actual_yield_g": 30.0}, # same for the last 2 just if hints 1, 2 and 3 are okay ( for this I wrote 137 as a wrong asnwer and it told me I mutiplied the masses of h2 and o2 but 32*4 is is not 137 right again bad wrong hints man)
    ),

    # -------------------------------------------------------------- solutions
    Question(
        concept="molarity", topic="solutions",
        problem="5.85 g of NaCl is dissolved to make 1.00 L of solution. Find "
                "the molarity.",
        session={"solutions": _sol("molarity", formula="NaCl", mass_g=5.85,
                                   volume_l=1.0)},
        correct="0.100", wrong="5.85", error_type="wrong_value", leak="0.100",
        working=["molar mass NaCl = 58.44", "5.85 g in 1.00 L", "M = 5.85"],
        check_path="/chemistry/solutions",
        check_body={"task": "molarity", "formula": "NaCl", "mass_g": 5.85,
                    "volume_l": 1.0},
    ),
    Question(
        concept="molarity", topic="solutions",
        problem="4.00 g of NaOH is dissolved to make 0.500 L of solution. Find "
                "the molarity.",
        session={"solutions": _sol("molarity", formula="NaOH", mass_g=4.0,
                                   volume_l=0.5)},
        correct="0.200", wrong="8.00", error_type="wrong_value", leak="0.200",
        working=["molar mass NaOH = 40.00", "n = 4.00 / 40.00 = 0.100 mol",
                 "M = 0.100 x 0.500 was inverted", "M = 8.00"],
        check_path="/chemistry/solutions",
        check_body={"task": "molarity", "formula": "NaOH", "mass_g": 4.0,
                    "volume_l": 0.5},
    ),
    Question(
        concept="dilution", topic="solutions",
        problem="50.0 mL of 2.00 M HCl is diluted to 500 mL. Find the new "
                "concentration.",
        session={"solutions": _sol("dilution", initial_concentration_m=2.0,
                                   initial_volume_l=0.05, final_volume_l=0.5)},
        correct="0.200", wrong="20.0", error_type="wrong_value", leak="0.200",
        working=["M1 V1 = M2 V2", "2.00 x 0.050 = 0.100",
                 "0.100 x 0.500 = 20.0"],
        check_path="/chemistry/solutions",
        check_body={"task": "dilution", "initial_concentration_m": 2.0,
                    "initial_volume_l": 0.05, "final_volume_l": 0.5},
    ),
    Question(
        concept="dilution", topic="solutions",
        problem="What volume of 12.0 M HCl is needed to make a 0.500 M "
                "solution from 10.0 mL?",
        session={"solutions": _sol("dilution", initial_concentration_m=12.0,
                                   initial_volume_l=0.010,
                                   final_concentration_m=0.5)},
        correct="0.240", wrong="0.120", error_type="wrong_value", leak="0.240",
        working=["M1 V1 = M2 V2", "12.0 x 0.010 = 0.120",
                 "V2 = 0.120"],
        check_path="/chemistry/solutions",
        check_body={"task": "dilution", "initial_concentration_m": 12.0,
                    "initial_volume_l": 0.010, "final_concentration_m": 0.5}, # this si not working only also dont you thinre should be some sorta look at claude prompt for more 
    ),
    Question(
        concept="strong_acid_ph", topic="solutions",
        problem="Find the pH of 0.010 M HCl.",
        session={"solutions": _sol("strong_acid_ph", concentration_m=0.01,
                                   protons=1)},
        correct="2.00", wrong="12.00", error_type="wrong_value", leak="2.00",
        working=["HCl is strong so H+ = 0.010", "-log(0.010) = 2.00",
                 "pH = 14 - 2.00 = 12.00"],
        check_path="/chemistry/solutions",
        check_body={"task": "strong_acid_ph", "concentration_m": 0.01,
                    "protons": 1},
    ),
    Question(
        concept="strong_acid_ph", topic="solutions",
        problem="Find the pH of 0.0050 M H2SO4.",
        session={"solutions": _sol("strong_acid_ph", concentration_m=0.005,
                                   protons=2)},
        correct="2.00", wrong="2.30", error_type="wrong_value", leak="2.00",
        working=["H2SO4 concentration 0.0050", "-log(0.0050) = 2.30",
                 "pH = 2.30"],
        check_path="/chemistry/solutions",
        check_body={"task": "strong_acid_ph", "concentration_m": 0.005,
                    "protons": 2},
    ),
    Question(
        concept="strong_base_ph", topic="solutions",
        problem="Find the pH of 0.010 M NaOH.",
        session={"solutions": _sol("strong_base_ph", concentration_m=0.01,
                                   hydroxides=1)},
        correct="12.00", wrong="2.00", error_type="wrong_value", leak="12.00",
        working=["NaOH is strong so OH- = 0.010", "-log(0.010) = 2.00",
                 "pH = 2.00"],
        check_path="/chemistry/solutions",
        check_body={"task": "strong_base_ph", "concentration_m": 0.01,
                    "hydroxides": 1},
    ),
    Question(
        concept="strong_base_ph", topic="solutions",
        problem="Find the pH of 0.0050 M Ca(OH)2.",
        session={"solutions": _sol("strong_base_ph", concentration_m=0.005,
                                   hydroxides=2)},
        correct="12.00", wrong="11.70", error_type="wrong_value", leak="12.00",
        working=["Ca(OH)2 concentration 0.0050", "pOH = -log(0.0050) = 2.30",
                 "pH = 14 - 2.30 = 11.70"],
        check_path="/chemistry/solutions",
        check_body={"task": "strong_base_ph", "concentration_m": 0.005,
                    "hydroxides": 2},
    ),
    Question(
        concept="weak_acid_ph", topic="solutions",
        problem="Find the pH of 0.10 M acetic acid, Ka = 1.8e-5.",
        session={"solutions": _sol("weak_acid_ph", concentration_m=0.1,
                                   ka=1.8e-5)},
        correct="2.87", wrong="1.00", error_type="wrong_value", leak="2.87",
        working=["acetic acid 0.10 M", "H+ = 0.10", "pH = -log(0.10) = 1.00"],
        check_path="/chemistry/solutions",
        check_body={"task": "weak_acid_ph", "concentration_m": 0.1,
                    "ka": 1.8e-5},
    ),
    Question(
        concept="weak_acid_ph", topic="solutions",
        problem="Find the pH of 0.25 M of a weak acid with Ka = 6.3e-5.",
        session={"solutions": _sol("weak_acid_ph", concentration_m=0.25,
                                   ka=6.3e-5)},
        correct="2.40", wrong="4.20", error_type="wrong_value", leak="2.40",
        working=["Ka = 6.3e-5", "pKa = 4.20", "pH = pKa = 4.20"],
        check_path="/chemistry/solutions",
        check_body={"task": "weak_acid_ph", "concentration_m": 0.25,
                    "ka": 6.3e-5},
    ),
    Question(
        concept="weak_base_ph", topic="solutions",
        problem="Find the pH of 0.10 M ammonia, Kb = 1.8e-5.",
        session={"solutions": _sol("weak_base_ph", concentration_m=0.1,
                                   kb=1.8e-5)},
        correct="11.13", wrong="2.87", error_type="wrong_value", leak="11.1",
        working=["OH- = sqrt(0.10 x 1.8e-5) = 1.34e-3",
                 "-log(1.34e-3) = 2.87", "pH = 2.87"],
        check_path="/chemistry/solutions",
        check_body={"task": "weak_base_ph", "concentration_m": 0.1,
                    "kb": 1.8e-5},
    ),
    Question(
        concept="weak_base_ph", topic="solutions",
        problem="Find the pH of 0.050 M of a weak base with Kb = 4.4e-4.",
        session={"solutions": _sol("weak_base_ph", concentration_m=0.05,
                                   kb=4.4e-4)},
        correct="11.67", wrong="2.33", error_type="wrong_value", leak="11.6",
        working=["OH- = sqrt(0.050 x 4.4e-4) = 4.69e-3",
                 "pOH = 2.33", "pH = 2.33"],
        check_path="/chemistry/solutions",
        check_body={"task": "weak_base_ph", "concentration_m": 0.05,
                    "kb": 4.4e-4},
    ),
    Question(
        concept="buffer_ph", topic="solutions",
        problem="A buffer is 0.10 M in acid and 0.20 M in its conjugate base, "
                "pKa = 4.74. Find the pH.",
        session={"solutions": _sol("buffer_ph", acid_concentration_m=0.1,
                                   base_concentration_m=0.2, pka=4.74)},
        correct="5.04", wrong="4.44", error_type="wrong_value", leak="5.04",
        working=["pH = pKa + log(acid / base)", "log(0.10 / 0.20) = -0.30",
                 "4.74 - 0.30 = 4.44"],
        check_path="/chemistry/solutions",
        check_body={"task": "buffer_ph", "acid_concentration_m": 0.1,
                    "base_concentration_m": 0.2, "pka": 4.74},
    ),
    Question(
        concept="buffer_ph", topic="solutions",
        problem="A buffer is 0.250 M in acid and 0.400 M in its conjugate "
                "base, pKa = 4.74. Find the pH.",
        session={"solutions": _sol("buffer_ph", acid_concentration_m=0.25,
                                   base_concentration_m=0.4, pka=4.74)},
        correct="4.94", wrong="4.54", error_type="wrong_value", leak="4.94",
        working=["pH = pKa + log(0.250 / 0.400)", "log(0.625) = -0.20",
                 "4.74 - 0.20 = 4.54"],
        check_path="/chemistry/solutions",
        check_body={"task": "buffer_ph", "acid_concentration_m": 0.25,
                    "base_concentration_m": 0.4, "pka": 4.74},
    ),
    Question(
        concept="titration_concentration", topic="solutions",
        problem="25.0 mL of 0.100 M NaOH neutralises 20.0 mL of HCl. Find the "
                "concentration of the HCl.",
        session={"solutions": _sol("titration_concentration",
                                   titrant_concentration_m=0.1,
                                   titrant_volume_l=0.025,
                                   analyte_volume_l=0.02)},
        correct="0.125", wrong="0.100", error_type="wrong_value", leak="0.125",
        working=["moles NaOH = 0.100 x 0.0250 = 0.00250",
                 "same moles of HCl", "M = 0.100"],
        check_path="/chemistry/solutions",
        check_body={"task": "titration_concentration",
                    "titrant_concentration_m": 0.1, "titrant_volume_l": 0.025,
                    "analyte_volume_l": 0.02},
    ),
    Question(
        concept="titration_concentration", topic="solutions",
        problem="15.0 mL of 0.200 M NaOH neutralises 25.0 mL of an acid. Find "
                "the concentration of the acid.",
        session={"solutions": _sol("titration_concentration",
                                   titrant_concentration_m=0.2,
                                   titrant_volume_l=0.015,
                                   analyte_volume_l=0.025)},
        correct="0.120", wrong="0.333", error_type="wrong_value", leak="0.120",
        working=["moles = 0.200 x 0.0150 = 0.00300",
                 "0.00300 / 0.00900 = 0.333", "M = 0.333"],
        check_path="/chemistry/solutions",
        check_body={"task": "titration_concentration",
                    "titrant_concentration_m": 0.2, "titrant_volume_l": 0.015,
                    "analyte_volume_l": 0.025},
    ),
    Question(
        concept="percent_by_mass", topic="solutions",
        problem="5.0 g of solute is in 100.0 g of solution. Find the percent "
                "by mass.",
        session={"solutions": _sol("percent_by_mass", solute_mass_g=5.0,
                                   solution_mass_g=100.0)},
        correct="5.00", wrong="0.05", error_type="wrong_value", leak="5.00",
        working=["5.0 / 100.0 = 0.05", "answer 0.05"],
        check_path="/chemistry/solutions",
        check_body={"task": "percent_by_mass", "solute_mass_g": 5.0,
                    "solution_mass_g": 100.0},
    ),
    Question(
        concept="percent_by_mass", topic="solutions",
        problem="12.0 g of solute is in 150.0 g of solution. Find the percent "
                "by mass.",
        session={"solutions": _sol("percent_by_mass", solute_mass_g=12.0,
                                   solution_mass_g=150.0)},
        correct="8.00", wrong="12.5", error_type="wrong_value", leak="8.00",
        working=["12.0 / 150.0", "150.0 / 12.0 = 12.5", "12.5 percent"],
        check_path="/chemistry/solutions",
        check_body={"task": "percent_by_mass", "solute_mass_g": 12.0,
                    "solution_mass_g": 150.0},
    ),

    # -------------------------------------------------------------- balancing
    Question(
        concept="balance", topic="balancing",
        problem="Balance: C3H8 + O2 -> CO2 + H2O",
        session={"reference_equation": "C3H8 + O2 -> CO2 + H2O"},
        correct="C3H8 + 5O2 -> 3CO2 + 4H2O",
        wrong="C3H8 + 3O2 -> 3CO2 + 4H2O", error_type="unbalanced_atoms",
        working=["C: 3 on the left, 3 on the right",
                 "H: 8 on the left, 8 on the right",
                 "O: 6 on the left, 10 on the right"],
        check_path="/chemistry/balance",
        check_body={"reference_equation": "C3H8 + O2 -> CO2 + H2O"},
        step_key="equation", leak="5O2",
    ),
    Question(
        concept="balance", topic="balancing",
        problem="Balance: Al + CuSO4 -> Al2(SO4)3 + Cu",
        session={"reference_equation": "Al + CuSO4 -> Al2(SO4)3 + Cu"},
        correct="2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu",
        wrong="Al + CuSO4 -> Al2(SO4)3 + Cu", error_type="unbalanced_atoms",
        working=["Al: 1 on the left, 2 on the right",
                 "SO4 groups: 1 on the left, 3 on the right"],
        check_path="/chemistry/balance",
        check_body={"reference_equation": "Al + CuSO4 -> Al2(SO4)3 + Cu"},
        step_key="equation", leak="3CuSO4",
    ),
    Question(
        concept="net_ionic", topic="balancing",
        problem="Write the net ionic equation for AgNO3 + NaCl -> AgCl + NaNO3",
        session={"molecular_equation": "AgNO3 + NaCl -> AgCl + NaNO3"},
        correct="Ag^+ + Cl^- -> AgCl",
        wrong="Ag^+ + NO3^- + Na^+ + Cl^- -> AgCl + Na^+ + NO3^-",
        error_type="not_net_ionic",
        working=["AgNO3 splits into Ag+ and NO3-",
                 "NaCl splits into Na+ and Cl-",
                 "AgCl is a solid so it stays together"],
        check_path="/chemistry/net-ionic",
        check_body={"molecular_equation": "AgNO3 + NaCl -> AgCl + NaNO3"},
        step_key="equation", leak="Ag^+ + Cl^- -> AgCl",
    ),
    Question(
        concept="net_ionic", topic="balancing",
        problem="Write the net ionic equation for BaCl2 + Na2SO4 -> BaSO4 + NaCl",
        session={"molecular_equation": "BaCl2 + Na2SO4 -> BaSO4 + NaCl"},
        correct="Ba^2+ + SO4^2- -> BaSO4",
        wrong="Ba^2+ + SO4^- -> BaSO4", error_type="unbalanced_charge",
        working=["BaCl2 gives Ba2+ and 2 Cl-",
                 "Na2SO4 gives 2 Na+ and SO4-",
                 "BaSO4 is insoluble"],
        check_path="/chemistry/net-ionic",
        check_body={"molecular_equation": "BaCl2 + Na2SO4 -> BaSO4 + NaCl"},
        step_key="equation", leak="SO4^2-",
    ),

    # ------------------------------------------------------------------ redox
    Question(
        concept="half_reaction", topic="redox",
        problem="Balance the half reaction MnO4^- -> Mn^2+ in acid.",
        session={"reference_equation": "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O"},
        correct="MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O",
        wrong="MnO4^- + 8H^+ + 4e- -> Mn^2+ + 4H2O",
        error_type="unbalanced_charge",
        working=["balance O with 4 H2O", "balance H with 8 H+",
                 "left charge is -1 + 8 = +7, right is +2",
                 "add 4 electrons"],
        check_path="/chemistry/balance",
        check_body={"reference_equation": "MnO4^- + 8H^+ + 5e- -> Mn^2+ + 4H2O"},
        step_key="equation", leak="5e-",
    ),
    Question(
        concept="half_reaction", topic="redox",
        problem="Balance the half reaction Cr2O7^2- -> Cr^3+ in acid.",
        session={"reference_equation":
                 "Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O"},
        correct="Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O",
        wrong="Cr2O7^2- + 14H^+ + 3e- -> 2Cr^3+ + 7H2O",
        error_type="unbalanced_charge",
        working=["2 Cr on the left so 2 Cr on the right",
                 "7 H2O balances the oxygen", "14 H+ balances the hydrogen",
                 "each Cr goes from +6 to +3 so 3 electrons"],
        check_path="/chemistry/balance",
        check_body={"reference_equation":
                    "Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O"},
        step_key="equation", leak="6e-",
    ),
    Question(
        concept="oxidation_state", topic="redox",
        problem="What is the oxidation state of Cr in Cr2O7^2-?",
        session={"oxidation_formula": "Cr2O7^2-", "oxidation_element": "Cr"},
        correct="+6", wrong="+7", error_type="wrong_oxidation_state",
        working=["O is -2 each so 7 x -2 = -14", "2 Cr + (-14) = 0",
                 "2 Cr = 14 so Cr = +7"],
        check_path="/chemistry/oxidation-state",
        check_body={"formula": "Cr2O7^2-", "element": "Cr"},
        leak="+6",
    ),
    Question(
        concept="oxidation_state", topic="redox",
        problem="What is the oxidation state of S in H2SO4?",
        session={"oxidation_formula": "H2SO4", "oxidation_element": "S"},
        correct="+6", wrong="+8", error_type="wrong_oxidation_state",
        working=["O is -2 each so 4 x -2 = -8", "S + (-8) = 0", "S = +8"],
        check_path="/chemistry/oxidation-state",
        check_body={"formula": "H2SO4", "element": "S"},
        leak="+6",
    ),
    Question(
        concept="cell_potential", topic="redox",
        problem="Find the standard cell potential for a Cu cathode and a Zn "
                "anode.",
        session={"cathode": "Cu^2+ + 2e- -> Cu", "anode": "Zn^2+ + 2e- -> Zn"},
        correct="1.10", wrong="-0.42", error_type="wrong_value", leak="1.10",
        working=["cathode Cu is +0.34", "anode Zn is -0.76",
                 "0.34 + (-0.76) = -0.42"],
        check_path="/chemistry/cell-potential",
        check_body={"cathode": "Cu^2+ + 2e- -> Cu",
                    "anode": "Zn^2+ + 2e- -> Zn"},
    ),
    Question(
        concept="cell_potential", topic="redox",
        problem="Find the standard cell potential for an Ag cathode and a Cu "
                "anode.",
        session={"cathode": "Ag^+ + e- -> Ag", "anode": "Cu^2+ + 2e- -> Cu"},
        correct="0.46", wrong="1.14", error_type="wrong_value", leak="0.46",
        working=["Ag is +0.80", "Cu is +0.34", "0.80 + 0.34 = 1.14"],
        check_path="/chemistry/cell-potential",
        check_body={"cathode": "Ag^+ + e- -> Ag", "anode": "Cu^2+ + 2e- -> Cu"},
    ),

    # -------------------------------------------------------------- structure
    Question(
        concept="formula_structure", topic="structure",
        problem="Draw a structure with the molecular formula C2H6O.",
        session={"target_formula": "C2H6O"},
        correct="CCO", wrong="CCC", error_type="structure_mismatch",
        working=["two carbons in a chain", "one oxygen somewhere"],
        check_path="/chemistry/formula-structure",
        check_body={"target_formula": "C2H6O"}, leak="C2H6O",
    ),
    Question(
        concept="formula_structure", topic="structure",
        problem="Draw a structure with the molecular formula C4H10.",
        session={"target_formula": "C4H10"},
        correct="CCCC", wrong="CCCCC", error_type="structure_mismatch",
        working=["a chain of carbons", "fill the rest with hydrogen"],
        check_path="/chemistry/formula-structure",
        check_body={"target_formula": "C4H10"}, leak="C4H10",
    ),
    Question(
        concept="isomer", topic="structure",
        problem="Draw a structural isomer of ethanol.",
        session={"target_smiles": "CCO"},
        correct="COC", wrong="CCO", error_type="structure_mismatch",
        working=["ethanol is C2H6O", "same atoms, different arrangement"],
        check_path="/chemistry/isomer",
        check_body={"reference_smiles": "CCO", "isomer_type": "constitutional"},
        leak="COC",
    ),
    Question(
        concept="isomer", topic="structure",
        problem="Draw a structural isomer of butane.",
        session={"target_smiles": "CCCC"},
        correct="CC(C)C", wrong="CCCC", error_type="structure_mismatch",
        working=["butane is C4H10", "branch one carbon off"],
        check_path="/chemistry/isomer",
        check_body={"reference_smiles": "CCCC", "isomer_type": "constitutional"},
        leak="CC(C)C",
    ),
    Question(
        concept="match_structure", topic="structure",
        problem="Draw methyl ethanoate.",
        session={"target_smiles": "CC(=O)OC"},
        correct="CC(=O)OC", wrong="CCOC", error_type="structure_mismatch",
        working=["ester group", "methyl on the oxygen"],
        check_path="/chemistry/check",
        check_body={"target_smiles": "CC(=O)OC"}, leak="CC(=O)OC",
    ),
    Question(
        concept="match_structure", topic="structure",
        problem="Draw propan-1-ol.",
        session={"target_smiles": "CCCO"},
        correct="CCCO", wrong="CCO", error_type="structure_mismatch",
        working=["three carbons", "OH on the end"],
        check_path="/chemistry/check",
        check_body={"target_smiles": "CCCO"}, leak="CCCO",
    ),

    # ---------------------------------------------------------------- organic
    Question(
        concept="functional_group", topic="organic",
        problem="Draw a molecule containing an ester group.",
        session={"target_group": "ester"},
        correct="CC(=O)OC", wrong="CCOCC",
        error_type="wrong_functional_group",
        working=["carbon double bond oxygen", "then another oxygen"],
        check_path="/chemistry/functional-group",
        check_body={"target_group": "ester"}, leak="CC(=O)OC",
    ),
    Question(
        concept="functional_group", topic="organic",
        problem="Draw a molecule containing a ketone group.",
        session={"target_group": "ketone"},
        correct="CC(=O)C", wrong="CC=O",
        error_type="wrong_functional_group",
        working=["carbonyl in the middle of the chain"],
        check_path="/chemistry/functional-group",
        check_body={"target_group": "ketone"}, leak="CC(=O)C",
    ),
    Question(
        concept="draw_from_name", topic="organic",
        problem="Draw propan-2-ol.",
        session={"target_smiles": "CC(O)C"},
        correct="CC(O)C", wrong="CCCO", error_type="structure_mismatch",
        working=["three carbons", "OH on the middle carbon"],
        check_path="/chemistry/check",
        check_body={"target_smiles": "CC(O)C"}, leak="CC(O)C",
    ),
    Question(
        concept="draw_from_name", topic="organic",
        problem="Draw ethanoic acid.",
        session={"target_smiles": "CC(=O)O"},
        correct="CC(=O)O", wrong="CCO", error_type="structure_mismatch",
        working=["two carbons", "COOH on the end"],
        check_path="/chemistry/check",
        check_body={"target_smiles": "CC(=O)O"}, leak="CC(=O)O",
    ),
    Question(
        concept="naming", topic="organic",
        problem="Name this molecule.",
        session={"target_smiles": "CC(=O)OC"},
        correct="methyl acetate", wrong="methyl ethanol",
        error_type="wrong_name",
        working=["there is an ester", "the small group is a methyl"],
        check_path="/chemistry/name",
        check_body={"target_smiles": "CC(=O)OC"}, judge_optional=True,
        leak="methyl acetate",
    ),
    Question(
        concept="naming", topic="organic",
        problem="Name this molecule.",
        session={"target_smiles": "CCO"},
        correct="ethanol", wrong="methanol", error_type="wrong_name",
        working=["two carbons", "alcohol"],
        check_path="/chemistry/name",
        check_body={"target_smiles": "CCO"}, judge_optional=True,
        leak="ethanol",
    ),
    Question(
        concept="reaction", topic="organic",
        problem="Ethene reacts with bromine. Draw the product.",
        session={"target_smiles": "BrCCBr"},
        correct="BrCCBr", wrong="CCBr", error_type="structure_mismatch",
        working=["the double bond opens", "bromine adds across it"],
        check_path="/chemistry/reaction",
        check_body={"reactants_smiles": ["C=C"], "reagent": "Br2",
                    "reaction_type": "addition"}, judge_optional=True,
        leak="BrCCBr",
    ),
    Question(
        concept="reaction", topic="organic",
        problem="Ethene reacts with hydrogen. Draw the product.",
        session={"target_smiles": "CC"},
        correct="CC", wrong="C=C", error_type="structure_mismatch",
        working=["the double bond becomes a single bond",
                 "a hydrogen on each carbon"],
        check_path="/chemistry/reaction",
        check_body={"reactants_smiles": ["C=C"], "reagent": "H2",
                    "reaction_type": "addition"}, judge_optional=True,
        leak="CC",
    ),
]


CONCEPTS = sorted({question.concept for question in QUESTIONS})

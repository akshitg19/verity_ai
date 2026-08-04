from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from main import app
from transcription import TranscriptionInputError, TranscriptionServiceError


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_check_accepts_equivalent_steps() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "3(x - 4) = 2x + 5",
            "steps": [
                {"line_number": 1, "latex": "3x - 12 = 2x + 5"},
                {"line_number": 2, "latex": "x = 17"},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["first_wrong_line"] is None
    assert all(item["valid"] for item in response.json()["verdicts"])


def test_check_reports_first_wrong_line() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "3(x - 4) = 2x + 5",
            "steps": [{"line_number": 1, "latex": "3x - 12 = 2x - 5"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["first_wrong_line"] == 1
    assert response.json()["verdicts"][0]["valid"] is False
    assert response.json()["verdicts"][0]["status"] == "invalid"


def test_check_unsupported_step_is_not_a_student_mistake() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "x = 1",
            "steps": [{"line_number": 1, "latex": "y = 1"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] is None
    assert body["problem_error"] is None
    assert body["verdicts"][0]["status"] == "unsupported"
    assert body["verdicts"][0]["error_type"] == "unsupported"


def test_check_parse_error_step_is_not_a_student_mistake() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "x = 1",
            "steps": [{"line_number": 1, "latex": "x + = 1"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] is None
    assert body["problem_error"] is None
    assert body["verdicts"][0]["status"] == "parse_error"
    assert body["verdicts"][0]["error_type"] == "parse_error"


def test_check_only_real_invalid_step_sets_first_wrong_line() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "x = 1",
            "steps": [
                {"line_number": 1, "latex": "y = 1"},
                {"line_number": 2, "latex": "x + = 1"},
                {"line_number": 3, "latex": "x = 2"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["status"] for item in body["verdicts"]] == [
        "unsupported",
        "parse_error",
        "invalid",
    ]
    assert body["first_wrong_line"] == 3


def test_check_unsupported_problem_returns_problem_error_without_verdicts() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "x + y = 1",
            "steps": [{"line_number": 1, "latex": "x = 1 - y"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [],
        "first_wrong_line": None,
        "problem_error": "unsupported",
    }


def test_check_parse_error_problem_returns_problem_error_without_verdicts() -> None:
    response = client.post(
        "/check",
        json={
            "problem": "][",
            "steps": [{"line_number": 1, "latex": "x = 1"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [],
        "first_wrong_line": None,
        "problem_error": "parse_error",
    }


def test_chemistry_check_accepts_equivalent_structure() -> None:
    response = client.post(
        "/chemistry/check",
        json={
            "target_smiles": "CCO",
            "steps": [{"line_number": 1, "smiles": "OCC"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [
            {
                "line_number": 1,
                "valid": True,
                "error_type": None,
                "detail": None,
                "status": "valid",
            }
        ],
        "first_wrong_line": None,
        "problem_error": None,
    }


def test_chemistry_check_reports_first_structure_mismatch() -> None:
    response = client.post(
        "/chemistry/check",
        json={
            "target_smiles": "CCO",
            "steps": [
                {"line_number": 1, "smiles": "CC"},
                {"line_number": 2, "smiles": "OCC"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] == 1
    assert [item["status"] for item in body["verdicts"]] == [
        "invalid",
        "valid",
    ]
    assert body["verdicts"][0]["error_type"] == "structure_mismatch"


def test_chemistry_check_problem_error_hides_step_verdicts() -> None:
    response = client.post(
        "/chemistry/check",
        json={
            "target_smiles": "C1CC",
            "steps": [{"line_number": 1, "smiles": "CCO"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [],
        "first_wrong_line": None,
        "problem_error": "parse_error",
    }


def test_chemistry_non_student_errors_do_not_set_first_wrong_line() -> None:
    response = client.post(
        "/chemistry/check",
        json={
            "target_smiles": "CCO",
            "steps": [
                {"line_number": 1, "smiles": "C1CC"},
                {"line_number": 2, "smiles": "CCO>>CC=O"},
                {"line_number": 3, "smiles": "CC"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["status"] for item in body["verdicts"]] == [
        "parse_error",
        "unsupported",
        "invalid",
    ]
    assert body["first_wrong_line"] == 3


def test_chemistry_unsupported_target_returns_problem_error() -> None:
    response = client.post(
        "/chemistry/check",
        json={
            "target_smiles": "CCO.Cl",
            "steps": [{"line_number": 1, "smiles": "CCO"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [],
        "first_wrong_line": None,
        "problem_error": "unsupported",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"target_smiles": "CCO", "steps": []},
        {
            "target_smiles": "CCO",
            "steps": [{"line_number": 0, "smiles": "CCO"}],
        },
        {
            "target_smiles": "CCO",
            "steps": [
                {"line_number": 2, "smiles": "CCO"},
                {"line_number": 1, "smiles": "CCO"},
            ],
        },
        {
            "target_smiles": "C" * 2049,
            "steps": [{"line_number": 1, "smiles": "CCO"}],
        },
    ],
)
def test_chemistry_check_rejects_invalid_request_shape(payload) -> None:
    response = client.post("/chemistry/check", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"problem": "x = 1", "steps": []},
        {
            "problem": "x = 1",
            "steps": [{"line_number": 0, "latex": "x = 1"}],
        },
        {
            "problem": "x = 1",
            "steps": [
                {"line_number": 2, "latex": "x = 1"},
                {"line_number": 1, "latex": "x = 1"},
            ],
        },
        {
            "problem": "x = 1",
            "steps": [
                {"line_number": 1, "latex": "x = 1"},
                {"line_number": 1, "latex": "x = 1"},
            ],
        },
        {
            "problem": "1" * 257,
            "steps": [{"line_number": 1, "latex": "1"}],
        },
    ],
)
def test_check_rejects_invalid_request_shape(payload) -> None:
    response = client.post("/check", json=payload)

    assert response.status_code == 422


@patch("main.transcribe_line", return_value=("3*x - 12 = 2*x + 5", False))
def test_transcribe_contract(mock_transcribe) -> None:
    response = client.post("/transcribe", json={"image_base64": "mock-image"})

    assert response.status_code == 200
    assert response.json() == {
        "text": "3*x - 12 = 2*x + 5",
        "unreadable": False,
    }
    mock_transcribe.assert_called_once_with("mock-image")


@patch("main.transcribe_line", side_effect=TranscriptionInputError("invalid PNG"))
def test_transcribe_maps_bad_input_to_422(_mock_transcribe) -> None:
    response = client.post("/transcribe", json={"image_base64": "bad"})

    assert response.status_code == 422
    assert response.json() == {"detail": "invalid PNG"}


@patch("main.transcribe_line", side_effect=TranscriptionServiceError("offline"))
def test_transcribe_hides_service_error(_mock_transcribe) -> None:
    response = client.post("/transcribe", json={"image_base64": "valid"})

    assert response.status_code == 503
    assert response.json() == {"detail": "Transcription is temporarily unavailable"}


def test_functional_group_check_accepts_a_matching_molecule() -> None:
    response = client.post(
        "/chemistry/functional-group",
        json={
            "target_group": "ester",
            "steps": [{"line_number": 1, "smiles": "CC(=O)OC"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [
            {
                "line_number": 1,
                "valid": True,
                "error_type": None,
                "detail": None,
                "status": "valid",
            }
        ],
        "first_wrong_line": None,
        "problem_error": None,
    }


def test_functional_group_check_reports_first_wrong_group() -> None:
    response = client.post(
        "/chemistry/functional-group",
        json={
            "target_group": "alcohol",
            "steps": [
                {"line_number": 1, "smiles": "CCOCC"},
                {"line_number": 2, "smiles": "CCO"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] == 1
    assert body["verdicts"][0]["error_type"] == "wrong_functional_group"
    assert [item["status"] for item in body["verdicts"]] == ["invalid", "valid"]


def test_functional_group_non_student_errors_do_not_set_first_wrong_line() -> None:
    response = client.post(
        "/chemistry/functional-group",
        json={
            "target_group": "alcohol",
            "steps": [
                {"line_number": 1, "smiles": "C1CC"},
                {"line_number": 2, "smiles": "CCO.Cl"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] is None
    assert [item["status"] for item in body["verdicts"]] == [
        "parse_error",
        "unsupported",
    ]


def test_functional_group_unknown_group_is_a_422_not_a_verdict() -> None:
    response = client.post(
        "/chemistry/functional-group",
        json={
            "target_group": "alkene",
            "steps": [{"line_number": 1, "smiles": "CCO"}],
        },
    )

    assert response.status_code == 422
    assert "unknown functional group" in response.json()["detail"]


def test_balance_check_accepts_a_balanced_equation() -> None:
    response = client.post(
        "/chemistry/balance",
        json={
            "reference_equation": "H2 + O2 -> H2O",
            "steps": [{"line_number": 1, "equation": "2H2 + O2 -> 2H2O"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [
            {
                "line_number": 1,
                "valid": True,
                "error_type": None,
                "detail": None,
                "status": "valid",
            }
        ],
        "first_wrong_line": None,
        "problem_error": None,
    }


def test_balance_check_reports_unbalanced_atoms() -> None:
    response = client.post(
        "/chemistry/balance",
        json={
            "reference_equation": "H2 + O2 -> H2O",
            "steps": [
                {"line_number": 1, "equation": "H2 + O2 -> H2O"},
                {"line_number": 2, "equation": "2H2 + O2 -> 2H2O"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] == 1
    assert body["verdicts"][0]["error_type"] == "unbalanced_atoms"
    assert [item["status"] for item in body["verdicts"]] == ["invalid", "valid"]


def test_balance_check_reports_unbalanced_charge_for_a_half_reaction() -> None:
    response = client.post(
        "/chemistry/balance",
        json={
            "reference_equation": "Fe^3+ + e- -> Fe^2+",
            "steps": [{"line_number": 1, "equation": "Fe^3+ + 2e- -> Fe^2+"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["verdicts"][0]["error_type"] == "unbalanced_charge"
    assert body["first_wrong_line"] == 1


def test_balance_check_malformed_reference_returns_problem_error() -> None:
    response = client.post(
        "/chemistry/balance",
        json={
            "reference_equation": "not an equation",
            "steps": [{"line_number": 1, "equation": "2H2 + O2 -> 2H2O"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "verdicts": [],
        "first_wrong_line": None,
        "problem_error": "parse_error",
    }


def test_balance_check_parse_error_is_not_a_student_mistake() -> None:
    response = client.post(
        "/chemistry/balance",
        json={
            "reference_equation": "H2 + O2 -> H2O",
            "steps": [{"line_number": 1, "equation": "2H2 + O2 2H2O"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["first_wrong_line"] is None
    assert body["verdicts"][0]["status"] == "parse_error"


@pytest.mark.parametrize(
    "payload",
    [
        {"target_group": "ester", "steps": []},
        {"target_group": "", "steps": [{"line_number": 1, "smiles": "CCO"}]},
        {
            "target_group": "ester",
            "steps": [{"line_number": 0, "smiles": "CCO"}],
        },
        {
            "target_group": "ester",
            "steps": [
                {"line_number": 2, "smiles": "CCO"},
                {"line_number": 1, "smiles": "CCO"},
            ],
        },
    ],
)
def test_functional_group_rejects_invalid_request_shape(payload) -> None:
    response = client.post("/chemistry/functional-group", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"reference_equation": "H2 + O2 -> H2O", "steps": []},
        {
            "reference_equation": "H2 + O2 -> H2O",
            "steps": [{"line_number": 0, "equation": "2H2 + O2 -> 2H2O"}],
        },
        {
            "reference_equation": "H2 + O2 -> H2O",
            "steps": [
                {"line_number": 2, "equation": "2H2 + O2 -> 2H2O"},
                {"line_number": 1, "equation": "2H2 + O2 -> 2H2O"},
            ],
        },
        {
            "reference_equation": "H" * 513,
            "steps": [{"line_number": 1, "equation": "2H2 + O2 -> 2H2O"}],
        },
    ],
)
def test_balance_rejects_invalid_request_shape(payload) -> None:
    response = client.post("/chemistry/balance", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "error_type",
    [
        "structure_mismatch",
        "wrong_functional_group",
        "unbalanced_atoms",
        "unbalanced_charge",
    ],
)
def test_hint_accepts_chemistry_error_categories(error_type) -> None:
    """The /hint contract has to admit every category a judge can emit, or
    a chemistry verdict has no reachable hint."""
    response = client.post(
        "/hint",
        json={"line_number": 1, "error_type": error_type, "level": 2},
    )

    assert response.status_code == 200
    assert response.json()["hint"].strip()


def test_hint_contract() -> None:
    response = client.post(
        "/hint",
        json={
            "line_number": 1,
            "error_type": "sign",
            "level": 2,
        },
    )

    assert response.status_code == 200
    assert response.json()["level"] == 2
    assert response.json()["max_level"] == 3
    assert "sign" in response.json()["hint"].lower()

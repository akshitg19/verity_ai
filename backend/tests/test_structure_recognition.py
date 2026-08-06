import base64
from unittest.mock import patch

import pytest
from google.auth.exceptions import RefreshError

from structure_recognition import (
    PROMPT,
    TranscriptionInputError,
    TranscriptionServiceError,
    _clean,
    transcribe_structure,
)


PNG = base64.b64encode(b"\x89PNG\r\n\x1a\ncontent").decode("ascii")


def mock_response(text: str):
    """Shape a stub matching the one field the module reads."""
    return type("Response", (), {"text": text})()


# --------------------------------------------------------------------------
# Output cleaning. Every case here is a wrapper the model has been asked not
# to produce, so the cleaner exists to survive it, not to bless it.
# --------------------------------------------------------------------------


def test_clean_passes_through_a_bare_smiles():
    assert _clean("CCO") == "CCO"


def test_clean_strips_markdown_code_fences():
    assert _clean("```\nCCO\n```") == "CCO"


def test_clean_strips_a_language_tagged_code_fence():
    assert _clean("```smiles\nCC(=O)OC\n```") == "CC(=O)OC"


def test_clean_strips_inline_backticks():
    assert _clean("`c1ccccc1`") == "c1ccccc1"


def test_clean_strips_a_label_prefix():
    assert _clean("SMILES: CCO") == "CCO"
    assert _clean("smiles = CCO") == "CCO"


def test_clean_removes_whitespace_inside_the_smiles():
    assert _clean("CC (=O) OC") == "CC(=O)OC"


def test_clean_preserves_case_because_smiles_is_case_sensitive():
    """Lowercase means aromatic: c1ccccc1 and C1CCCCC1 are different rings."""
    assert _clean("c1ccccc1") == "c1ccccc1"
    assert _clean("C1CCCCC1") == "C1CCCCC1"


# --------------------------------------------------------------------------
# Prompt contract
# --------------------------------------------------------------------------


def test_prompt_lists_the_judge_supported_elements():
    for symbol in ["C", "N", "O", "F", "P", "S", "Cl", "Br", "I"]:
        assert symbol in PROMPT


def test_prompt_forbids_prose_and_fences():
    assert "nothing else on that line" in " ".join(PROMPT.split())
    assert "markdown" in PROMPT


def test_prompt_defines_the_unreadable_fallback():
    assert "UNREADABLE" in PROMPT


# --------------------------------------------------------------------------
# transcribe_structure
# --------------------------------------------------------------------------


@patch("model._create_client")
def test_transcribe_structure_returns_cleaned_smiles(mock_create_client):
    mock_create_client.return_value.models.generate_content.return_value = (
        mock_response("```\nCCO\n```")
    )

    smiles, unreadable, _confidence, _latency = transcribe_structure(PNG)

    assert smiles == "CCO"
    assert unreadable is False


@patch("model._create_client")
def test_transcribe_structure_flags_unreadable_drawing(mock_create_client):
    mock_create_client.return_value.models.generate_content.return_value = (
        mock_response("UNREADABLE")
    )

    smiles, unreadable, _confidence, _latency = transcribe_structure(PNG)

    assert unreadable is True
    assert smiles == ""


@patch("model._create_client")
def test_transcribe_structure_treats_empty_output_as_unreadable(mock_create_client):
    mock_create_client.return_value.models.generate_content.return_value = (
        mock_response("")
    )

    smiles, unreadable, _confidence, _latency = transcribe_structure(PNG)

    assert unreadable is True
    assert smiles == ""


@patch("model._create_client")
def test_transcribe_structure_does_not_validate_chemistry(mock_create_client):
    """Recognition only reads. Whether the SMILES is valid or in scope is
    the judge's decision, and the student can fix a misread one first."""
    mock_create_client.return_value.models.generate_content.return_value = (
        mock_response("C1CC")
    )

    smiles, unreadable, _confidence, _latency = transcribe_structure(PNG)

    assert smiles == "C1CC"
    assert unreadable is False


def test_transcribe_structure_rejects_invalid_base64():
    with pytest.raises(TranscriptionInputError, match="valid Base64"):
        transcribe_structure("not base64!")


def test_transcribe_structure_rejects_non_png_data():
    value = base64.b64encode(b"plain text").decode("ascii")

    with pytest.raises(TranscriptionInputError, match="PNG image"):
        transcribe_structure(value)


@patch("model._create_client")
def test_transcribe_structure_maps_missing_credentials_to_service_error(
    mock_create_client,
):
    mock_create_client.return_value.models.generate_content.side_effect = (
        RefreshError("reauthentication needed")
    )

    with pytest.raises(TranscriptionServiceError):
        transcribe_structure(PNG)


@patch(
    "model._create_client",
    side_effect=ValueError("bad configuration"),
)
def test_transcribe_structure_maps_configuration_failure_to_service_error(
    _mock_create_client,
):
    with pytest.raises(TranscriptionServiceError):
        transcribe_structure(PNG)


@patch("model._create_client")
def test_service_error_does_not_expose_provider_internals(mock_create_client):
    """A raised credential message must not travel out to the caller."""
    mock_create_client.return_value.models.generate_content.side_effect = (
        RefreshError("token for service-account@secret-project.iam expired")
    )

    with pytest.raises(TranscriptionServiceError) as exc_info:
        transcribe_structure(PNG)

    assert "secret-project" not in str(exc_info.value)

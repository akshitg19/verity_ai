import base64
from unittest.mock import patch

import pytest
from google.auth.exceptions import RefreshError

from transcription import (
    TranscriptionInputError,
    TranscriptionServiceError,
    _create_client,
    _decode_png,
    transcribe_line,
)


def test_decode_png_rejects_invalid_base64() -> None:
    with pytest.raises(TranscriptionInputError, match="valid Base64"):
        _decode_png("not base64!")


def test_decode_png_rejects_non_png_data() -> None:
    value = base64.b64encode(b"plain text").decode("ascii")

    with pytest.raises(TranscriptionInputError, match="PNG image"):
        _decode_png(value)


def test_decode_png_accepts_png_signature() -> None:
    value = base64.b64encode(b"\x89PNG\r\n\x1a\ncontent").decode("ascii")

    assert _decode_png(value) == b"\x89PNG\r\n\x1a\ncontent"


@patch("transcription.genai.Client")
def test_create_client_is_reused(mock_client) -> None:
    _create_client.cache_clear()
    try:
        assert _create_client() is _create_client()
        mock_client.assert_called_once()
    finally:
        _create_client.cache_clear()


@patch("transcription._create_client")
def test_transcribe_maps_missing_credentials_to_service_error(mock_create_client) -> None:
    mock_create_client.return_value.models.generate_content.side_effect = (
        RefreshError("reauthentication needed")
    )
    value = base64.b64encode(b"\x89PNG\r\n\x1a\ncontent").decode("ascii")

    with pytest.raises(TranscriptionServiceError):
        transcribe_line(value)


@patch("transcription._create_client", side_effect=ValueError("bad configuration"))
def test_transcribe_maps_client_configuration_failure_to_service_error(
    _mock_create_client,
) -> None:
    value = base64.b64encode(b"\x89PNG\r\n\x1a\ncontent").decode("ascii")

    with pytest.raises(TranscriptionServiceError):
        transcribe_line(value)

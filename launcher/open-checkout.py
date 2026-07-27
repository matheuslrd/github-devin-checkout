#!/usr/bin/env python3
"""Launch Devin's checkout-issue-branches workflow for one GitHub issue."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote_to_bytes, urlsplit


CUSTOM_SCHEME = "devin-checkout"
CUSTOM_HOST = "run"
GITHUB_HOST = "github.com"
ORGANIZATION = "ContatoSeguro"
ISSUE_PATH = re.compile(
    rf"^/{re.escape(ORGANIZATION)}/([A-Za-z0-9._-]+)/issues/([1-9][0-9]*)$"
)
INVALID_PERCENT_ESCAPE = re.compile(r"%(?![0-9A-Fa-f]{2})")


class ValidationError(ValueError):
    """Raised when a custom URI or issue URL is outside the accepted format."""


def decode_query_component(value: str) -> str:
    if INVALID_PERCENT_ESCAPE.search(value):
        raise ValidationError("a URI contém um escape percent-encoded inválido")

    try:
        return unquote_to_bytes(value).decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValidationError("a URI contém texto UTF-8 inválido") from error


def validate_issue_url(issue_url: str) -> str:
    if not issue_url or issue_url != issue_url.strip():
        raise ValidationError("a URL da issue não pode estar vazia ou conter espaços")

    try:
        parsed = urlsplit(issue_url)
    except ValueError as error:
        raise ValidationError("a URL da issue é inválida") from error

    if parsed.scheme != "https":
        raise ValidationError("a URL da issue deve usar HTTPS")
    if parsed.netloc != GITHUB_HOST:
        raise ValidationError("a URL da issue deve usar o host github.com")
    if parsed.query or parsed.fragment:
        raise ValidationError("a URL da issue não pode conter query string ou fragmento")

    match = ISSUE_PATH.fullmatch(parsed.path)
    if not match:
        raise ValidationError(
            "a URL deve seguir https://github.com/ContatoSeguro/<repo>/issues/<numero>"
        )

    repository, issue_number = match.groups()
    return f"https://{GITHUB_HOST}/{ORGANIZATION}/{repository}/issues/{issue_number}"


def parse_custom_uri(uri: str) -> str:
    if not uri or uri != uri.strip():
        raise ValidationError("a URI não pode estar vazia ou conter espaços")

    try:
        parsed = urlsplit(uri)
    except ValueError as error:
        raise ValidationError("a URI customizada é inválida") from error

    if parsed.scheme != CUSTOM_SCHEME or parsed.netloc != CUSTOM_HOST:
        raise ValidationError("use o formato devin-checkout://run?issue=<URL_ENCODED>")
    if parsed.path or parsed.fragment:
        raise ValidationError("a URI customizada não pode conter caminho ou fragmento")
    if not parsed.query:
        raise ValidationError("a URI customizada precisa de um parâmetro issue")

    query_parts = parsed.query.split("&")
    if len(query_parts) != 1 or "=" not in query_parts[0]:
        raise ValidationError("a URI deve conter somente um parâmetro issue")

    raw_key, raw_value = query_parts[0].split("=", 1)
    if decode_query_component(raw_key) != "issue":
        raise ValidationError("a URI deve conter somente o parâmetro issue")
    if not raw_value:
        raise ValidationError("o parâmetro issue não pode estar vazio")

    return validate_issue_url(decode_query_component(raw_value))


def error(message: str) -> int:
    print(f"devin-checkout: {message}", file=sys.stderr)
    return 2


def main(arguments: list[str]) -> int:
    if len(arguments) != 1:
        return error(
            "uso: open-checkout.py 'devin-checkout://run?issue=<URL_ENCODED>'"
        )

    try:
        issue_url = parse_custom_uri(arguments[0])
    except ValidationError as validation_error:
        return error(str(validation_error))

    terminal = shutil.which("gnome-terminal")
    if not terminal:
        return error("gnome-terminal não foi encontrado no PATH")

    home = Path.home()
    devin = home / ".local" / "bin" / "devin"
    working_directory = home / "projects" / "developer-env"

    if not devin.is_file() or not os.access(devin, os.X_OK):
        return error(f"o Devin CLI executável não foi encontrado em {devin}")
    if not working_directory.is_dir():
        return error(f"o diretório de trabalho não foi encontrado em {working_directory}")

    prompt = f"Use the checkout-issue-branches skill for {issue_url}"
    command = [
        terminal,
        f"--working-directory={working_directory}",
        "--",
        str(devin),
        "--",
        prompt,
    ]

    try:
        subprocess.Popen(command)
    except OSError as launch_error:
        return error(f"não foi possível abrir o GNOME Terminal: {launch_error}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

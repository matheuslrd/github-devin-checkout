#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'devin-checkout: %s\n' "$1" >&2
  exit 1
}

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
LAUNCHER_PATH="$PROJECT_DIR/launcher/open-checkout.py"
APPLICATIONS_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$APPLICATIONS_DIR/devin-checkout.desktop"

command -v gnome-terminal >/dev/null 2>&1 \
  || fail 'gnome-terminal não foi encontrado no PATH.'

DEVIN_PATH="$HOME/.local/bin/devin"
[[ -x "$DEVIN_PATH" ]] \
  || fail "o Devin CLI executável não foi encontrado em $DEVIN_PATH."

WORKING_DIRECTORY="$HOME/projects/developer-env"
[[ -d "$WORKING_DIRECTORY" ]] \
  || fail "o diretório de trabalho não foi encontrado em $WORKING_DIRECTORY."

[[ -f "$LAUNCHER_PATH" ]] \
  || fail "o launcher não foi encontrado em $LAUNCHER_PATH."

PYTHON3_PATH="$(command -v python3)" \
  || fail 'python3 não foi encontrado no PATH.'
XDG_MIME_PATH="$(command -v xdg-mime)" \
  || fail 'xdg-mime não foi encontrado no PATH.'

mkdir -p -- "$APPLICATIONS_DIR"

TEMP_DESKTOP="$(mktemp "$APPLICATIONS_DIR/.devin-checkout.XXXXXX")"
cleanup() {
  rm -f -- "$TEMP_DESKTOP"
}
trap cleanup EXIT

{
  printf '%s\n' '[Desktop Entry]'
  printf '%s\n' 'Version=1.0'
  printf '%s\n' 'Type=Application'
  printf '%s\n' 'Name=Devin Checkout'
  printf '%s\n' 'Comment=Run Devin checkout workflow for a GitHub issue'
  printf '%s\n' 'NoDisplay=true'
  printf '%s\n' 'Terminal=false'
  printf 'TryExec=%s\n' "$PYTHON3_PATH"
  printf 'Exec=%s %s %%u\n' "$PYTHON3_PATH" "$LAUNCHER_PATH"
  printf '%s\n' 'MimeType=x-scheme-handler/devin-checkout;'
} > "$TEMP_DESKTOP"

chmod 0644 "$TEMP_DESKTOP"
mv -- "$TEMP_DESKTOP" "$DESKTOP_FILE"
trap - EXIT

"$XDG_MIME_PATH" default "$(basename -- "$DESKTOP_FILE")" \
  x-scheme-handler/devin-checkout \
  || fail 'não foi possível registrar o handler com xdg-mime.'

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

REGISTERED_HANDLER="$("$XDG_MIME_PATH" query default x-scheme-handler/devin-checkout 2>/dev/null || true)"
[[ "$REGISTERED_HANDLER" == "$(basename -- "$DESKTOP_FILE")" ]] \
  || fail 'o handler foi criado, mas não foi selecionado como padrão.'

printf '\nInstalação concluída.\n\n'
printf '%s\n' 'Próximos passos:'
printf '%s\n' '1. Abra chrome://extensions, ative o Modo do desenvolvedor e clique em Carregar sem compactação.'
printf '2. Selecione: %s\n' "$PROJECT_DIR/chrome-extension"
printf '%s\n' '3. Abra uma issue da organização ContatoSeguro e clique no ícone de branch (tooltip “Checkout branches”).'
printf '%s\n' '4. Autorize a abertura do protocolo externo na primeira utilização.'
printf '\nHandler registrado: %s\n' "$DESKTOP_FILE"

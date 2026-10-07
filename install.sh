#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'contato-seguro: %s\n' "$1" >&2
  exit 1
}

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
CHECKOUT_LAUNCHER="$PROJECT_DIR/launcher/open-checkout.py"
ACTION_LAUNCHER="$PROJECT_DIR/launcher/open-contato-seguro.py"
APPLICATIONS_DIR="$HOME/.local/share/applications"
CHECKOUT_DESKTOP="$APPLICATIONS_DIR/devin-checkout.desktop"
ACTION_DESKTOP="$APPLICATIONS_DIR/contato-seguro.desktop"

command -v gnome-terminal >/dev/null 2>&1 \
  || fail 'gnome-terminal não foi encontrado no PATH.'

command -v gh >/dev/null 2>&1 \
  || fail 'o gh CLI não foi encontrado no PATH.'
gh auth status >/dev/null 2>&1 \
  || fail 'o gh CLI não está autenticado. Execute: gh auth login --scopes project'

WORKING_DIRECTORY="$HOME/projects/developer-env"
[[ -d "$WORKING_DIRECTORY" ]] \
  || fail "o diretório de trabalho não foi encontrado em $WORKING_DIRECTORY."

MASS_CHECKOUT_DIR="$WORKING_DIRECTORY/scripts/mass-checkout"
for stage in list-sub-issues.sh check-local-status.sh checkout.sh; do
  [[ -x "$MASS_CHECKOUT_DIR/$stage" ]] \
    || fail "o script executável não foi encontrado em $MASS_CHECKOUT_DIR/$stage."
done

[[ -f "$CHECKOUT_LAUNCHER" ]] \
  || fail "o launcher não foi encontrado em $CHECKOUT_LAUNCHER."
[[ -f "$ACTION_LAUNCHER" ]] \
  || fail "o launcher não foi encontrado em $ACTION_LAUNCHER."

PYTHON3_PATH="$(command -v python3)" \
  || fail 'python3 não foi encontrado no PATH.'
XDG_MIME_PATH="$(command -v xdg-mime)" \
  || fail 'xdg-mime não foi encontrado no PATH.'

mkdir -p -- "$APPLICATIONS_DIR"

register_handler() {
  local desktop_file="$1"
  local launcher_path="$2"
  local app_name="$3"
  local comment="$4"
  local scheme="$5"
  local temp_desktop

  temp_desktop="$(mktemp "$APPLICATIONS_DIR/.contato-seguro.XXXXXX")"
  cleanup() {
    rm -f -- "$temp_desktop"
  }
  trap cleanup EXIT

  {
    printf '%s\n' '[Desktop Entry]'
    printf '%s\n' 'Version=1.0'
    printf '%s\n' 'Type=Application'
    printf 'Name=%s\n' "$app_name"
    printf 'Comment=%s\n' "$comment"
    printf '%s\n' 'NoDisplay=true'
    printf '%s\n' 'Terminal=false'
    printf 'TryExec=%s\n' "$PYTHON3_PATH"
    printf 'Exec=%s %s %%u\n' "$PYTHON3_PATH" "$launcher_path"
    printf 'MimeType=x-scheme-handler/%s;\n' "$scheme"
  } > "$temp_desktop"

  chmod 0644 "$temp_desktop"
  mv -- "$temp_desktop" "$desktop_file"
  trap - EXIT

  "$XDG_MIME_PATH" default "$(basename -- "$desktop_file")" \
    "x-scheme-handler/$scheme" \
    || fail "não foi possível registrar o handler $scheme com xdg-mime."

  local registered
  registered="$("$XDG_MIME_PATH" query default "x-scheme-handler/$scheme" 2>/dev/null || true)"
  [[ "$registered" == "$(basename -- "$desktop_file")" ]] \
    || fail "o handler $scheme foi criado, mas não foi selecionado como padrão."
}

register_handler \
  "$CHECKOUT_DESKTOP" \
  "$CHECKOUT_LAUNCHER" \
  'Contato Seguro Checkout' \
  'Check out the issue branches of a GitHub issue' \
  'devin-checkout'

register_handler \
  "$ACTION_DESKTOP" \
  "$ACTION_LAUNCHER" \
  'Contato Seguro' \
  'Move a GitHub issue card on the team board' \
  'contato-seguro'

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
fi

printf '\nInstalação concluída.\n\n'
printf '%s\n' 'Próximos passos:'
printf '%s\n' '1. Abra chrome://extensions, ative o Modo do desenvolvedor e clique em Carregar sem compactação.'
printf '2. Selecione: %s\n' "$PROJECT_DIR/chrome-extension"
printf '%s\n' '3. Autorize a abertura do protocolo externo na primeira utilização.'
printf '\nHandlers registrados:\n'
printf '%s\n' "$CHECKOUT_DESKTOP"
printf '%s\n' "$ACTION_DESKTOP"

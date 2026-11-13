#!/usr/bin/env bash
# Pubblica l'ULTIMO COMMIT nell'istanza di deploy locale e la (ri)avvia.
# Le modifiche non committate non vengono mai pubblicate. I dati non vengono toccati.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
VTT_HOME="${VTT_HOME:-$HOME/Library/Application Support/VTT}"
APP_DIR="$VTT_HOME/app"
STAGING="$VTT_HOME/app.new"
PREVIOUS="$VTT_HOME/app.prev"

cd "$REPO"
COMMIT="$(git rev-parse --short HEAD)"
SUBJECT="$(git log -1 --format=%s)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠ Ci sono modifiche non committate: NON verranno pubblicate (si pubblica $COMMIT)."
fi

echo "→ Preparo $COMMIT \"$SUBJECT\""
rm -rf "$STAGING"
mkdir -p "$STAGING"
git archive HEAD | tar -x -C "$STAGING"
echo "$COMMIT $SUBJECT ($(date '+%Y-%m-%d %H:%M'))" >"$STAGING/RELEASE"

cd "$STAGING"
echo "→ Installo le dipendenze"
pnpm install --frozen-lockfile --prefer-offline --reporter=silent
echo "→ Typecheck e test"
pnpm -s typecheck >/dev/null
pnpm -s test >/dev/null
echo "→ Build del client"
pnpm -s build >/dev/null

echo "→ Sostituisco la release"
"$REPO/scripts/vtt.sh" stop
rm -rf "$PREVIOUS"
[[ -d "$APP_DIR" ]] && mv "$APP_DIR" "$PREVIOUS"
mv "$STAGING" "$APP_DIR"

if ! "$REPO/scripts/vtt.sh" start; then
  if [[ -d "$PREVIOUS" ]]; then
    echo "✗ Avvio fallito: ripristino la release precedente." >&2
    rm -rf "$APP_DIR"
    mv "$PREVIOUS" "$APP_DIR"
    "$REPO/scripts/vtt.sh" start || true
  fi
  exit 1
fi
echo "✓ Release $COMMIT pubblicata."

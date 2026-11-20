#!/usr/bin/env bash
# Gestione dell'istanza di deploy locale (separata da `pnpm dev`).
# Uso: scripts/vtt.sh start|stop|restart|status|logs
set -euo pipefail

VTT_HOME="${VTT_HOME:-$HOME/Library/Application Support/VTT}"
APP_DIR="$VTT_HOME/app"
DATA_DIR="$VTT_HOME/data"
LOG_FILE="$VTT_HOME/vtt.log"
PID_FILE="$VTT_HOME/vtt.pid"
PORT="${VTT_PORT:-8080}"
# In ascolto su tutte le interfacce: i dispositivi della rete locale (telefoni, tablet dei giocatori) si collegano.
# VTT_HOST=127.0.0.1 per tenerla solo su questo Mac.
HOST="${VTT_HOST:-0.0.0.0}"
# I controlli di salute passano sempre dal loopback, qualunque sia l'interfaccia di ascolto.
URL="http://127.0.0.1:$PORT"

# Indirizzi da cui la raggiungono gli altri dispositivi (vuoto se ascolta solo in locale o il Mac non è in rete).
lan_urls() {
  [[ "$HOST" == "127.0.0.1" || "$HOST" == "localhost" || "$HOST" == "::1" ]] && return 0
  if [[ "$HOST" != "0.0.0.0" && "$HOST" != "::" ]]; then echo "http://$HOST:$PORT"; return 0; fi
  ifconfig 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" && $2 !~ /^169\.254\./ { print "http://" $2 ":'"$PORT"'" }'
}

print_lan_urls() {
  local urls
  urls="$(lan_urls)"
  if [[ -n "$urls" ]]; then echo "In rete locale:"; sed 's/^/  /' <<<"$urls"; fi
}

running_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then echo "$pid"; else rm -f "$PID_FILE"; return 1; fi
}

start() {
  if pid="$(running_pid)"; then echo "VTT è già in esecuzione (pid $pid) su $URL"; return 0; fi
  if [[ ! -d "$APP_DIR" ]]; then echo "Nessuna release installata: esegui prima 'pnpm release'." >&2; return 1; fi
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "La porta $PORT è già occupata da un altro processo (VTT_PORT per cambiarla)." >&2; return 1
  fi
  mkdir -p "$DATA_DIR"
  echo "--- avvio $(date '+%Y-%m-%d %H:%M:%S') ---" >>"$LOG_FILE"
  (
    cd "$APP_DIR/apps/server"
    NODE_ENV=production PORT="$PORT" HOST="$HOST" VTT_DATA_DIR="$DATA_DIR" \
      nohup node --import tsx src/index.ts >>"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  )
  for _ in $(seq 1 40); do
    if curl -sf "$URL/api/combat" >/dev/null 2>&1; then echo "VTT avviato su $URL (pid $(cat "$PID_FILE"))"; print_lan_urls; return 0; fi
    if ! running_pid >/dev/null; then break; fi
    sleep 0.25
  done
  echo "Avvio non riuscito. Ultime righe del log ($LOG_FILE):" >&2
  tail -n 20 "$LOG_FILE" >&2
  stop >/dev/null 2>&1 || true
  return 1
}

stop() {
  local pid
  if ! pid="$(running_pid)"; then echo "VTT non è in esecuzione."; return 0; fi
  kill -TERM "$pid"
  for _ in $(seq 1 40); do
    kill -0 "$pid" 2>/dev/null || { rm -f "$PID_FILE"; echo "VTT fermato."; return 0; }
    sleep 0.25
  done
  echo "Il processo $pid non si è fermato entro 10 s, lo forzo." >&2
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
}

status() {
  local pid
  if pid="$(running_pid)"; then
    if curl -sf "$URL/api/combat" >/dev/null 2>&1; then echo "In esecuzione (pid $pid) su $URL"; print_lan_urls; else echo "Processo attivo (pid $pid) ma $URL non risponde"; fi
  else
    echo "Fermo."
  fi
  [[ -f "$APP_DIR/RELEASE" ]] && echo "Release: $(cat "$APP_DIR/RELEASE")"
  echo "Dati: $DATA_DIR"
  echo "Log:  $LOG_FILE"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) touch "$LOG_FILE"; tail -n 50 -f "$LOG_FILE" ;;
  *) echo "Uso: $0 start|stop|restart|status|logs" >&2; exit 2 ;;
esac

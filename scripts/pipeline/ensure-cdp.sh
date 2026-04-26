#!/usr/bin/env bash
# ============================================================
# ensure-cdp.sh — Maintain a HEADLESS Obsidian instance for E2E
# ============================================================
# Spawns and persists a dedicated Obsidian instance on a virtual
# display (Xvfb) with an isolated user-data-dir, exposing CDP on
# port 9222. The user's primary Obsidian on :0 is NEVER touched.
#
# Safe to call from cron. Idempotent: each invocation only restarts
# the components that are down (Xvfb / Obsidian / CDP).
#
# Components:
#   - Xvfb           on $E2E_DISPLAY (default :99), 1920x1080x24
#   - Obsidian       --user-data-dir=$E2E_USER_DATA_DIR
#                    --remote-debugging-port=9222
#                    --no-sandbox
#
# First run bootstraps $E2E_USER_DATA_DIR by rsync'ing from the
# user's main ~/.config/obsidian so the test vault and plugin state
# come along automatically. Subsequent runs reuse it.
#
# Usage:
#   bash scripts/pipeline/ensure-cdp.sh        → exits 0 / 1
#   source scripts/pipeline/ensure-cdp.sh      → exposes ensure_cdp()
# ============================================================
set -uo pipefail

# ── Config (overridable via env) ─────────────────────────────
CDP_PORT="${CDP_PORT:-9222}"
CDP_URL="${CDP_URL:-http://localhost:$CDP_PORT/json/version}"
E2E_DISPLAY="${E2E_DISPLAY:-:99}"
E2E_USER_DATA_DIR="${E2E_USER_DATA_DIR:-$HOME/.config/obsidian-e2e}"
MAIN_USER_DATA_DIR="${MAIN_USER_DATA_DIR:-$HOME/.config/obsidian}"
OBSIDIAN_BIN="${OBSIDIAN_BIN:-/opt/Obsidian/obsidian}"
WAIT_SECS="${WAIT_SECS:-60}"
LOG_PREFIX="${LOG_PREFIX:-ensure-cdp}"
XVFB_LOG="${XVFB_LOG:-/tmp/obsidian-e2e-xvfb.log}"
OBSIDIAN_LOG="${OBSIDIAN_LOG:-/tmp/obsidian-e2e-launch.log}"
PIDS_DIR="${PIDS_DIR:-/tmp/obsidian-e2e}"

mkdir -p "$PIDS_DIR"
XVFB_PIDFILE="$PIDS_DIR/xvfb.pid"
OBSIDIAN_PIDFILE="$PIDS_DIR/obsidian.pid"

_log() { echo "[$(date -Iseconds)] [$LOG_PREFIX] $*" >&2; }

_alive() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] || return 1
  local pid; pid=$(cat "$pidfile" 2>/dev/null || echo 0)
  [[ -n "$pid" && "$pid" -gt 0 ]] && kill -0 "$pid" 2>/dev/null
}

_cdp_alive() {
  curl -sf --max-time 2 "$CDP_URL" >/dev/null 2>&1
}

# ── Bootstrap user-data-dir from main config (one time) ──────
_bootstrap_user_data_dir() {
  if [[ -f "$E2E_USER_DATA_DIR/obsidian.json" ]]; then
    return 0
  fi
  if [[ ! -d "$MAIN_USER_DATA_DIR" ]]; then
    _log "ERROR: main user-data-dir $MAIN_USER_DATA_DIR not found; cannot bootstrap"
    return 1
  fi
  _log "Bootstrapping $E2E_USER_DATA_DIR from $MAIN_USER_DATA_DIR (first run)"
  mkdir -p "$E2E_USER_DATA_DIR"
  # Skip volatile chrome/electron state — they'll be regenerated.
  rsync -a \
    --exclude='Singleton*' \
    --exclude='Crashpad/' \
    --exclude='GPUCache/' \
    --exclude='DawnGraphiteCache/' \
    --exclude='DawnWebGPUCache/' \
    --exclude='ShaderCache/' \
    --exclude='code Cache/' \
    --exclude='Code Cache/' \
    --exclude='Cache/' \
    --exclude='component_crx_cache/' \
    --exclude='extensions_crx_cache/' \
    "$MAIN_USER_DATA_DIR"/ "$E2E_USER_DATA_DIR"/ \
    >/dev/null 2>&1 || {
      _log "ERROR: rsync failed during bootstrap"
      return 1
    }
  _log "Bootstrap complete"
}

# ── Xvfb ─────────────────────────────────────────────────────
_ensure_xvfb() {
  if _alive "$XVFB_PIDFILE"; then
    return 0
  fi
  if ! command -v Xvfb >/dev/null 2>&1; then
    _log "ERROR: Xvfb not installed (apt install xvfb)"
    return 1
  fi
  # Free up the display lock if a stale Xvfb died without cleaning up
  local n="${E2E_DISPLAY#:}"
  rm -f "/tmp/.X${n}-lock" "/tmp/.X11-unix/X${n}" 2>/dev/null || true

  _log "Starting Xvfb on $E2E_DISPLAY"
  nohup Xvfb "$E2E_DISPLAY" -screen 0 1920x1080x24 -nolisten tcp \
    >> "$XVFB_LOG" 2>&1 &
  local pid=$!
  echo "$pid" > "$XVFB_PIDFILE"

  # Wait for Xvfb socket
  local elapsed=0
  while (( elapsed < 10 )); do
    if [[ -S "/tmp/.X11-unix/X${n}" ]]; then
      _log "Xvfb up (PID=$pid)"
      return 0
    fi
    sleep 1; elapsed=$((elapsed+1))
  done
  _log "ERROR: Xvfb did not create socket within 10s"
  return 1
}

# ── Obsidian ─────────────────────────────────────────────────
_ensure_obsidian() {
  if _alive "$OBSIDIAN_PIDFILE" && _cdp_alive; then
    return 0
  fi

  # Stop any stale e2e Obsidian we previously launched
  if _alive "$OBSIDIAN_PIDFILE"; then
    local pid; pid=$(cat "$OBSIDIAN_PIDFILE")
    _log "Stopping stale e2e Obsidian PID=$pid"
    kill "$pid" 2>/dev/null || true
    sleep 2
    kill -9 "$pid" 2>/dev/null || true
  fi

  # Clean SingletonLock in our isolated dir
  rm -f "$E2E_USER_DATA_DIR"/Singleton{Lock,Cookie,Socket} 2>/dev/null || true

  if [[ ! -x "$OBSIDIAN_BIN" ]]; then
    _log "ERROR: $OBSIDIAN_BIN not executable"
    return 1
  fi

  _log "Launching Obsidian on $E2E_DISPLAY (user-data-dir=$E2E_USER_DATA_DIR)"
  DISPLAY="$E2E_DISPLAY" \
    nohup "$OBSIDIAN_BIN" \
      --user-data-dir="$E2E_USER_DATA_DIR" \
      --remote-debugging-port="$CDP_PORT" \
      --no-sandbox \
      --disable-gpu \
      >> "$OBSIDIAN_LOG" 2>&1 &
  local opid=$!
  echo "$opid" > "$OBSIDIAN_PIDFILE"
  _log "Obsidian PID=$opid — waiting for CDP on $CDP_URL"

  local elapsed=0
  while (( elapsed < WAIT_SECS )); do
    sleep 2; elapsed=$((elapsed+2))
    if _cdp_alive; then
      _log "CDP up after ${elapsed}s"
      return 0
    fi
    if ! kill -0 "$opid" 2>/dev/null; then
      _log "ERROR: Obsidian process died after ${elapsed}s"
      tail -20 "$OBSIDIAN_LOG" >&2 2>/dev/null || true
      return 1
    fi
  done
  _log "ERROR: CDP did not become reachable within ${WAIT_SECS}s"
  return 1
}

ensure_cdp() {
  # Fast path: already up
  if _alive "$XVFB_PIDFILE" && _alive "$OBSIDIAN_PIDFILE" && _cdp_alive; then
    return 0
  fi

  _bootstrap_user_data_dir || return 1
  _ensure_xvfb              || return 1
  _ensure_obsidian          || return 1
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  ensure_cdp
  exit $?
fi

#!/usr/bin/env bash
# ============================================================
# proposal-scorer.sh — screen pending feature-proposal issues
# ============================================================
# Runs at the START of each pipeline cycle. Reads every pending
# `source=feature-proposal` issue, asks Claude to score it on three
# axes (specificity / drama / novelty) and to issue ACCEPT or REJECT.
#
# REJECTed issues are:
#   - flipped to status=cancelled
#   - copied to scripts/pipeline/descriptions/rejected/<date>-<slug>.md
#     for archival / proposer-tuning signal
#
# ACCEPTed issues stay pending and the autonomous gate picks them up
# in priority order on later cycles.
#
# Generation of NEW proposals lives in feature-proposer.sh which runs
# at the END of the cycle.
#
# Usage:
#   ./proposal-scorer.sh --dry-run    # prints verdicts, no changes
#   ./proposal-scorer.sh --apply      # actually flips status + archives
#
# Suggested cron (right before any cron tick that may pickup):
#   */20 * * * * /path/to/proposal-scorer.sh --apply >> /tmp/graph-island-proposal-scorer.log 2>&1
# (or call from the start of autonomous-improve.sh)
# ============================================================
set -uo pipefail

case "${1:-}" in
  --dry-run) APPLY=0 ;;
  --apply)   APPLY=1 ;;
  *)
    echo "Usage: $0 --dry-run | --apply" >&2
    exit 2
    ;;
esac

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
cd "$PROJECT_DIR" || exit 1

echo "=== proposal-scorer ($(date -Iseconds)) ==="
echo "Mode: $([[ $APPLY -eq 1 ]] && echo apply || echo dry-run)"

# Skip if dirty (don't tangle with autonomous-improve mid-cycle)
if [[ -z "${SKIP_DIRTY_CHECK:-}" && -n "$(git status --porcelain)" ]]; then
  echo "SKIP: working tree dirty"
  exit 0
fi

# ── Collect pending feature-proposal issues ──
PENDING_FILE=$(mktemp)
python3 - <<'PY' > "$PENDING_FILE"
import csv, os, sys, json
out = []
DESC_DIR = 'scripts/pipeline/descriptions'
with open('scripts/pipeline/issues.csv') as f:
    for r in csv.DictReader(f):
        if r.get('source') != 'feature-proposal':
            continue
        if r.get('status') != 'pending':
            continue
        body = ''
        dpath = r.get('description_path') or ''
        full = os.path.join('scripts/pipeline', dpath) if dpath else ''
        if full and os.path.exists(full):
            body = open(full).read()
        out.append({'id': r['id'], 'summary': r.get('summary',''), 'body': body})
print(json.dumps(out, ensure_ascii=False))
PY

COUNT=$(python3 -c "import json; print(len(json.load(open('$PENDING_FILE'))))")
echo "Pending feature-proposals to score: $COUNT"
if [[ "$COUNT" == "0" ]]; then
  echo "Nothing to score."
  rm -f "$PENDING_FILE"
  exit 0
fi

# ── Build the critic prompt ──
PROMPT_FILE=$(mktemp)
{
  cat <<'EOF'
You are the critic for graph-island's feature-proposal queue.
Below are the currently-pending feature-proposal issues. For EACH one,
output exactly one block in the format below. No prose between or
around the blocks.

Score each on 1–10 (1=poor, 10=excellent):
  - specificity: are files / APIs / behaviors named precisely?
  - drama:       would a power user notice and tell a friend?
  - novelty:     not already trivially possible with existing UI?

Verdict = REJECT if ANY of:
  - specificity < 6 (vague handwave)
  - drama < 6 (incremental polish only)
  - duplicate of obvious existing capability
  - acceptance criteria are not observable
Otherwise verdict = ACCEPT.

Output format (strict — the parser depends on it):

---SCORE---
id: <copy id verbatim, e.g. 1376-hover-similar-suggest-top3>
specificity: <1-10>
drama: <1-10>
novelty: <1-10>
verdict: ACCEPT | REJECT
reason: <one sentence in Japanese>
---END---

# Pending proposals
EOF
  python3 - "$PENDING_FILE" <<'PY'
import json, sys
items = json.load(open(sys.argv[1]))
for it in items:
    print(f"\n## #{it['id']}")
    print(f"summary: {it['summary']}")
    print(it['body'][:3000])
PY
} > "$PROMPT_FILE"

OUT=$(mktemp)
claude -p "$(cat "$PROMPT_FILE")" --max-turns 1 > "$OUT" 2>&1 || true
echo ""
echo "=== claude critic output (first 30 lines) ==="
head -30 "$OUT"
echo "  ... ($(wc -l < "$OUT") total lines)"

# ── Parse + apply ──
python3 - "$OUT" "$APPLY" <<'PY'
import sys, re, subprocess, os, datetime, csv
out_path, apply_str = sys.argv[1:3]
APPLY = (apply_str == "1")
content = open(out_path).read()

blocks = re.findall(r'---SCORE---(.*?)---END---', content, re.DOTALL)
if not blocks:
    print(f"NO SCORES in critic output ({len(content)} bytes)")
    sys.exit(0)

today = datetime.date.today().isoformat()
REJ_DIR = 'scripts/pipeline/descriptions/rejected'
os.makedirs(REJ_DIR, exist_ok=True)

# Map id -> CSV row (for body / source check)
csv_rows = {}
with open('scripts/pipeline/issues.csv') as f:
    for r in csv.DictReader(f):
        csv_rows[r['id']] = r

accepted = 0
rejected = 0
not_found = 0

for sb in blocks:
    def grab(key):
        m = re.search(rf'^{key}:\s*(.+)', sb, re.MULTILINE)
        return m.group(1).strip() if m else None
    iid = grab('id')
    if not iid:
        continue
    iid = iid.lstrip('#').strip()
    row = csv_rows.get(iid)
    if not row:
        # Sometimes the model adds the slug variant differently — try prefix match
        for k in csv_rows:
            if k.startswith(iid.split('-',1)[0] + '-'):
                row = csv_rows[k]; iid = k; break
    if not row:
        print(f"  NOT FOUND: id={iid}")
        not_found += 1
        continue
    if row.get('source') != 'feature-proposal' or row.get('status') != 'pending':
        # Critic shouldn't touch anything else; skip silently
        continue

    def gi(key):
        m = re.search(rf'^{key}:\s*(\d+)', sb, re.MULTILINE)
        return int(m.group(1)) if m else 0
    spec = gi('specificity'); dra = gi('drama'); nov = gi('novelty')
    verdict_m = re.search(r'^verdict:\s*(ACCEPT|REJECT)', sb, re.MULTILINE)
    reason_m  = re.search(r'^reason:\s*(.+)', sb, re.MULTILINE)
    verdict = verdict_m.group(1) if verdict_m else 'REJECT'
    reason  = reason_m.group(1).strip() if reason_m else 'no reason'
    s_summary = f"S={spec}/D={dra}/N={nov}"

    if verdict == 'ACCEPT':
        accepted += 1
        if APPLY:
            # Add score note to the description for audit trail (idempotent — only once)
            dpath = row.get('description_path') or ''
            full = os.path.join('scripts/pipeline', dpath) if dpath else ''
            if full and os.path.exists(full):
                txt = open(full).read()
                if '## Critic verdict' not in txt:
                    with open(full, 'a') as f:
                        f.write(f"\n## Critic verdict\n{today}: ACCEPT [{s_summary}] — {reason}\n")
        print(f"  ACCEPT: #{iid}  [{s_summary}]  {reason[:70]}")
    else:
        rejected += 1
        if APPLY:
            # Move to cancelled + write archive
            slug = iid.split('-', 1)[1] if '-' in iid else iid
            arc = f"{REJ_DIR}/{today}-{slug}.md"
            dpath = row.get('description_path') or ''
            full = os.path.join('scripts/pipeline', dpath) if dpath else ''
            body = open(full).read() if full and os.path.exists(full) else ''
            with open(arc, 'w') as f:
                f.write(f"---\n")
                f.write(f"rejected_on: {today}\n")
                f.write(f"original_id: {iid}\n")
                f.write(f"score: {s_summary}\n")
                f.write(f"verdict: REJECT\n")
                f.write(f"reason: {reason}\n")
                f.write(f"---\n\n")
                f.write(f"## Original proposal\n\n```\n{body}\n```\n")
            subprocess.check_call(['python3','scripts/pipeline/csv_lib.py',
                'set_status','issues', iid, 'cancelled'])
            subprocess.check_call(['python3','scripts/pipeline/csv_lib.py',
                'set_field','issues', iid, 'completed', today])
        print(f"  REJECT: #{iid}  [{s_summary}]  {reason[:70]}")

print(f"\nDone. (accepted={accepted}, rejected={rejected}, not_found={not_found})")
PY

# ── Commit if anything changed ──
if [[ $APPLY -eq 1 ]]; then
  if [[ -n "$(git status --porcelain scripts/pipeline/issues.csv scripts/pipeline/descriptions/)" ]]; then
    git add scripts/pipeline/issues.csv scripts/pipeline/descriptions/
    git commit -m "chore(scorer): screen pending feature-proposals

Generated by scripts/pipeline/proposal-scorer.sh.
ACCEPTed proposals stay pending (the autonomous gate picks them up
later by priority). REJECTed proposals are flipped to cancelled and
their text is archived under descriptions/rejected/<date>-<slug>.md
for proposer tuning." --no-verify || true
  fi
fi

rm -f "$PENDING_FILE" "$PROMPT_FILE" "$OUT"

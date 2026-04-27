#!/usr/bin/env bash
# ============================================================
# feature-proposer.sh — propose new features / UX improvements
# ============================================================
# This is the missing half of the autonomous pipeline. discover-issues.sh
# only files quality-debt issues (godobj / dead exports / settimeout / i18n
# etc.) — it has no signal source for new functionality. As a result the
# pipeline has been a "tech-debt eater" for ~2 months without producing a
# single feature proposal.
#
# This proposer reads:
#   - the inferred product vision (graph-island = a more general / powerful
#     graph view than Obsidian's built-in plugin)
#   - personas inferable from the feature set
#   - memory notes on UX brushup, audit, knowledge-structuring
#   - recent main commits (what's been shipping lately)
#   - the current pending/blocked issue list (avoid duplicates)
#
# It calls Claude once and emits up to N proposals as priority=medium /
# source=feature-proposal issues that the user can accept or close.
#
# Suggested cron: weekly Mondays 09:00 JST (sparse on purpose)
#   0 9 * * 1 /path/to/feature-proposer.sh --apply >> /tmp/graph-island-feature-proposer.log 2>&1
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
MEMORY_DIR="/home/ubuntu/.claude/projects/-home-ubuntu-obsidian-plugins-obsidian-graph-island/memory"
MAX_PROPOSALS_PER_RUN=3
MAX_PENDING_FEATURE_PROPOSALS=2  # don't pile up unaccepted proposals

cd "$PROJECT_DIR" || exit 1

echo "=== feature-proposer ($(date -Iseconds)) ==="
echo "Mode: $([[ $APPLY -eq 1 ]] && echo apply || echo dry-run)"

# Skip if working tree dirty (autonomous-improve runs in this repo too).
# SKIP_DIRTY_CHECK=1 overrides — useful when running manually right after
# a verified clean state.
if [[ -z "${SKIP_DIRTY_CHECK:-}" && -n "$(git status --porcelain)" ]]; then
  echo "SKIP: working tree dirty — autonomous probably mid-cycle"
  exit 0
fi

# Cap unaccepted proposals (don't drown the user)
PEND=$(python3 -c "
import csv
with open('scripts/pipeline/issues.csv') as f:
    n = sum(1 for r in csv.DictReader(f)
            if r.get('source')=='feature-proposal' and r.get('status')=='pending')
print(n)
")
if [[ "$PEND" -ge "$MAX_PENDING_FEATURE_PROPOSALS" ]]; then
  echo "SKIP: $PEND pending feature proposals (limit $MAX_PENDING_FEATURE_PROPOSALS) — wait for user to accept/close"
  exit 0
fi

# ── Build context bundle ──
CONTEXT_FILE=$(mktemp)
{
  cat <<'EOF'
# graph-island — Vision (inferred from codebase + memory)

graph-island is a more general / powerful graph view than Obsidian's built-in
graph plugin. It already ships:
  - 4 view modes: graph / sunburst / timeline / matrix
  - rich query language: AND/OR/XOR/NOR/NAND, field:value, wildcards, fuzzy
  - multiple layout algorithms: force, cluster, hierarchical
  - WebGL renderer for large graphs
  - SVG export, snapshot save/load, lasso selection, focus mode
  - tag/relation legends, viewMode-specific renderers
  - i18n (multi-locale label rendering)

# Personas (inferable from the feature set)

P1: Obsidian power user — 1000+ notes, multi-vault, hits the limits of the
    built-in graph (slowness, no filtering, no layout control). Wants more
    knobs and faster rendering.

P2: Researcher / writer — uses the graph to navigate a literature web or
    long-form draft. Wants timeline / sunburst / hierarchy views and stable
    snapshots.

P3: Fiction writer / knowledge manager — leverages parent_id / story_order
    / category fields, wants groupBy + auto-cluster + timeline lanes.

P4: Visual thinker — prefers direct manipulation: lasso, focus, hover, zoom,
    drag-to-reorganize. Wants the graph to feel like a thinking tool, not a
    static viewer.

# Memory excerpts (UX brushup, audit, knowledge structuring)
EOF
  for f in project_ui_brushup_plan.md project_uiux_audit_2026_03_30.md \
           project_knowledge_structuring_brainstorm.md project_ui_control_audit.md \
           project_a11y_audit.md project_lod_spec_v21.md; do
    if [[ -f "$MEMORY_DIR/$f" ]]; then
      echo ""
      echo "## memory/$f (head)"
      head -60 "$MEMORY_DIR/$f"
    fi
  done

  echo ""
  echo "# Recent main commits (last 14d, deduped)"
  git -C "$PROJECT_DIR" log --since='14 days ago' --no-merges \
      --pretty=format:'%h %s' \
    | grep -vE '^[a-f0-9]+ chore: (start|done|kaizen|auto|decompose|block|revive)' \
    | head -40

  echo ""
  echo ""
  echo "# Existing pending / decomposed / blocked issues (do NOT propose duplicates)"
  python3 -c "
import csv
with open('scripts/pipeline/issues.csv') as f:
    for r in csv.DictReader(f):
        if r.get('status') in ('pending','decomposed','blocked'):
            print(f\"#{r['id']} [{r['priority']}/{r['status']}] src={r.get('source','-')} :: {r['summary'][:120]}\")
"

  echo ""
  echo "# Recently completed feature-style work (last 30d, learn from these)"
  git -C "$PROJECT_DIR" log --since='30 days ago' --no-merges \
      --pretty=format:'%s' | grep -E '^(feat|test|fix)\(' | head -20
} > "$CONTEXT_FILE"

# ── Build the prompt ──
PROMPT_FILE=$(mktemp)
{
  cat "$CONTEXT_FILE"
  cat <<'EOF'

---

You are the **feature ideation agent** for graph-island. Read the context
above and propose **1–3** *new feature* or *UX improvement* ideas.

## Hard rules
- DO NOT propose tech-debt cleanup (godobj / dead exports / setTimeout
  leaks / i18n / scattered constants / coverage). The autonomous gate
  already handles those. Your output is for *new value*, not maintenance.
- DO NOT duplicate any existing pending/decomposed/blocked issue listed.
- Each proposal must address **one specific persona's pain or aspiration**.
- Each proposal must be implementable in **1–3 tasks** of ~200 LOC each.
- No vague "improve UX" entries. Be concrete about behavior change.
- Acceptance criteria must be observable (CDP / unit test / screenshot).

## Output format (strict — the parser depends on it)

Emit each proposal as a block:

---PROPOSAL---
slug: <kebab-case-3-to-6-words-no-numeric-only>
title: <one line, ≤80 chars, in Japanese>
persona: P1|P2|P3|P4
rationale: <2–3 sentences in Japanese, why this matters to that persona>
scope_in: <bullet list, what's in>
scope_out: <bullet list, what's NOT in (anti-scope)>
acceptance:
- [ ] <observable criterion 1>
- [ ] <observable criterion 2>
- [ ] <observable criterion 3>
---END---

Output ONLY the proposal blocks (and nothing before / between / after them).
EOF
} > "$PROMPT_FILE"

echo ""
echo "Context size: $(wc -l < "$CONTEXT_FILE") lines / $(wc -c < "$CONTEXT_FILE") bytes"
echo "Prompt ready, calling claude..."

OUT=$(mktemp)
claude -p "$(cat "$PROMPT_FILE")" --max-turns 1 > "$OUT" 2>&1 || true
echo ""
echo "=== claude output (first 30 lines) ==="
head -30 "$OUT"
echo "  ... ($(wc -l < "$OUT") total lines)"

# ── Phase R2 (2026-04-27): self-scoring quality gate ──
# Generated proposals are sometimes incremental polish that doesn't deserve
# user attention. Ask Claude to score each proposal on three axes
# (specificity / drama / novelty) and reject low-scoring ones to a
# "rejected" archive instead of filing them as issues. The user only sees
# the strong ones.
SCORE_PROMPT_FILE=$(mktemp)
{
  cat "$OUT"
  cat <<'EOF'

---

You are now a critic. For EACH proposal block above, output one block in
the following format. No prose between or around the blocks. Three scores
each on 1-10 (1=poor, 10=excellent), then a verdict:

---SCORE---
slug: <copy slug from the proposal>
specificity: <1-10>     # files/APIs named, behavior precise, observable
drama: <1-10>           # would a power user notice and tell a friend?
novelty: <1-10>         # not already obviously possible with existing UI
verdict: ACCEPT | REJECT
reason: <one sentence in Japanese>
---END---

Reject when ANY of:
  - specificity < 6 (vague handwave)
  - drama < 6 (incremental polish only)
  - duplicate of obvious existing capability
  - acceptance criteria are not observable
EOF
} > "$SCORE_PROMPT_FILE"

SCORES=$(mktemp)
claude -p "$(cat "$SCORE_PROMPT_FILE")" --max-turns 1 > "$SCORES" 2>&1 || true
echo ""
echo "=== claude self-score (first 30 lines) ==="
head -30 "$SCORES"

# ── Parse + score-gate + file/reject ──
FILED=0
python3 - "$OUT" "$SCORES" "$APPLY" "$MAX_PROPOSALS_PER_RUN" <<'PY'
import sys, re, subprocess, os, datetime
out_path, scores_path, apply_str, cap_str = sys.argv[1:5]
APPLY = (apply_str == "1")
CAP = int(cap_str)

content = open(out_path).read()
scores  = open(scores_path).read()
proposals = re.findall(r'---PROPOSAL---(.*?)---END---', content, re.DOTALL)
if not proposals:
    print(f"NO PROPOSALS in claude output ({len(content)} bytes)")
    sys.exit(0)

# Parse scores by slug
score_blocks = re.findall(r'---SCORE---(.*?)---END---', scores, re.DOTALL)
score_map = {}
for sb in score_blocks:
    sm = re.search(r'^slug:\s*(.+)', sb, re.MULTILINE)
    if not sm: continue
    slug = sm.group(1).strip()
    def grab_int(key):
        m = re.search(rf'^{key}:\s*(\d+)', sb, re.MULTILINE)
        return int(m.group(1)) if m else 0
    verdict_m = re.search(r'^verdict:\s*(ACCEPT|REJECT)', sb, re.MULTILINE)
    reason_m  = re.search(r'^reason:\s*(.+)', sb, re.MULTILINE)
    score_map[slug] = {
        'specificity': grab_int('specificity'),
        'drama':       grab_int('drama'),
        'novelty':     grab_int('novelty'),
        'verdict':     (verdict_m.group(1) if verdict_m else 'REJECT'),
        'reason':      (reason_m.group(1).strip() if reason_m else 'no reason'),
    }

today  = datetime.date.today().isoformat()
filed  = 0
rejected = 0
REJ_DIR = 'scripts/pipeline/descriptions/rejected'
os.makedirs(REJ_DIR, exist_ok=True)

for raw in proposals[:CAP]:
    block = raw.strip()
    def grab(key):
        m = re.search(rf'^{key}:\s*(.+)', block, re.MULTILINE)
        return m.group(1).strip() if m else None
    slug    = grab('slug')
    title   = grab('title')
    persona = grab('persona')
    if not slug or not title:
        print(f"  SKIP: malformed block (slug={slug} title={title})")
        continue
    # Sanitize slug
    raw_slug = slug
    slug = re.sub(r'[^a-z0-9\-]', '-', slug.lower()).strip('-')
    if not slug:
        print("  SKIP: slug empty after sanitize")
        continue

    score = score_map.get(raw_slug) or score_map.get(slug)
    if score is None:
        # No score returned by the critic — default to REJECT (fail-closed).
        score = {'verdict': 'REJECT', 'reason': 'critic returned no score',
                 'specificity': 0, 'drama': 0, 'novelty': 0}

    s_summary = f"S={score['specificity']}/D={score['drama']}/N={score['novelty']}"

    # Reject branch ─────────────────────────────────────────────────────
    if score['verdict'] != 'ACCEPT':
        rej_path = f"{REJ_DIR}/{today}-{slug}.md"
        if APPLY:
            with open(rej_path, 'w') as f:
                f.write(f"---\n")
                f.write(f"rejected_on: {today}\n")
                f.write(f"slug: {slug}\n")
                f.write(f"persona: {persona or '-'}\n")
                f.write(f"score: {s_summary}\n")
                f.write(f"reason: {score['reason']}\n")
                f.write(f"---\n\n")
                f.write(f"## Original proposal\n\n```\n{block}\n```\n")
            print(f"  REJECTED: {slug}  [{s_summary}]  reason={score['reason'][:70]}")
        else:
            print(f"  [dry-run] WOULD REJECT: {slug}  [{s_summary}]  reason={score['reason'][:70]}")
        rejected += 1
        continue

    # Accept branch ─────────────────────────────────────────────────────
    nid = subprocess.check_output(
        ['python3','scripts/pipeline/csv_lib.py','next_id_num']
    ).decode().strip()
    issue_id = f"{nid}-{slug}"
    desc_path = f"scripts/pipeline/descriptions/{issue_id}.md"

    if APPLY:
        os.makedirs(os.path.dirname(desc_path), exist_ok=True)
        with open(desc_path, 'w') as f:
            f.write(f"---\n")
            f.write(f"priority: medium\n")
            f.write(f"reported: {today}\n")
            f.write(f"status: pending\n")
            f.write(f"source: feature-proposal\n")
            f.write(f"summary: {title}\n")
            f.write(f"persona: {persona or '-'}\n")
            f.write(f"score: {s_summary}\n")
            f.write(f"---\n\n")
            f.write(f"## Persona\n{persona or 'unspecified'}\n\n")
            f.write(f"## Self-score (critic pass)\n{s_summary} — {score['reason']}\n\n")
            f.write(f"## Full proposal\n\n```\n{block}\n```\n")
        subprocess.check_call([
            'python3','scripts/pipeline/csv_lib.py','insert','issues', issue_id,
            'priority=medium',
            'source=feature-proposal',
            f'summary={title[:240]}',
            f'description_path=descriptions/{issue_id}.md',
        ])
        print(f"  FILED: #{issue_id}  [{persona}/{s_summary}]  {title[:70]}")
    else:
        print(f"  [dry-run] WOULD FILE: #{issue_id}  [{persona}/{s_summary}]  {title[:70]}")
    filed += 1

print(f"\nDone. (filed={filed}, rejected={rejected})")
PY

if [[ $APPLY -eq 1 && $? -eq 0 ]]; then
  if [[ -n "$(git status --porcelain scripts/pipeline/issues.csv scripts/pipeline/descriptions/)" ]]; then
    git add scripts/pipeline/issues.csv scripts/pipeline/descriptions/
    git commit -m "chore(proposer): file feature-proposal issues + archive rejects

Generated by scripts/pipeline/feature-proposer.sh.
Accepted proposals filed as priority=medium / source=feature-proposal.
Rejected proposals archived under descriptions/rejected/<date>-<slug>.md
with the critic's score and reason for future tuning." || true
  fi
fi

rm -f "$CONTEXT_FILE" "$PROMPT_FILE" "$OUT" "$SCORE_PROMPT_FILE" "$SCORES"

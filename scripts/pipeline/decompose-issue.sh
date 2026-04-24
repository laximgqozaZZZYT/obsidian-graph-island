#!/usr/bin/env bash
# ============================================================
# decompose-issue.sh — Decompose user issue into atomic subtasks
# ============================================================
# Takes a complex issue and breaks it into small, independently
# implementable subtasks that the autonomous pipeline can handle.
#
# Usage: bash scripts/pipeline/decompose-issue.sh <issue-file>
# Output: Creates subtask files in scripts/pipeline/issues/
# ============================================================
set -uo pipefail

export PATH="/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v22.18.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME="/home/ubuntu"

PROJECT_DIR="/home/ubuntu/obsidian-plugins/obsidian-graph-island"
ISSUE_FILE="${1:-}"

if [[ -z "$ISSUE_FILE" || ! -f "$ISSUE_FILE" ]]; then
  echo "Usage: $0 <issue-file.md>"
  exit 1
fi

ISSUE_NAME=$(basename "$ISSUE_FILE" .md)
ISSUE_CONTENT=$(cat "$ISSUE_FILE")
ISSUE_DIR="$PROJECT_DIR/scripts/pipeline/issues"
TASK_DIR="$PROJECT_DIR/scripts/pipeline/tasks"
TASK_DONE_DIR="$TASK_DIR/done"
mkdir -p "$TASK_DIR" "$TASK_DONE_DIR"

# ── Queue cap (kaizen 2026-04-25) ──
# Refuse to decompose when the active task queue is already at the cap.
# Active = pending|in-progress|decomposed. Without this, every C5 revive
# would keep growing the queue indefinitely.
MAX_TOTAL_TASKS=${MAX_TOTAL_TASKS:-50}
ACTIVE_TASKS=$(grep -lE '^status: (pending|in-progress|decomposed)$' "$TASK_DIR"/*.md 2>/dev/null | wc -l | tr -cd '0-9')
ACTIVE_TASKS=${ACTIVE_TASKS:-0}
if [[ $ACTIVE_TASKS -ge $MAX_TOTAL_TASKS ]]; then
  echo "ABORT: task queue at cap ($ACTIVE_TASKS/$MAX_TOTAL_TASKS active) — decomposition deferred until queue drains"
  exit 4
fi

# Find next available number (across issues + tasks)
LAST_NUM=$(find "$ISSUE_DIR" "$ISSUE_DIR/done" "$TASK_DIR" "$TASK_DONE_DIR" -maxdepth 1 -name '*.md' 2>/dev/null | xargs -I{} basename {} | grep -oP '^\d+' | sort -n | tail -1)
LAST_NUM=${LAST_NUM:-0}
LAST_NUM=$(echo "$LAST_NUM" | sed 's/^0*//')
LAST_NUM=${LAST_NUM:-0}

echo "=== Decomposing: $ISSUE_NAME ==="

# Use Claude to analyze and decompose
DECOMPOSE_PROMPT="あなたはタスク分解のスペシャリストです。

以下のissueを、自律パイプラインが1つずつ処理できる小タスクに分解してください。

## 元のissue
$ISSUE_CONTENT

## 分解のルール
1. 各タスクは1つの claude -p セッション (max-turns 30) で完了できるサイズ
2. 各タスクは独立して実装・テスト・コミットできる
3. タスク間の依存順序を明示 (先にAを完了しないとBができない場合)
4. 各タスクに具体的なファイル名と変更内容を含める
5. 最大3タスクに分解 (それ以上なら上位タスクにまとめる)
6. 新機能追加の場合: パーサー → 型定義 → ロジック → UI → テスト の順
7. バグ修正の場合: 調査 → 修正 → テスト の順

## 出力形式
各タスクを以下のYAML風形式で出力:

SUBTASK 1
priority: high
summary: 1行説明
files: file1.ts, file2.ts
depends: none
description: |
  具体的な変更内容

SUBTASK 2
priority: high
summary: 1行説明
files: file3.ts
depends: subtask-1
description: |
  具体的な変更内容

## 重要
- アイデアや提案は不要。具体的な実装タスクのみ
- CLAUDE.md のルールに従うタスクにすること
- God Object を肥大化させるタスクは禁止

## 絶対禁止 (メタタスク生成の禁止)
以下のようなパイプライン管理作業をタスクにしてはならない:
- issueやタスクのstatusを変更する作業
- git mv や frontmatter の書き換え作業
- issueファイルの移動や整理作業
- 「done に移動する」「pending に戻す」等の管理作業
タスクは必ず src/ 配下のソースコードを変更する実装作業であること。

## 誇大表現の禁止 (report-honesty rules)
サブタスクの summary / description を書く際:
- 曖昧な数量表現禁止: 「多数の」「かなりの」「著しく」等は書かない。
  具体的な件数/行数/ファイル名を書くか、未確定なら「〜ファイルを精読して特定する」
  のように調査フェーズとして書く。
- 効果の見込み記述禁止: 「〜ms 削減される」「X倍速化」等は実測前には書かない。
  タスクの目的は「〜を修正する」「〜を抽出する」と事実ベースで書くこと。
- 曖昧な時間表現禁止: 「ここ数日」「最近」「しばらく」等は書かない。"

RESULT=$(claude -p "$DECOMPOSE_PROMPT" \
  --allowedTools "Bash,Read,Glob,Grep" \
  --max-turns 15 \
  2>&1)

# Guard: abort on LLM failure responses (rate limit, quota, etc) before any write
if echo "$RESULT" | grep -qiE "you've hit your limit|rate limit|quota exceeded|resets[[:space:]]+[0-9]+(am|pm)"; then
  echo "ERROR: decomposition aborted — LLM response matches known failure pattern"
  echo "  Preview: $(printf '%s' "$RESULT" | head -c 200)"
  exit 2
fi
if [[ ${#RESULT} -lt 100 ]]; then
  echo "ERROR: decomposition aborted — LLM response too short (${#RESULT} chars)"
  exit 2
fi

# Parse subtasks from result and create issue files
PY_OUT=$(echo "$RESULT" | python3 -c "
import sys, re

content = sys.stdin.read()
# Find SUBTASK blocks
blocks = re.split(r'SUBTASK\s+\d+', content)
blocks = [b.strip() for b in blocks if b.strip()]

import glob
issue_dir = '$TASK_DIR'
parent = '$ISSUE_NAME'
last_num = $LAST_NUM
ERROR_PATTERNS = (\"you've hit your limit\", 'rate limit', 'quota exceeded')
# Pipeline-management patterns. Curated to avoid path-fragment false positives
# (e.g. 'tasks/' would also match 'tests/tasks-utils.ts').
META_PATTERNS = ('git mv ', 'status: done', 'status: pending',
                 'frontmatter status', 'move to done',
                 '原子操作', 'ステータス変更', 'status を')
# LLM self-declared 'cannot decompose' patterns — issue should go to undecomposable, not produce a task
UNDECOMPOSABLE_PATTERNS = (
    'not decomposable', 'cannot be decomposed', 'undecomposable',
    'is not decomposable', '分解できない', '分解不可', '分解不能',
    'not a decomposable', 'this issue is not',
)
# Empty/placeholder summary patterns (substring match, lowercased)
PLACEHOLDER_SUMMARY_PATTERNS = ('subtask', 'todo', 'task description', 'summary here')

# Pull existing task summaries for duplicate detection (C-category fix)
# - same_parent_summaries: tighter check (Jaccard 0.6) within same issue
# - all_summaries: looser check (Jaccard 0.7) across the whole task queue,
#   catches generic 'extract constants' / 'add tests' duplicates that span
#   multiple parent issues.
parent_match = re.match(r'(\d+)', parent)
parent_num = parent_match.group(1) if parent_match else ''
same_parent_summaries = []
all_summaries = []
def _extract_summary(path):
    try:
        with open(path) as fh:
            c = fh.read()
        sm = re.search(r'^summary:\s*(.+)', c, re.MULTILINE)
        st = re.search(r'^status:\s*(\S+)', c, re.MULTILINE)
        if sm:
            status = st.group(1).strip() if st else ''
            return sm.group(1).strip(), status
    except Exception:
        pass
    return None, None
for ef in glob.glob(f'{issue_dir}/*.md'):
    s, status = _extract_summary(ef)
    if not s:
        continue
    # Only compare against active items; done/blocked/undecomposable shouldn't block new work
    if status not in ('pending', 'in-progress', 'decomposed'):
        continue
    all_summaries.append(s)
    if parent_num and f'-{parent_num}-' in ef.split('/')[-1]:
        same_parent_summaries.append(s)

def _word_set(text):
    return {w for w in re.findall(r'[a-z]{3,}', text.lower())}

def _jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)

for i, block in enumerate(blocks[:3]):
    # Extract fields
    priority = 'medium'
    summary = 'subtask'
    description = block
    depends = 'none'

    for line in block.split('\n'):
        line = line.strip()
        if line.startswith('priority:'):
            priority = line.split(':',1)[1].strip()
        elif line.startswith('summary:'):
            summary = line.split(':',1)[1].strip()
        elif line.startswith('depends:'):
            depends = line.split(':',1)[1].strip()
        elif line.startswith('description:'):
            idx = block.find('description:')
            if idx >= 0:
                desc_text = block[idx+len('description:'):].strip()
                if desc_text.startswith('|'):
                    desc_text = desc_text[1:].strip()
                description = desc_text

    # Reject blocks that look like failure responses, meta-work, or lack real content
    desc_raw = description.strip()
    desc_lower = desc_raw.lower()
    summary_lower = summary.lower()
    if any(p in desc_lower or p in summary_lower for p in META_PATTERNS):
        print(f'  SKIPPED: block {i+1} (meta-task detected: {summary[:50]})')
        continue
    if len(desc_raw) < 30:
        print(f'  SKIPPED: block {i+1} (description too short: {len(desc_raw)} chars)')
        continue
    if any(p in desc_lower for p in ERROR_PATTERNS):
        print(f'  SKIPPED: block {i+1} (error pattern in description)')
        continue
    # A-category: empty / placeholder summary (substring match, not just exact)
    if len(summary.strip()) < 20:
        print(f'  SKIPPED: block {i+1} (summary too short: \"{summary[:30]}\")')
        continue
    if any(p in summary_lower for p in PLACEHOLDER_SUMMARY_PATTERNS):
        if not any(c.isascii() and c.isalpha() for c in summary.replace('subtask','').replace('task','').replace('todo','')):
            print(f'  SKIPPED: block {i+1} (placeholder summary: \"{summary[:30]}\")')
            continue
    # B-category: LLM self-declared undecomposable
    if any(p in desc_lower or p in summary_lower for p in UNDECOMPOSABLE_PATTERNS):
        print(f'  SKIPPED: block {i+1} (LLM declared undecomposable)')
        continue
    # C-category: duplicate detection on word-set Jaccard.
    # - 0.6 within the same parent issue (tight, since they should diverge)
    # - 0.7 across the whole task queue (loose, since unrelated parents can
    #   legitimately share vocabulary like 'add tests' or 'extract const')
    new_ws = _word_set(summary)
    dup_hit = None
    for ex in same_parent_summaries:
        if _jaccard(new_ws, _word_set(ex)) >= 0.6:
            dup_hit = (ex, 'same-parent')
            break
    if dup_hit is None:
        for ex in all_summaries:
            if _jaccard(new_ws, _word_set(ex)) >= 0.7:
                dup_hit = (ex, 'cross-parent')
                break
    if dup_hit is not None:
        print(f'  SKIPPED: block {i+1} ({dup_hit[1]} duplicate: \"{dup_hit[0][:50]}\")')
        continue
    # Track for in-batch self-duplicate detection
    same_parent_summaries.append(summary)
    all_summaries.append(summary)

    last_num += 1
    num = f'{last_num:03d}'
    slug = re.sub(r'[^a-z0-9]+', '-', summary.lower())[:40].strip('-')
    # Use only parent's number prefix, not full slug (prevents name explosion)
    parent_num = re.match(r'(\d+)', parent)
    parent_ref = parent_num.group(1) if parent_num else parent[:10]
    filename = f'{num}-{parent_ref}-{slug}.md'

    with open(f'{issue_dir}/{filename}', 'w') as f:
        f.write(f'''---
priority: {priority}
reported: $(date +%Y-%m-%d)
status: pending
source: decomposed
parent: {parent}
depends: {depends}
summary: {summary}
---

## Description (subtask of {parent})

{description}

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
''')
    print(f'  CREATED: {filename}')
" 2>/dev/null)
echo "$PY_OUT"

CREATED_COUNT=$(echo "$PY_OUT" | grep -c '^  CREATED:')
SKIPPED_COUNT=$(echo "$PY_OUT" | grep -c '^  SKIPPED:')
UNDEC_HIT=$(echo "$PY_OUT" | grep -c 'LLM declared undecomposable\|placeholder summary\|summary too short')

if [[ "$CREATED_COUNT" -eq 0 ]]; then
  # If LLM produced only placeholder/undecomposable/duplicate output, mark issue
  # as undecomposable so future cycles stop wasting tokens on it.
  if [[ "$SKIPPED_COUNT" -gt 0 && "$UNDEC_HIT" -gt 0 ]]; then
    echo "ERROR: all subtasks rejected as placeholder/undecomposable — marking issue undecomposable"
    sed -i 's/^status: pending$/status: undecomposable/' "$ISSUE_FILE" 2>/dev/null
    sed -i 's/^status: decomposed$/status: undecomposable/' "$ISSUE_FILE" 2>/dev/null
    (cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ && \
      git commit -m "chore: mark $ISSUE_NAME undecomposable (LLM produced no actionable subtasks)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" --no-verify 2>/dev/null) || true
  else
    echo "ERROR: no valid subtasks created — leaving parent status unchanged"
  fi
  exit 3
fi
echo "  Total: $CREATED_COUNT subtasks created (skipped: $SKIPPED_COUNT)"

# Mark parent issue as decomposed (only after confirming subtasks were written)
sed -i 's/status: pending/status: decomposed/' "$ISSUE_FILE" 2>/dev/null
sed -i 's/status: in-progress/status: decomposed/' "$ISSUE_FILE" 2>/dev/null

# Commit tasks + updated issue
(cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ scripts/pipeline/tasks/ && \
  git commit -m "chore: decompose $ISSUE_NAME into tasks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" --no-verify 2>/dev/null) || true

echo "=== Decomposition complete ==="

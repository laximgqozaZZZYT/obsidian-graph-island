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
5. 最大5タスクに分解 (それ以上なら上位タスクにまとめる)
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
タスクは必ず src/ 配下のソースコードを変更する実装作業であること。"

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

issue_dir = '$TASK_DIR'
parent = '$ISSUE_NAME'
last_num = $LAST_NUM
ERROR_PATTERNS = (\"you've hit your limit\", 'rate limit', 'quota exceeded')

for i, block in enumerate(blocks[:5]):
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
    desc_stripped = description.strip()
    summary_lower = summary.lower()
    META_PATTERNS = ('git mv', 'frontmatter', 'status: done', 'status: pending',
                     'issues/', 'tasks/', 'done/', '原子操作', 'ステータス変更',
                     'status を', 'status: ', 'move to done')
    if any(p in desc_stripped.lower() for p in META_PATTERNS) or \
       any(p in summary_lower for p in META_PATTERNS):
        print(f'  SKIPPED: block {i+1} (meta-task detected: {summary[:50]})')
        continue
    if len(desc_stripped) < 30:
        print(f'  SKIPPED: block {i+1} (description too short: {len(desc_stripped)} chars)')
        continue
    if any(p in desc_stripped.lower() for p in ERROR_PATTERNS):
        print(f'  SKIPPED: block {i+1} (error pattern in description)')
        continue
    if summary.strip().lower() in ('subtask', 'task', ''):
        print(f'  SKIPPED: block {i+1} (no meaningful summary)')
        continue

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
if [[ "$CREATED_COUNT" -eq 0 ]]; then
  echo "ERROR: no valid subtasks created — leaving parent status unchanged"
  exit 3
fi
echo "  Total: $CREATED_COUNT subtasks created"

# Mark parent issue as decomposed (only after confirming subtasks were written)
sed -i 's/status: pending/status: decomposed/' "$ISSUE_FILE" 2>/dev/null
sed -i 's/status: in-progress/status: decomposed/' "$ISSUE_FILE" 2>/dev/null

# Commit tasks + updated issue
(cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ scripts/pipeline/tasks/ && \
  git commit -m "chore: decompose $ISSUE_NAME into tasks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" --no-verify 2>/dev/null) || true

echo "=== Decomposition complete ==="

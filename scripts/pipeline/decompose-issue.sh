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
- God Object を肥大化させるタスクは禁止"

RESULT=$(claude -p "$DECOMPOSE_PROMPT" \
  --allowedTools "Bash,Read,Glob,Grep" \
  --max-turns 15 \
  2>&1)

# Parse subtasks from result and create issue files
echo "$RESULT" | python3 -c "
import sys, re

content = sys.stdin.read()
# Find SUBTASK blocks
blocks = re.split(r'SUBTASK\s+\d+', content)
blocks = [b.strip() for b in blocks if b.strip()]

issue_dir = '$TASK_DIR'
parent = '$ISSUE_NAME'
last_num = $LAST_NUM

for i, block in enumerate(blocks[:5]):
    last_num += 1
    num = f'{last_num:03d}'

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
            # Rest is description
            idx = block.find('description:')
            if idx >= 0:
                desc_text = block[idx+len('description:'):].strip()
                if desc_text.startswith('|'):
                    desc_text = desc_text[1:].strip()
                description = desc_text

    slug = re.sub(r'[^a-z0-9]+', '-', summary.lower())[:40].strip('-')
    filename = f'{num}-{parent}-{slug}.md'

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

print(f'  Total: {len(blocks[:5])} subtasks created')
" 2>/dev/null

# Mark parent issue as decomposed
sed -i 's/status: pending/status: decomposed/' "$ISSUE_FILE" 2>/dev/null
sed -i 's/status: in-progress/status: decomposed/' "$ISSUE_FILE" 2>/dev/null

# Commit tasks + updated issue
(cd "$PROJECT_DIR" && git add scripts/pipeline/issues/ scripts/pipeline/tasks/ && \
  git commit -m "chore: decompose $ISSUE_NAME into tasks

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>" --no-verify 2>/dev/null) || true

echo "=== Decomposition complete ==="

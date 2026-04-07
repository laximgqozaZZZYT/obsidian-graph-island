---
priority: medium
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 034-pipeline-progress-report
depends: subtask-1
summary: autonomous-improve.sh にセッション完了時の progress-report 呼び出しを追加
---

## Description (subtask of 034-pipeline-progress-report)

autonomous-improve.sh の MERGE BACK TO MAIN セクション完了後
  (L617付近、"No commits to merge" の後) に以下を追加:

  # ── Update progress report ──
  log "Updating progress report..."
  bash "$PROJECT_DIR/scripts/pipeline/progress-report.sh" 2>/dev/null || true

  これにより各セッション完了時に /tmp/graph-island-progress.md が
  最新状態に更新される。

  注意:
  - autonomous-improve.sh の行数は増えるが、2行の追加なので許容範囲
  - エラーでもセッション自体を失敗させない (|| true)
  - $PROJECT_DIR を使うこと (worktree内のパスではなくメインリポジトリ)
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

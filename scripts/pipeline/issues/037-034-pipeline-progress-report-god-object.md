---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 034-pipeline-progress-report
depends: subtask-1
summary: カバレッジしきい値推移 + God Object サイズ推移セクション追加
---

## Description (subtask of 034-pipeline-progress-report)

progress-report.sh に以下の2セクションを追加:

  1. ## カバレッジしきい値推移
     - git log --oneline --all -- vitest.config.ts から
       "ratchet coverage" コミットを直近5件抽出
     - 各コミットで git show <hash>:vitest.config.ts | grep -oP
       で statements/branches/functions/lines のしきい値を取得
     - テーブル: | date | S | B | F | L |
     - 現在値との差分 (Δ) も表示

  2. ## God Object サイズ
     - bash scripts/pipeline/god-object-audit.sh --json の出力をパース
     - テーブル: | file | current | limit | headroom |
     - headroom = limit - current (マイナスなら ⚠ 表示)
     - git log --oneline -5 -- <god-object-file> で
       直近の変更コミットも1行ずつ表示

  動作確認: bash scripts/pipeline/progress-report.sh で
  新しいセクションが /tmp/graph-island-progress.md に含まれること。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

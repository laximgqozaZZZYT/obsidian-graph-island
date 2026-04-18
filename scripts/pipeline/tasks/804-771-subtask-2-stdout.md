---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 771-760-
depends: none
summary: subtask-2の分類結果を構造化形式で整形してstdout出力
---

## Description (subtask of 771-760-)

subtask-2 から受け取った分類結果を以下の構造で整形して stdout に出力:

  ```
  {
    "status": "ok" | "warning",
    "target_file": "<path>",
    "target_mark": "M" | "missing",
    "unexpected_changes": ["<path>", ...],
    "warnings": ["<message>", ...]
  }
  ```

  ルール:
  - target_mark が "M" かつ unexpected_changes が空 → status: "ok"
  - それ以外 → status: "warning" + warnings に理由を追加
  - git mv / git add / git commit は**絶対に実行しない**（commit担当の兄弟タスクへ委譲）
  - Acceptance criteria 3項目をチェックリストで確認:
    - [x] git 操作を実行していない
    - [x] 対象ファイルの M マークを検証した
    - [x] 波及の有無を警告した
  - 最後に "DONE" を stdout に出力してタスク完了

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

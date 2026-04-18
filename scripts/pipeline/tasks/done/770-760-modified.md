---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 760-730-git-status-short-modified
depends: subtask-1
summary: modifiedマーク行の分類と検証
---

## Description (subtask of 760-730-git-status-short-modified)

1. subtask-1 の出力を行ごとにパース。各行の先頭2文字 (XY status) を抽出
  2. 対象ファイル (親タスクで編集したファイル) が ` M` または `M ` で1行表示されているか確認
  3. 対象外ファイルに `M` / `A` / `D` / `??` が含まれていないかチェック
  4. 含まれていた場合、警告メッセージを作成:
     - 「Edit が意図しないファイルに波及した可能性: <ファイル一覧>」
  5. 対象ファイルが見当たらない場合も警告 (Edit が反映されていない)
  6. 分類結果 (expected / unexpected / warnings) をサブタスク3へ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

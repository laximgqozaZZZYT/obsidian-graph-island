---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 729-717-read-frontmatter
depends: subtask-1
summary: ターゲットファイルを Read して frontmatter 必須フィールド存在確認
---

## Description (subtask of 729-717-read-frontmatter)

subtask-1 で特定されたファイルを Read ツールで開く。
  frontmatter 内に以下のキーがすべて存在することを検証:
  priority / reported / parent / depends / summary / source / status
  本文に ## Description と ## Acceptance criteria セクションが存在することを grep で確認。
  いずれか欠落している場合はログに WARN 出力してこのサブタスクツリーを abort する
  (誤ファイル混入防止)。コード変更は行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

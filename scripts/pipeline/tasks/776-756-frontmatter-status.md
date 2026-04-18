---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 756-729-status-done-no-op
depends: none
summary: frontmatter から status 値を抽出する
---

## Description (subtask of 756-729-status-done-no-op)

subtask-2 で取得した frontmatter テキストから `status:` 行を正規表現 `/^status:\s*(\S+)/m` で抽出する。
  抽出した値を変数 STATUS_VALUE に格納し、ログに `[status-check] extracted: <value>` を出力。
  status 行が存在しない場合は `[status-check] missing status field` をログ出力し abort フラグを立てる。
  Acceptance: 抽出ロジックの動作確認ログが出力されること。コードファイルは変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

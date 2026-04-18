---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 733-719-issue-frontmatter-read-status
depends: none
summary: 対象 issue ファイルを Read し frontmatter 領域を取得
---

## Description (subtask of 733-719-issue-frontmatter-read-status)

701-691-glob-read から受け取った絶対パスに対し Read ツールを offset=0, limit=30 で実行。
  出力の先頭から `---` 〜 `---` の範囲を frontmatter として確定し、次タスクへ引き渡す文字列として保持する。
  パスが未解決／ファイル不在の場合は即エラー終了し status 判定を行わない。
  実装対象はパイプライン側ロジックのみでソース変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

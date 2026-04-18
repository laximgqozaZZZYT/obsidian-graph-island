---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: none
summary: subtask
---

## Description (subtask of 766-733-issue-read-frontmatter)

既存の類似タスク (756-729, 776-756) のパターンに沿って分解します。このタスクは Read 実行→frontmatter 切り出し→エラーガードの3層に素直に分割できます。

`★ Insight ─────────────────────────────────────`
- パイプラインタスクの既定パターンは "ソース変更なし、ログ出力のみで動作確認" (done/776 参照)。分解時もこの規約を踏襲すると gate-subtask2 をそのまま通せる。
- Read の offset=0,limit=30 は frontmatter が30行以内に収まる前提。超える場合のフォールバックは別 issue に切るべき責務。
- エラーガードを独立タスクにすると `abort フラグ` の粒度が揃い、後続 status 判定タスクが前提条件を満たす。
`─────────────────────────────────────────────────`

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

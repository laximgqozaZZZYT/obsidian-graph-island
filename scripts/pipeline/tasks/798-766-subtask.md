---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: none
summary: subtask
---

## Description (subtask of 766-733-issue-read-frontmatter)

`★ Insight ─────────────────────────────────────`
- このissueは「パイプライン側ロジックのみ」で、既存の scripts/ 配下の shell または issue 処理スクリプトに Read 実行部分を組み込む前提
- frontmatter 抽出は正規表現より「先頭行が `---` か検査 → 次の `---` までスライス」の単純ループが堅牢（YAML 内の `---` 誤検出を避けるため最初と2番目のみ参照）
- limit=30 行は通常の frontmatter には十分だが、超過時のエラー判定（閉じ `---` なし）を明示しておくと後続タスクでの status 判定が安全
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 704-694-graphviewcontainer-claude-md-ratchet-dow
depends: none
summary: subtask
---

## Description (subtask of 704-694-graphviewcontainer-claude-md-ratchet-dow)

`★ Insight ─────────────────────────────────────`
- このissueは「単一コミット」が明示されており、本来1タスクに集約すべき。CLAUDE.md の "ratchet down only" ポリシーは、God Object の肥大化を防ぐ一方向ratchet機構。
- 親issue (617-593-594-585) が subtask-1 で品質ゲート (test/lint/format) を完了済みという前提で、本タスクは検証フリー (build/test実行禁止) で軽量化されている。
- `git mv` を使うことで、ファイル移動が `git diff` で renamed として認識され、履歴が保たれる。
`─────────────────────────────────────────────────`

このissueは「単一コミット」「src/tests編集禁止」と明示されており、原子的で分解不可です。1タスクとして出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

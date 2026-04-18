---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 565-561-graphviewcontainer-ts-verify-lint-test
depends: none
summary: subtask
---

## Description (subtask of 565-561-graphviewcontainer-ts-verify-lint-test)

タスク分解します。元issueは verify-only で副作用が限定的なため、2タスクに分割します。

`★ Insight ─────────────────────────────────────`
- GOD OBJECT Policy の ratchet pattern: Max Allowed を現在値に固定し、増加を禁止することで段階的な分解を強制する設計
- 空コミット (`--allow-empty`) は git 履歴に監査証跡を残すテクニック — コード変更なしでも「この時点で検証済み」を記録できる
- fail-fast パターン: 行数超過時に lint/test を skip することで、無駄な CI 時間を削減し、問題箇所を即座に surface
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

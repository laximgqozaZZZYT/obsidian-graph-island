---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 926-902-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 926-902-graphviewcontainer-ts-claude-md-ratchet)

`★ Insight ─────────────────────────────────────`
- この issue は frontmatter に `source: decomposed` と `parent: 902-895-...` があり、既に分解済みのサブタスク。本文に「再分解禁止」「単一コミット禁止」の明示的制約がある
- Ratchet パターン (Lines/Max Allowed を実測値まで単調減少のみ) は God Object 肥大化を防ぐ仕組みで、CLAUDE.md の Forbidden Patterns と対応する
- 測定→判定→メタデータ更新の3ステップは全て非コード変更 (`src/` `tests/` touch 禁止) なので、単一セッションで安全に完結できる粒度
`─────────────────────────────────────────────────`

本 issue は既にサブタスクであり、本文に「単一セッション・単一コミットで完結」「複数コミット禁止」「再分解禁止」の制約が明記されています。さらなる分解は制約違反となるため、原子的な単一タスクとして出力します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

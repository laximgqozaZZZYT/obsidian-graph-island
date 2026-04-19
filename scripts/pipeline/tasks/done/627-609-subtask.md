---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 609-595-graphviewcontainer-ts
depends: none
summary: subtask
---

## Description (subtask of 609-595-graphviewcontainer-ts)

が全 PASS の前提で `pnpm test:coverage -- GraphViewContainer` を実行。
  - GraphViewContainer.ts の S/B/F/L カバレッジ % を抽出
  - CLAUDE.md 閾値 S28.6 / B27.1 / F25.4 / L28.3 と比較
  - 下回る項目があれば ❌ として指標+差分を報告
  - 全項目以上なら ✅、かつ +1.0pt 以上上回る項目は閾値引き上げ候補として列挙
  GOD OBJECT ポリシーに従い GraphViewContainer.ts 本体は編集しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

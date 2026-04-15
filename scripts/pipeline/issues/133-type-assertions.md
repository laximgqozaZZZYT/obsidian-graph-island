---
priority: low
reported: 2026-04-15
status: decomposed
source: auto-discovered
summary: 213個の型アサーション (as T) — 型安全性リスク
---

## Description
as キャストが213箇所。コンパイラの型チェックをバイパスしている。\n可能な限り型ガードや正しい型定義に置換すべき。

## Acceptance criteria
- [ ] 型アサーションを 80 個以下に

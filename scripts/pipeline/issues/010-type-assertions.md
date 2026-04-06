---
priority: low
reported: 2026-04-05
status: in-progress
source: auto-discovered
summary: 183個の型アサーション (as T) — 型安全性リスク
---

## Description
as キャストが183箇所。コンパイラの型チェックをバイパスしている。\n可能な限り型ガードや正しい型定義に置換すべき。

## Acceptance criteria
- [ ] 型アサーションを 80 個以下に

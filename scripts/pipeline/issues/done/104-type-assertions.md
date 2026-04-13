---
priority: low
reported: 2026-04-12
status: cancelled
source: auto-discovered
summary: 208個の型アサーション (as T) — 型安全性リスク
---

## Description
as キャストが208箇所。コンパイラの型チェックをバイパスしている。\n可能な限り型ガードや正しい型定義に置換すべき。

## Acceptance criteria
- [ ] 型アサーションを 80 個以下に

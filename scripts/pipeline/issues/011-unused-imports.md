---
priority: low
reported: 2026-04-05
status: pending
source: auto-discovered
summary: 500個の未使用import/変数
---

## Description
tsc --noUnusedLocals で500件の未使用宣言が検出。\nデッドコードとしてバンドルサイズに影響。

## Acceptance criteria
- [ ] 未使用import を 10 個以下に

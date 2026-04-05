---
priority: medium
reported: 2026-04-05
status: done
source: auto-discovered
summary: 104個の explicit any 型 — 型安全性の穴
---

## Description
ソースコードに : any または as any が104箇所ある。\n型推論の恩恵が失われ、ランタイムエラーの原因になる。

## Acceptance criteria
- [ ] any 型を 30 個以下に削減 (適切な型定義に置換)

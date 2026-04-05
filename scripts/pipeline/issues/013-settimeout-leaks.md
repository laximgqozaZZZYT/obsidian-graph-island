---
priority: high
reported: 2026-04-05
status: pending
source: auto-discovered
summary: setTimeout 34個 vs clearTimeout 16個 — 18個が未クリア
---

## Description
setTimeoutがclearTimeoutより18個多い。コンポーネント破棄時にメモリリークの原因。

## Acceptance criteria
- [ ] 未クリアsetTimeoutを 10 個以下に

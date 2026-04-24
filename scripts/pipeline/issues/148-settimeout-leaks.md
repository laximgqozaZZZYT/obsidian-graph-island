---
priority: high
reported: 2026-04-24
status: decomposed
decompose_attempts: 2
source: auto-discovered
summary: setTimeout 36個 vs clearTimeout 21個 — 15個が未クリア
---

## Description
setTimeoutがclearTimeoutより15個多い。コンポーネント破棄時にメモリリークの原因。

## Acceptance criteria
- [ ] 未クリアsetTimeoutを 10 個以下に

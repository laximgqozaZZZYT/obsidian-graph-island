---
priority: medium
reported: 2026-04-12
status: done
source: auto-discovered
summary: 8個の巨大関数 (120行以上) が存在
---

## Description
120行を超える関数が8個ある。可読性・テスタビリティの低下を招く。\n分割またはヘルパー抽出で改善可能。

## Acceptance criteria
- [ ] 120行超の関数を5個以下に削減

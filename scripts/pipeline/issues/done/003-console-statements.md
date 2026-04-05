---
priority: low
reported: 2026-04-05
status: done
source: auto-discovered
summary: 本番コードに6個のconsole文
---

## Description
CLAUDE.mdで禁止されているconsole.*が残存。esbuildがprodで除去するが、コード品質として問題。

## Acceptance criteria
- [ ] console文を0にする

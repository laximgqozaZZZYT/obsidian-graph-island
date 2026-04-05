---
priority: medium
reported: 2026-04-05
status: done
source: auto-discovered
summary: GVC に 49個のマジックナンバー (RenderThresholds外)
---

## Description
CLAUDE.md禁止パターン: ハードコードされた数値リテラルがGVCに49箇所。\nRenderThresholdsまたは定数に移行すべき。

## Acceptance criteria
- [ ] マジックナンバーを 20 個以下に (定数化 or RenderThresholds)

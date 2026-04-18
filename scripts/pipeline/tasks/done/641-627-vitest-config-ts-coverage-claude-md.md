---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 627-609-graphviewcontainer
depends: none
summary: vitest.config.tsのcoverage閾値とCLAUDE.md記載値の整合性確認
---

## Description (subtask of 627-609-graphviewcontainer)

`vitest.config.ts` をReadし、`coverage.thresholds` セクションの
  statements/branches/functions/lines 4指標の値を抽出する。
  CLAUDE.md（プロジェクト）およびGOD OBJECT Policy近辺に記載される
  S28.6/B27.1/F25.4/L28.3 と一致するか確認。
  - 一致 → 次タスクへ進む
  - 不一致 → どちらが新しい値か判定し、issueコメントに不整合を記録して停止
  本タスクではコード変更を一切行わない（閾値引き下げ禁止ルールに抵触するため）。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

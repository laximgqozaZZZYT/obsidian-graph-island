---
priority: medium
reported: 2026-04-11
status: pending
source: decomposed
parent: 080-perf-and-basic-ops-bugs
depends: none
summary: subtask
---

## Description (subtask of 080-perf-and-basic-ops-bugs)

十分な情報が集まりました。130以上のE2Eファイルがあり、smoke (1ファイル), mid (16ファイル), full (全cdp-e2e*.spec.ts) の3段階構成です。

`★ Insight ─────────────────────────────────────`
- E2Eは全てCDP接続でObsidianに直接アクセスする構成。ヘッドレスではなくライブObsidianが前提
- full suiteは130+ファイルで実行に非常に長い時間がかかる。自律パイプラインではsmoke→mid→full段階的検証が必須
- enforce-gatesスクリプトは存在しないが、CLAUDE.mdのQuality Gates (lint, test, format) が実質的なgate
`─────────────────────────────────────────────────`

---

## タスク分解結果

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

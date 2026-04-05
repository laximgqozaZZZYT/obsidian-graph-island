---
priority: medium
reported: 2026-04-05
status: pending
source: auto-discovered
summary: 46箇所のハードコード文字列 (t() 未使用)
---

## Description
setText()やtextContentに直接文字列を渡している箇所が46個。\nCLAUDE.mdルール: 全user-facing stringsはt()関数を通すこと。

## Acceptance criteria
- [ ] ハードコード文字列を 10 個以下に (t() でラップ)

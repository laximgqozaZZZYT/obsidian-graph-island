---
priority: medium
reported: 2026-04-12
status: in-progress
source: auto-discovered
summary: 39箇所のハードコード文字列 (t() 未使用)
---

## Description
setText()やtextContentに直接文字列を渡している箇所が39個。\nCLAUDE.mdルール: 全user-facing stringsはt()関数を通すこと。

## Acceptance criteria
- [ ] ハードコード文字列を 10 個以下に (t() でラップ)

### Attempt 1 (2026-04-13T17:05:02+09:00)
- Status: timed out after 1h
- session=unknown, commits=0
- Previous session could not complete this issue within max turns.
- **Continue from where the last session left off. Do not repeat already-attempted approaches.**

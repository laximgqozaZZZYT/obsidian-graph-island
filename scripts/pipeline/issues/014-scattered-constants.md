---
priority: low
reported: 2026-04-05
status: pending
source: auto-discovered
summary: 338個の定数がconstants.ts外に散在
---

## Description
SCREAMING_CASE定数が338個、各ファイルにバラバラに定義されている。\n変更時の影響範囲が不明確になる。

## Acceptance criteria
- [ ] 散在定数を 100 個以下に (constants.tsに集約 or ファイルローカルに明示)

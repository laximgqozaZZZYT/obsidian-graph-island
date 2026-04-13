---
priority: low
reported: 2026-04-12
status: cancelled
source: auto-discovered
summary: 438個の定数がconstants.ts外に散在
---

## Description
SCREAMING_CASE定数が438個、各ファイルにバラバラに定義されている。\n変更時の影響範囲が不明確になる。

## Acceptance criteria
- [ ] 散在定数を 100 個以下に constants.tsに集約

---
priority: medium
reported: 2026-04-15
status: done
source: decomposed
parent: 130-type-assertions
depends: none
summary: subtask
---

## Description (subtask of 130-type-assertions)

分布が把握できました。カテゴリ別に整理します：

- `as unknown as ...` (二重アサーション): 66個 — 最多、最も危険
- `as HTMLElement`: 37個 — DOM操作
- `as Record<string, ...>`: 33個 — 動的キーアクセス
- enum/union リテラル (`as ViewMode` 等): 28個 — デフォルト値定義
- その他: ~54個

目標は218→80以下（138個以上の削減）。以下がタスク分解です。

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

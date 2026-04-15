---
priority: medium
reported: 2026-04-15
status: done
source: decomposed
parent: 134-116-scattered-constants-subtask
depends: none
summary: subtask
---

## Description (subtask of 134-116-scattered-constants-subtask)

分析完了。以下がタスク分解です。

`★ Insight ─────────────────────────────────────`
- **GVC に ~40 のファイルローカル定数**がある。これを抽出すれば God Object を ~50行削減でき、CLAUDE.md のラチェット方針に直接貢献する
- **3つの重複定数**が発見された: `TOAST_SHORT_MS`(3ファイル)、`LABEL_CHAR_WIDTH_FACTOR`(2ファイル)、`AUTO_SNAP_PREFIX/MAX`(2ファイル)。DRY原則違反
- モジュール専用の Set/Map 定数（`BOOL_OPS`, `VALID_KEYS` 等）は移動すべきでない — 凝集度が下がるだけ
`─────────────────────────────────────────────────`

---

## タスク分解結果

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: subtask
---

## Description (subtask of 253-226-217-208-199-190-181-171-166-159-134-dead-exports-subtask-subtask-types-ts-dead-export-9-export-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

`★ Insight ─────────────────────────────────────`
**全9個が外部から使用されています。** `export` を外すとビルドが壊れます。親タスクの「外部から未使用」という前提が誤りです。最も使われているのは `mergeRenderThresholds`（9ファイル）と `DEFAULT_RENDER_THRESHOLDS`/`DEFAULT_COLORS`（各7ファイル）。
`─────────────────────────────────────────────────`

---

**このタスクは実行不可です。** 9個の定数/関数はすべて `src/types.ts` 以外のファイルから参照されており、`export` を外すとビルドエラーになります。

確認結果:

| シンボル | 外部使用ファイル数 |
|---|---|
| `ontologyToRules` | 1 |
| `rulesToOntologyFields` | 1 |
| `DEFAULT_ONTOLOGY` | 1 |
| `DEFAULT_SETTINGS` | 2 |
| `DEFAULT_CARD_RENDER_CONFIG` | 2 |
| `DEFAULT_CARDINALITY_RENDER_CONFIG` | 1 |
| `DEFAULT_RENDER_THRESHOLDS` | 7 |
| `mergeRenderThresholds` | 9 |
| `DEFAULT_COLORS` | 7 |

**推奨**: このissueは **wontfix** としてクローズし、親issueチェーン全体も終了させるべきです。rate limitによる空description再帰分解が誤った前提のタスクを生成した典型例です。

分解タスクの出力はありません — 実施すべき変更がないためです。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

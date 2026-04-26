# Verify Report — 582-570 Acceptance Check

- 生成日時 (Asia/Tokyo): 2026-04-18 17:55
- 親タスク: `582-570-graphviewcontainer-ts-verify-only`
- 生成タスク: `610-595-verify-report` (subtask `643-610-verify-report-md-gitignore`)
- 生成元データ: `.verify-data.json` (scripts/collect-verify-data.mjs の出力、gitignore 対象)
- 収集コマンド: `wc -l` / `pnpm lint` / `pnpm format:check` / `pnpm test --reporter=json` / `pnpm test:coverage --reporter=json-summary`

## 行数チェック

CLAUDE.md の "Max Allowed" (ratchet 固定値) と実測行数の比較。Max Allowed を超えると FAIL。

| File | Current | Max Allowed | Diff | 判定 |
|---|---:|---:|---:|:---:|
| `src/views/GraphViewContainer.ts` | 8597 | 8597 | 0 | PASS |
| `src/views/PanelBuilder.ts` | 2216 | 2216 | 0 | PASS |
| `src/views/EdgeRenderer.ts` | 2702 | 2702 | 0 | PASS |
| `src/views/RenderPipeline.ts` | 2321 | 2321 | 0 | PASS |

## Lint / Format

| Gate | 結果 |
|---|:---:|
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |

## Test

| 項目 | 値 |
|---|---:|
| 総数 | 6201 |
| PASS | 6201 |
| FAIL | 0 |

## Coverage

`vitest.config.ts` のしきい値と `coverage/coverage-summary.json` の `total` 実測値を比較。

| Metric | しきい値 | 実測 | 判定 |
|---|---:|---:|:---:|
| Statements (S) | 50.9% | 51.22% | PASS |
| Branches (B) | 45.3% | 45.93% | PASS |
| Functions (F) | 48.4% | 49.03% | PASS |
| Lines (L) | 51.2% | 51.45% | PASS |

## God Object Policy

4 ファイルすべて Current ≤ Max Allowed (境界値維持)。

- 判定: **PASS** (4/4)

## Acceptance criteria (582-570 親タスク)

- [x] 実装が完了し、テストが通ること
  - `pnpm test` 6201/6201 PASS → **PASS**
- [x] CLAUDE.md のルールに違反しないこと
  - God Object ratchet 4/4 境界値維持、全 quality gate PASS → **PASS**

---

**総合判定: PASS**

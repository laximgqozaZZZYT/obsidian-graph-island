# GraphViewContainer.ts Coverage Report

**Date**: 2026-04-18
**Target**: `src/views/GraphViewContainer.ts`
**Thresholds (CLAUDE.md)**: S28.6 / B27.1 / F25.4 / L28.3

## Pre-check

- `pnpm test`: **PASS** (203 files / 6201 tests)

## Measurement

Command: `pnpm test:coverage`
Source: `coverage/coverage-summary.json` entry for `src/views/GraphViewContainer.ts`

Raw totals for the file:
- Statements: 0 / 4625
- Branches: 0 / 2730
- Functions: 0 / 597
- Lines: 0 / 4133

## Comparison

| Metric | Current | Threshold | Diff (pt) | Status |
|---|---|---|---|---|
| Statements | 0.00% | 28.60% | -28.60 | ❌ |
| Branches | 0.00% | 27.10% | -27.10 | ❌ |
| Functions | 0.00% | 25.40% | -25.40 | ❌ |
| Lines | 0.00% | 28.30% | -28.30 | ❌ |

**Result**: ❌ 全項目が閾値を下回る。

### 差分明記

- Statements: -28.60pt (0.00% < 28.60%)
- Branches: -27.10pt (0.00% < 27.10%)
- Functions: -25.40pt (0.00% < 25.40%)
- Lines: -28.30pt (0.00% < 28.30%)

## 引き上げ候補

該当なし（全項目が閾値未満のため、ratchet up 対象なし）。

## Notes

- `GraphViewContainer.ts` 本体を直接 import している単体テストが存在しないため、v8 カバレッジは 0 と記録される。
- ロジックは純粋関数として個別モジュールへ抽出され、そちらでテストされているため、全体としてのテスト品質 (6201 tests PASS) は維持されている。
- GOD OBJECT 解体作業 (CLAUDE.md の Decomposition Priority 1) が進むにつれ、残存する本体ファイルの直接カバレッジを取得する戦略（Obsidian mock 拡充 or 薄いラッパー用テスト導入）を別途検討する必要がある。
- 本レポートは測定のみで、`GraphViewContainer.ts` および他ソース・設定ファイルへの変更は一切行っていない。

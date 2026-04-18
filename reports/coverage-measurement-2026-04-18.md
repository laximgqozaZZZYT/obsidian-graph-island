# Coverage Measurement Report — 2026-04-18

## Summary

`pnpm test:coverage` を実行し、現在の S/B/F/L カバレッジ値を取得。
`vitest.config.ts` の現行 thresholds と比較し、各指標が閾値を +1pt 以上超過しているかを判定。

- Test Files: 203 passed
- Tests: 6201 passed
- Duration: 15.10s
- Provider: v8

## Measurement

| 指標 | 現在値 (%) | 閾値 (%) | 差分 (pt) | +1pt超過判定 |
|---|---|---|---|---|
| Statements | 51.22 | 50.9 | +0.32 | NO |
| Branches | 45.93 | 45.3 | +0.63 | NO |
| Functions | 49.00 | 48.4 | +0.60 | NO |
| Lines | 51.45 | 51.2 | +0.25 | NO |

## Raw Counts

| 指標 | Covered / Total |
|---|---|
| Statements | 13436 / 26230 |
| Branches | 6469 / 14084 |
| Functions | 1617 / 3300 |
| Lines | 12052 / 23424 |

## Conclusion

全4指標とも現行閾値を上回っているが、**+1pt 以上の超過余地は無い**。
ラチェット引き上げ (+1pt) を行うと 4指標すべてで CI が FAIL する。

| 指標 | 現在値 | +1pt閾値 | 引き上げ可否 |
|---|---|---|---|
| Statements | 51.22 | 51.9 | NG (0.68pt 不足) |
| Branches | 45.93 | 46.3 | NG (0.37pt 不足) |
| Functions | 49.00 | 49.4 | NG (0.40pt 不足) |
| Lines | 51.45 | 52.2 | NG (0.75pt 不足) |

次アクション候補: カバレッジを +1pt 以上押し上げる新規テストの追加、または閾値を小数点第一位までのラチェット (現行値 floor) に留める運用継続。

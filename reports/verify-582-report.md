# Verify Report — 582 (pnpm test pass)

## Metadata
- Generated at: 2026-04-18T15:29:31+09:00
- Test run start (from log): 15:23:27
- Commit SHA: d9d24b8c0328b34a810899e2c93d12c1da5e87a4
- Source log: `reports/verify-582-pnpm-test.log`
- Command: `pnpm test` (vitest run, coverage disabled)
- Exit code: 0

## Test Summary
- Test Files: 203 total / 203 passed / 0 failed / 0 skipped
- Tests: 6201 total / 6201 passed / 0 failed / 0 skipped
- Duration: 50.36s (transform 106.79s, setup 0ms, import 215.72s, tests 45.87s, environment 235ms)
- vitest version: v4.1.0

## Failures
None.

## Coverage Threshold Check
Coverage was not collected in this run (`pnpm test` invokes `vitest run` without `--coverage`).

Thresholds defined in `vitest.config.ts`:
| Metric | Threshold | Measured | Judgement |
|---|---|---|---|
| Statements (S) | 50.9% | N/A | not evaluated |
| Branches (B) | 45.3% | N/A | not evaluated |
| Functions (F) | 48.4% | N/A | not evaluated |
| Lines (L) | 51.2% | N/A | not evaluated |

To evaluate thresholds, run `pnpm test:coverage`.

## Verdict
- All tests pass: PASS
- Coverage thresholds met: NOT EVALUATED
- Overall: PARTIAL PASS (tests PASS; coverage not measured in this log)

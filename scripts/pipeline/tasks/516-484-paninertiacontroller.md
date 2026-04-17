---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 484-477-subtask
depends: subtask-1
summary: PanInertiaController のユニットテスト作成
---

## Description (subtask of 484-477-subtask)

`tests/views/pan-inertia-controller.test.ts` を新規作成し vitest でテストする。

  ## テストケース (最低6件)
  1. `start()` 呼び出しで isActive() が true になる
  2. friction 適用で velocity が指数減衰する (onStep の dx/dy が単調減少)
  3. |velocity| < minSpeed で自動停止し isActive() が false になる
  4. start() 連続呼び出しで旧 rafId が cancel され重複起動しない (cancelAnimationFrame のスパイで検証)
  5. cancel() 呼び出しで isActive() が false + velocity が 0 リセット
  6. start() → cancel() 後に再 start() で正常に inertia が走る

  ## 実装要件
  - `vi.useFakeTimers()` + `vi.stubGlobal('requestAnimationFrame', ...)` / `cancelAnimationFrame` で rAF をモック
  - onStep はスパイ (`vi.fn()`) で呼び出し回数・引数を検証
  - GraphViewContainer には触れない (純粋ユニットテスト)
  - 既存 `tests/__mocks__/obsidian.ts` は import 不要

  ## CLAUDE.md 遵守
  - カバレッジしきい値低下禁止 → 新規テストでカバレッジ向上のみ
  - `pnpm test` がグリーンになること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

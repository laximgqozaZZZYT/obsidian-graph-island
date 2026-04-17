---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 477-473-pointerup-handler-applypaninertia-raf
depends: subtask-1
summary: pan inertia rAF ループの動作検証テスト追加
---

## Description (subtask of 477-473-pointerup-handler-applypaninertia-raf)

新規テストファイル tests/views/GraphViewContainer.pan-inertia.test.ts を追加し、subtask-1 の rAF ループ挙動を検証する。
  
  テストケース:
  1. pointerup 時 velocity > PAN_INERTIA_MIN_VELOCITY で rAF が起動し、_panInertiaRafId が non-null になる
  2. pointerup 時 velocity <= PAN_INERTIA_MIN_VELOCITY では rAF が起動しない（_panInertiaRafId が null のまま）
  3. rAF ループ内で applyPanInertia が各フレーム呼ばれ、panX/panY が更新される
  4. settled===true 返却時に cancelAnimationFrame が呼ばれ _panInertiaRafId が null に戻る
  5. 次の pointerdown で進行中の rAF がキャンセルされる（重複起動防止）
  6. scheduleRender("pan-inertia") がフレームごとに呼ばれる
  
  実装方針:
  - vi.useFakeTimers() + requestAnimationFrame モック（vi.stubGlobal）でフレーム進行を手動制御
  - tests/__mocks__/obsidian.ts の既存モックを使用
  - applyPanInertia は実関数を呼ぶ（純粋関数想定）、scheduleRender はスパイで検証
  - PointerEvent は手動でオブジェクトリテラル作成（jsdom 環境）
  
  完了条件:
  - 新規テスト全てパス
  - `pnpm test` 全体で回帰なし
  - カバレッジしきい値を下回らない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

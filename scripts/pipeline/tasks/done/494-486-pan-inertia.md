---
priority: high
reported: 2026-04-17
status: done
source: decomposed
parent: 486-477-pan-inertia-raf
depends: none
summary: pan-inertia テストファイル新規作成と基本起動/非起動ケース実装
---

## Description (subtask of 486-477-pan-inertia-raf)

新規ファイル tests/views/GraphViewContainer.pan-inertia.test.ts を作成。
  共通セットアップ:
  - vi.useFakeTimers() とafterEach でのリストア
  - requestAnimationFrame / cancelAnimationFrame を vi.stubGlobal で差し替え、手動でフレーム進行できる制御構造 (pendingCbs キュー + flushRaf() ヘルパー)
  - tests/__mocks__/obsidian.ts の既存モックを利用し GraphViewContainer インスタンスを生成
  - PointerEvent はオブジェクトリテラルで手動生成
  
  実装するケース:
  1. pointerup 時 velocity > PAN_INERTIA_MIN_VELOCITY で rAF 起動、_panInertiaRafId が non-null
  2. pointerup 時 velocity <= PAN_INERTIA_MIN_VELOCITY では rAF 起動せず _panInertiaRafId が null のまま
  3. scheduleRender("pan-inertia") がフレームごとに呼ばれる (vi.spyOn で検証)
  
  完了条件: `pnpm test tests/views/GraphViewContainer.pan-inertia.test.ts` が 3ケース pass。
  GraphViewContainer.ts 本体は一切変更禁止 (God Object Policy)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

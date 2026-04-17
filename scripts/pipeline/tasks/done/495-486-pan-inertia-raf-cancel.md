---
priority: high
reported: 2026-04-17
status: done
source: decomposed
parent: 486-477-pan-inertia-raf
depends: 494-486-pan-inertia
summary: pan-inertia rAFループ内挙動と重複防止/cancel検証ケース追加
---

## Description (subtask of 486-477-pan-inertia-raf)

494-486-pan-inertia で作成したファイルに以下ケースを追加:
  
  4. rAFループ内で applyPanInertia が各フレーム呼ばれ panX/panY が更新される
     - applyPanInertia は実関数 (純粋関数) を利用、flushRaf() で複数フレーム進めて panX/panY の差分を検証
  5. settled===true 返却時に cancelAnimationFrame が呼ばれ _panInertiaRafId が null に戻る
     - 速度を極小に近づけて settled を誘発、cancelAnimationFrame モックが呼ばれたこと + _panInertiaRafId===null を検証
  6. 次の pointerdown で進行中の rAF がキャンセルされる (重複起動防止)
     - pointerup → rAF起動 → 新規 pointerdown → 旧 rafId に対し cancelAnimationFrame 呼び出し、新 rafId が別値になること検証
  
  完了条件:
  - `pnpm test` 全体 pass
  - `pnpm test:coverage` でカバレッジしきい値 (S/B/F/L) 下回らず
  - 新規テスト計6ケース全て pass
  - GraphViewContainer.ts 本体変更なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

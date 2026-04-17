---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 477-473-pointerup-handler-applypaninertia-raf
depends: none
summary: pointerup rAF ループ起動 + pointerdown キャンセル + _panInertiaRafId フィールド追加
---

## Description (subtask of 477-473-pointerup-handler-applypaninertia-raf)

src/views/GraphViewContainer.ts に pan inertia rAF ループを実装する。
  
  変更内容:
  1. private field 追加: `_panInertiaRafId: number | null = null;`
     - 既存フィールド宣言群の近くに配置（新規メソッド禁止、フィールドのみ許容）
  
  2. pointerdown ハンドラの先頭に rAF キャンセル処理を挿入:
     ```
     if (this._panInertiaRafId !== null) {
       cancelAnimationFrame(this._panInertiaRafId);
       this._panInertiaRafId = null;
     }
     ```
     - 重複起動防止（次の drag 開始時に慣性を即停止）
  
  3. pointerup ハンドラで subtask-2 の velocity を参照し、rAF ループを起動:
     - 速度の大きさ `Math.hypot(vx, vy)` が PAN_INERTIA_MIN_VELOCITY を超える場合のみ起動
     - rAF コールバック内でインライン実装（新規メソッド禁止）:
       - applyPanInertia({ vx, vy, dtMs }) を呼ぶ（subtask-2 で定義済み想定）
       - 返り値の dx, dy を this.panX, this.panY に加算
       - this.scheduleRender("pan-inertia") を呼ぶ
       - settled === true なら cancelAnimationFrame + `_panInertiaRafId = null` でループ停止
       - そうでなければ次フレームを requestAnimationFrame で継続
     - dtMs は前フレーム時刻との差分で計算（performance.now() を使用）
  
  制約:
  - GOD OBJECT ポリシー: GraphViewContainer.ts の行数を可能な限り増やさない（インライン実装で新規メソッド追加なし）
  - RenderThresholds 経由で PAN_INERTIA_MIN_VELOCITY を参照（ハードコード禁止）
  - console.* 禁止
  
  完了条件:
  - `pnpm build` が通る
  - `pnpm lint` が通る
  - `pnpm test` が既存テスト全てパス（回帰なし）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

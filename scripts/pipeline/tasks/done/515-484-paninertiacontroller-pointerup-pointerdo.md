---
priority: high
reported: 2026-04-17
status: done
source: decomposed
parent: 484-477-subtask
depends: none
summary: PanInertiaController を新規ファイルに抽出し pointerup/pointerdown で制御
---

## Description (subtask of 484-477-subtask)

GOD Object 肥大化防止のため、pan inertia ロジックを `src/views/pan-inertia-controller.ts` に新規抽出する。

  ## 新規ファイル: src/views/pan-inertia-controller.ts
  - class `PanInertiaController` をエクスポート
  - private フィールド: `rafId: number | null = null`, `velocity: {x: number, y: number} = {x:0, y:0}`
  - public メソッド:
    - `start(vx: number, vy: number, onStep: (dx: number, dy: number) => void, friction = 0.92, minSpeed = 0.1): void`
      - 既存 rafId があれば cancelAnimationFrame してから起動
      - requestAnimationFrame ループ内で velocity *= friction、|v| < minSpeed で停止 + rafId = null
      - ループ内で onStep(velocity.x, velocity.y) を呼ぶ
    - `cancel(): void` — rafId があれば cancelAnimationFrame + rafId = null + velocity を 0 にリセット
    - `isActive(): boolean` — rafId !== null を返す

  ## GraphViewContainer.ts 変更 (行数増加させない)
  - 既存の pan inertia 関連フィールド・メソッドがあれば削除し、`panInertia: PanInertiaController` 1フィールドに置換
  - pointerup ハンドラ内で `this.panInertia.start(vx, vy, (dx, dy) => { this.viewport.x += dx; this.viewport.y += dy; this.requestRender(); })` を呼ぶ
  - pointerdown ハンドラ冒頭で `this.panInertia.cancel()` を呼ぶ
  - onunload / destroy で `this.panInertia.cancel()` を呼ぶ

  ## CLAUDE.md 遵守
  - 新ロジックは新規ファイル側に配置 (GOD Object ポリシー準拠)
  - friction/minSpeed などの数値は PanInertiaController コンストラクタ引数または `RenderThresholds` から取得し、ハードコード禁止
  - `console.*` 不使用

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

## Description (subtask of 1640-settimeout-leaks)

subtask-1 で導入した createTimerTracker を使い、src/ 配下 (GraphViewContainer.ts 以外)
  の素の setTimeout を Grep で列挙し、ライフサイクルを持つコンポーネント
  (PanelBuilder, EdgeRenderer, RenderPipeline, その他 view) では tracker を保持し
  破棄時に clearAll する。ライフサイクルを持たない一回限りの setTimeout(0) や
  microtask 代替などは、対応する clearTimeout を呼び出し側で保持/呼び出す形に変更する。
  ratchet 制約: PanelBuilder.ts ≤1719 (max 2216), EdgeRenderer.ts ≤2765,
  RenderPipeline.ts ≤2657 を超えないこと。差分が増えそうな場合は局所関数化のみで対応し、
  新規大型ロジックは追加しない。
  完了条件: 該当ファイル群内の素の setTimeout 呼び出しが、
  対応する clearTimeout もしくは tracker.setTimeout 経由のいずれかになっている。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

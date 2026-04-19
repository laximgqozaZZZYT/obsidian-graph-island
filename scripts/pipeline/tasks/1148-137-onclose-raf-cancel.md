---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 137-uncancellable-raf-chains
depends: subtask-2, subtask-3
summary: 既存テスト全パス確認+onClose時rAF cancel検証テスト追加
---

## Description (subtask of 137-uncancellable-raf-chains)

既存 `tests/` 配下の全ユニットテストが引き続きパスすることを `pnpm test` で確認。
  新規テストファイル `tests/views/GraphViewContainer.onclose.test.ts` (既存onClose系テストがあれば追記):
  - mock `requestAnimationFrame`/`cancelAnimationFrame` をグローバル注入
  - `panToNode` 呼び出し後 `onClose()` すると cancel が呼ばれ、以降 rAF callback が `world` に触らないこと
  - `_animateToNode` 同様の検証
  - `_fadeNodeAlpha` を同一ノードに連続2回呼ぶと、1回目の cancel が呼ばれること
  - `onClose()` 後に全 `_fadeHandles` がクリアされていること
  - Obsidian mock (`tests/__mocks__/obsidian.ts`) は触らない (軽量維持)
  - カバレッジしきい値 (S/B/F/L) が下がらないことを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

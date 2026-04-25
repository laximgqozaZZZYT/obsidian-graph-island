
## Description (subtask of 116-scattered-constants)

pathfinder-overlay.ts (12個: PATHFINDER_*) + inertia-pan.ts (3個: FRICTION等) を移動。
  1. PATHFINDER_* 定数群をconstants.tsの「// Pathfinder overlay」セクションに移動
  2. FRICTION, MIN_VELOCITY, HISTORY_WINDOW_MS をconstants.tsの「// Inertia pan」に移動
  3. 元ファイルをimportに切替（exportされている定数はre-export不要、直接constants.tsからimport）
  4. これらの定数を参照している全ファイルのimportパスを更新
  5. pnpm test && pnpm lint で確認
  目標: 15個削減
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-06
status: done
source: decomposed
parent: 015-autofit-viewport-broken
depends: subtask-2, subtask-3
summary: simulation endのautoFitパイプライン整理とE2Eテスト
---

## Description (subtask of 015-autofit-viewport-broken)

simulation end ハンドラ内のautoFit関連呼び出しを整理し、E2E検証を追加。
  
  1. simulation end 内の autoFit 呼び出しフロー整理:
     - `ensureViewportUtilization` (L7575) → `autoFitView` (L7589) → 
       `requestAnimationFrame autoFitView` (L7596) の3段階を、
       確実に最後の autoFitView が勝つように整理
     - 重複する autoFitView 呼び出しを1箇所に集約
  
  2. autoFitView 完了後のバリデーション追加:
     - フィット後に pixiNodes の何%がビューポート内にあるかを計算
     - 80%未満なら警告ログ + 再フィット試行 (最大1回)
  
  3. 既存テストの更新:
     - tests/autofit-viewport.test.ts にsimulation endフロー検証追加
  
  注意: GVC行数は増やさない。autoFit呼び出し統合で行数を相殺。
```

---

**依存グラフ**:
```
subtask-1 (調査+テスト)
   ├──→ subtask-2 (_autoFocusActiveFile修正)
   └──→ subtask-3 (computeAutoFitTransform強化)
            └──→ subtask-4 (パイプライン整理+E2E)
                    ↑
         subtask-2 ─┘
```

subtask-1 完了後、subtask-2 と subtask-3 は**並列実行可能**。subtask-4 は両方の完了後に実行。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

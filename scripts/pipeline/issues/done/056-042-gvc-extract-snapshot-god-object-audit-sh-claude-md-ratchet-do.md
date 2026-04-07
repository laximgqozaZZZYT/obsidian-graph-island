---
priority: medium
reported: 2026-04-07
status: done
source: decomposed
parent: 042-gvc-extract-snapshot
depends: subtask-1, subtask-2
summary: god-object-audit.sh と CLAUDE.md の行数 ratchet down
---

## Description (subtask of 042-gvc-extract-snapshot)

subtask-1,2 完了後の GVC 行数を wc -l で計測し:
  
  1. god-object-audit.sh の LIMITS["src/views/GraphViewContainer.ts"] を
     新しい行数に更新 (ratchet down)
  2. CLAUDE.md の God Object Policy テーブルの GVC 行を更新:
     - Lines 列: 新行数
     - Max Allowed 列: 新行数
  
  pnpm test を実行して全テストグリーンを確認。
  pnpm build を実行してビルド成功を確認。
```

---

**依存グラフ:**
```
subtask-1 (export delegate)
  ├─→ subtask-2 (snapshot 抽出) — subtask-1で行数が減った状態から開始
  ├─→ subtask-3 (テスト追加)
  └─→ subtask-4 (ratchet down) — subtask-1,2 両方完了後
```

subtask-1 が最重要で、これだけで acceptance criteria の「150行削減」をほぼ達成。subtask-2 は追加の削減。subtask-3 と subtask-4 は subtask-1 の後に並行実行可能（ただし subtask-4 は subtask-2 にも依存）。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

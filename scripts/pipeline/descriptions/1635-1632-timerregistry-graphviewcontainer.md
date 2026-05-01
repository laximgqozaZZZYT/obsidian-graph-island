## Description (subtask of 1632-settimeout-leaks)

1. 新規ファイル src/utils/timer-registry.ts を作成。
     - class TimerRegistry { setTimeout(fn, ms): number; clearTimeout(id): void; clearAll(): void }
     - 内部で Set<number> にIDを保持し、clearAll() で一括 window.clearTimeout 実行。
     - delete 操作はコールバック完了時 / clearTimeout 呼び出し時の両方で行う。
  2. src/views/GraphViewContainer.ts を読み、すべての setTimeout 呼び出し箇所
     (行番号でリストアップ) を TimerRegistry 経由に置換。
     - this.timerRegistry = new TimerRegistry() をフィールドに追加
     - onClose() / unload() / destroy相当のライフサイクルで this.timerRegistry.clearAll() を呼ぶ
  3. 行数増加に注意: 新規追加は最小限にし GOD OBJECT Max Allowed (8655) を超えない。
     超えそうなら別ヘルパー関数として src/utils/ に抽出する。
  4. pnpm build / pnpm test でビルド・既存テストが通ることを確認しコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

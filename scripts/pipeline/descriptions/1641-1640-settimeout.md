## Description (subtask of 1640-settimeout-leaks)

Issue 前提: setTimeout 43 / clearTimeout 16 (差分27)。
  まず src/utils/timer-tracker.ts を新規作成し、以下を export する:
    - createTimerTracker(): { setTimeout(fn, ms): number; clearAll(): void; size(): number }
    - 内部で Set<number> にタイマーIDを保持し、コールバック完了時に自動的に Set から削除
    - clearAll() で残存IDを全て window.clearTimeout する
  次に src/views/GraphViewContainer.ts (god object — 行数増加禁止、ratchet 8655)
  内の setTimeout 呼び出しを Grep で全件特定し、トラッカーを 1 インスタンス
  保持して全て差し替える。onClose / onunload 相当の破棄処理で
  tracker.clearAll() を呼ぶ。行数増加を避けるため、既存の局所変数や即時関数を
  そのまま置き換える形で適用する(新規ヘルパは utils 側に隔離)。
  完了条件: GraphViewContainer.ts 内の素の setTimeout がゼロ、
  かつ Max Allowed 8655 を超えないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

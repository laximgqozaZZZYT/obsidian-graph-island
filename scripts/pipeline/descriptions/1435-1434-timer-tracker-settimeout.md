## Description (subtask of 1434-settimeout-leaks)

src/utils/timer-tracker.ts を新規作成。以下のAPIを export する:
    - createTimerTracker(): { setTimeout, clearTimeout, clearAll }
    - 内部で Set<number> にハンドルを保持
    - 発火時は自動で Set から削除
    - clearAll() で全 timeout を window.clearTimeout
  併せて src/ 全体を grep して setTimeout / clearTimeout の出現箇所(行番号付き)を
  精読し、tests/utils/timer-tracker.test.ts に以下を追加:
    - setTimeout 登録 → 発火後に Set から削除されることを fake timers で検証(2件)
    - clearAll() で未発火ハンドルが全てクリアされる(1件)
    - 発火後に clearAll() しても二重 clear されない(1件)
  CLAUDE.md の "Forbidden Patterns" に違反しないこと(console.* 禁止、location.reload 禁止)。
  GOD OBJECT 4ファイルには触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

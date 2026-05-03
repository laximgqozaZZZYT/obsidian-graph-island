## Description (subtask of 1676-settimeout-leaks)

新規ファイル `src/utils/timer-tracker.ts` を作成する。
  以下の API を持つ軽量クラス `TimerTracker` を export する:
  - `setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout>`
    内部で `setTimeout` を呼び、返却される ID を `Set` に格納する。
    タイマー発火時に Set から自動的に remove する。
  - `clearAll(): void` — 保持中の全 ID に対して `clearTimeout` を呼び、Set を空にする。
  - `size(): number` — テスト/デバッグ用に保持中タイマー数を返す。
  既存ファイルは変更しない。 God Object には触らない。
  対応する単体テスト `tests/utils/timer-tracker.test.ts` を作成し、
  以下を検証:
  1. `setTimeout` 登録後 `size()` が 1 増える
  2. 発火後 `size()` が 0 に戻る (vitest fake timers 使用)
  3. `clearAll()` 呼び出しで全タイマーがクリアされ `size()` が 0
  4. 同じ ID を二重 clear しても例外を投げない
  CLAUDE.md の Conventions に従い、テストは `tests/` 配下にミラー配置する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

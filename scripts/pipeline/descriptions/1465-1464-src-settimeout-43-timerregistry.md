## Description (subtask of 1464-settimeout-leaks)

Grep で src/ 配下の `setTimeout(` と `clearTimeout(` を全列挙し、各 setTimeout の
  戻り値タイマーID が破棄処理 (onunload/destroy/dispose) で clearTimeout されている
  かをファイル単位で確認する。確認結果はサブタスク内の作業メモとして整理する
  (未クリア対象の file:line を後続サブタスクで使えるよう列挙)。

  共通ユーティリティを新規作成する: src/utils/timer-registry.ts
    class TimerRegistry {
      setTimeout(fn: () => void, ms: number): number;  // 内部で setTimeout を呼び ID を Set に保持
      clear(id: number): void;                          // 単一 clearTimeout + Set から削除
      clearAll(): void;                                 // 全タイマー clearTimeout
      dispose(): void;                                  // clearAll + Set 破棄
    }
  ユニットテストを tests/utils/timer-registry.test.ts に追加する (vitest fake timers
  使用)。テスト観点: setTimeout の登録、clear の単発解除、clearAll の一括解除、
  dispose 後の再利用禁止 (任意)。
  この時点では既存の setTimeout 呼び出しは置き換えない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

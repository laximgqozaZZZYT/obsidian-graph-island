## Description (subtask of 1381-settimeout-leaks)

1. src/views/ 配下を対象に grep で setTimeout 全件と clearTimeout の対応箇所を洗い出し、
     未クリアな setTimeout 呼び出しを特定する (実数は調査後に確定)。
  2. src/utils/timeout-tracker.ts を新設し、setTimeout ID を Set に保持して
     clearAll() で一括 clearTimeout する小さなクラス TimeoutTracker を実装する。
     - 既存 GraphViewContainer.ts は God Object 上限 8655 行ぎりぎりのため肥大化禁止。
       追加は new TimeoutTracker() 1 行 + clearAll() 1 行 + setTimeout 呼び出し置換のみ。
     - tracker 本体は新規ファイルに置く。
  3. src/views/ 内の未クリア setTimeout 呼び出しを tracker.set(...) 形式に置換し、
     onunload / destroy / cleanup 等の終了処理で tracker.clearAll() を呼ぶ。
  4. pnpm lint と pnpm test を流し、回帰がないことを確認する。
  5. ratchet 違反がないか pnpm build と God Object 行数を確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

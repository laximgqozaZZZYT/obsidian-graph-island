## Description (subtask of 1454-settimeout-leaks)

既存の ManagedTimer / managed-timer ヘルパー (src/utils/ 配下) が存在するか確認し、なければ
  setTimeout の戻り値を保持して unregister 時に clearTimeout する小さなユーティリティを
  src/utils/managed-timer.ts として実装する。実装が既にある場合は再利用する。
  続いて Grep で `setTimeout\(` / `clearTimeout\(` を src/ 配下で全列挙し、対応する
  clearTimeout 呼び出しのない setTimeout を最大 6 箇所特定して、その 6 箇所を
  ManagedTimer / 既存の managed パターンに置換する。対象ファイルは Grep 結果から
  選定する (GraphViewContainer.ts は God Object なので追加メソッドを生やさず、
  既存の onunload/destroy フックでまとめて clear する形にする)。
  最後に `pnpm test` と `pnpm lint` を通す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

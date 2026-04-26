## Description (subtask of 1284-settimeout-leaks)

src/ 配下の `setTimeout(` 呼び出しを全件 grep し、それぞれについて以下を判定する:
    a) 戻り値を変数/フィールドに保持しているか
    b) onunload / detach / close / destroy 系のライフサイクルで clearTimeout されているか
    c) 内部で再帰的に setTimeout する自己ループか (clearTimeout でしか止められない)
  この調査結果を `docs/audit/timer-audit-2026-04-26.md` に表形式で出力する (file:line, 用途, 現状クリア有無, 推奨対応)。
  この時点ではコード変更は行わず、監査ファイルの追加のみ。GOD OBJECT のソース行数は増やさない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

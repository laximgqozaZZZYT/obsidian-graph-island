## Description (subtask of 1454-settimeout-leaks)

src/views/GraphViewContainer.ts 内の全 setTimeout 呼び出しを精読し、戻り値を破棄している箇所を特定する。
  既存の `_pendingTimeouts: Set<number>` に類するフィールドが無ければ追加し、各 setTimeout の戻り値を Set に登録、
  コールバック完走時に Set から delete する。onClose() / destroy() / unload() 系メソッドで Set を走査し
  clearTimeout を呼んで Set.clear() する。GOD OBJECT ポリシー上 8655行を超えないこと(現8652行→純増≤3行で収める。
  既存の cleanup 配列があるなら再利用すること)。本ファイルは最大の発生源と推定されるため、ここで最低5件の未クリアを潰す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

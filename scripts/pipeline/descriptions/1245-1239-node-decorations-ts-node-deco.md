
## Description (subtask of 1239-1235-node-decorations-ts-node-deco)

1. `src/constants.ts` を読み、subtask-1 で追加された 11 個の `NODE_DECO_*` 定数名と値を列挙する。
  2. `src/views/node-decorations.ts` を精読し、各 `NODE_DECO_*` 定数値に一致するインライン数値リテラルの出現箇所(行番号と周辺コード)を特定する。
  3. 対応マッピング (定数名 → ファイル内の出現位置リスト) を、本タスクのログ/コメントアウトではなくコミットメッセージ本文か作業メモとして内部的に持つ。本タスクではコード変更は行わない (調査フェーズ)。
  4. 曖昧一致 (例: `baseRadius + 4` のオフセット `4`) は置換対象外としてマークする。完全一致かつ意味的に同じ用途のリテラルのみ置換候補とする。
  5. 成果物: 次の

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

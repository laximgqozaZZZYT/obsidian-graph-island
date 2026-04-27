## Description (subtask of 1391-settimeout-leaks)

Grep で `src/views/**/*.ts` 内の `setTimeout(` 呼び出しを列挙し、対応する `clearTimeout(` の有無を確認する。
  ID を捨てている箇所（`setTimeout(() => ..., n)` で戻り値を受けていない）を中心に、
  - GraphViewContainer.ts: View クラスの `_pendingTimers: Set<number>` 等のフィールドにIDを蓄積
  - PanelBuilder.ts: パネル破棄時にクリアするためIDを呼び出し元に返却 or 保持
  既存の onunload / onClose / destroy ハンドラに `for (const id of this._pendingTimers) clearTimeout(id); this._pendingTimers.clear();` を追加する。
  GOD OBJECT ルール上、これらのファイルは行数を増やさない方針なので、追加コードは既存のクリーンアップブロックの中に最小行数で押し込む（必要なら近傍の冗長記述を削って相殺）。
  変更後 `pnpm test` がグリーンであることを確認しコミットする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

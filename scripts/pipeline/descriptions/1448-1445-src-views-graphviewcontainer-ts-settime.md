## Description (subtask of 1445-settimeout-leaks)

Subtask 1 の audit 結果のうち `GraphViewContainer.ts` 内の未クリア setTimeout を
  対象にする。GVC は 8652 行の GOD object のため、行数を増やさない方針で実装する。

  実装方針:
  - 既存の `onClose()` / `onunload()` を読み、解放処理が集約されている箇所を特定
  - クラスに `private _pendingTimers: Set<number> = new Set();` を 1 フィールド追加
  - 既存の各 setTimeout 呼び出しを
    `const id = window.setTimeout(() => { this._pendingTimers.delete(id); ... }, ms);
     this._pendingTimers.add(id);`
    の形に書き換える (行数増を最小化するため局所的に)
  - `onClose()` 末尾で
    `for (const id of this._pendingTimers) clearTimeout(id); this._pendingTimers.clear();`
    を実行
  - 既に名前付きフィールド (`this._xxxTimer`) で管理されている timer は
    そのまま個別 clearTimeout を維持し、二重管理しない

  GOD object policy 厳守: GraphViewContainer.ts の行数 8655 を超えさせないこと。
  超える場合は別ファイル (`src/views/timer-registry.ts` 等) に薄いユーティリティを
  抽出してインポートする形で行数を相殺する。

  完了基準:
  - `pnpm lint` `pnpm format:check` `pnpm test` グリーン
  - リポジトリ全体で `Grep "setTimeout\("` の件数 - `Grep "clearTimeout\("` の件数 ≤ 10
    (Acceptance criteria: 未クリア setTimeout 10 個以下) を実測で確認しレポートに記載

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

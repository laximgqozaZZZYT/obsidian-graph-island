## Description (subtask of 1445-settimeout-leaks)

Subtask 1 の audit 結果をもとに、`PanelBuilder.ts` と `EdgeRenderer.ts` 内の
  setTimeout 呼び出しを精読し、解放されていないものに ID 保持 + clearTimeout を
  追加する。

  実装方針:
  - 各クラスに既存の解放メソッド (`destroy()` 等) があればそこに clearTimeout を追加
  - 無ければ既存の close/teardown フックに合わせる (新メソッド追加は最小限)
  - 行数を増やさないため、複数の timer を持つ場合は
    `private _pendingTimers: number[] = []` 形式で配列管理し、
    解放点で `for (const id of this._pendingTimers) clearTimeout(id);` を 1 行で済ます
  - 既存の動作 (debounce 等) を壊さないよう、同じ用途の timer は前回分を
    clearTimeout してから setTimeout し直すパターンに揃える

  GOD object policy 厳守: 両ファイルの行数を「Max Allowed」(PanelBuilder=2216,
  EdgeRenderer=2765) を超えさせないこと。差分は ratchet down only。

  完了基準: `pnpm lint` `pnpm format:check` `pnpm test` 全部グリーン。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

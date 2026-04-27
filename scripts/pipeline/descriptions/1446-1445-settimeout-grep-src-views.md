## Description (subtask of 1445-settimeout-leaks)

まず `Grep` で `setTimeout\(` と `clearTimeout\(` を `src/` 全体に対して件数取得し、
  43 vs 25 の差分の発生箇所をファイル単位で特定する。
  そのうち `src/views/GraphViewContainer.ts` / `src/views/PanelBuilder.ts` /
  `src/views/EdgeRenderer.ts` / `src/views/RenderPipeline.ts`
  (= GOD object 4ファイル) **以外** のファイルを今回の対象とする。

  各該当箇所について以下を行う:
  - `setTimeout` の戻り値をローカル変数や `this._xxxTimer` 等に保持する
  - 同クラス/モジュールの `destroy()` / `onClose()` / `dispose()` 等の解放点で
    `clearTimeout` する。解放点が無い場合は呼び出し側に責務を渡せる形にする
  - 既に存在する `register*` 系 (Obsidian Plugin の `registerInterval` 等) が使える
    場合は置換を検討する (ただし setTimeout には `registerInterval` は使えないため
    手動 clear が基本)

  GOD object 4ファイルは触らない (本タスクの守備範囲外)。

  完了基準: このタスクで触ったファイル群について、setTimeout と clearTimeout が
  対になっていることを目視確認し、`pnpm test` がグリーンであること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

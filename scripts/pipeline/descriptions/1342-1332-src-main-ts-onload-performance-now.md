## Description (subtask of 1332-loading-perf-regression)

GraphViewsPlugin.onload() を精読し、各処理ブロック (loadSettings、ensureSnapshotsLoaded があれば計測対象、registerView、addRibbonIcon、addCommand、各 await ブロックの前後、初期 activeLeaf 取得など) を performance.now() のマーカーで挟む。
  各フェーズ終了時に `console.info('[graph-island load]', phaseName, +(end - start).toFixed(1), 'ms')` を出力する。
  onload 全体の合計時間も最後に `[graph-island load] total: Xms` で出力する。
  console.* は esbuild の本番ビルドで drop される設定なので、計測は dev ビルド前提。
  既存ロジックは変更せず、計測コードの追加のみに留める。
  実施後 `pnpm build` を通し、deploy 先 vault (`/home/ubuntu/obsidian-plugins/.obsidian/plugins/graph-island/main.js` と `/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js`) のうち CDP `app.vault.adapter.basePath` で active な方にコピーする。
  GOD OBJECT 制約 (main.ts は対象外だが) を意識し、行数を抑えること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

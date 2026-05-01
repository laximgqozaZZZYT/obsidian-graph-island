## Description (subtask of 1631-dead-exports)

事前生成済み `tmp/dead-exports-report.md` の "Category C — completely unused" セクションから、
  `src/utils/` および `src/analysis/` 配下のエントリのみを抽出して対応する。
  対応方針 (各シンボルごとに):
  1. シンボル定義行を Read して、関数/定数/型のいずれか確認
  2. プロジェクト全体を grep して、本当に参照ゼロか再検証 (動的import/再export経由含む)
  3. 参照ゼロなら シンボル本体ごと削除 (関数本体・コメントも含む)
  4. もし依存ヘルパー (private 関数) がそのシンボル専用なら一緒に削除
  5. 削除に伴うtest側の壊れがあれば、そのtest自体も削除 (Cカテゴリは「テストすらない」前提だが念のため)
  作業終了後に以下を実行して回帰がないことを確認:
  - `pnpm lint`
  - `pnpm test`
  - `node scripts/check-dead-exports.mjs` (PASSのまま、または改善方向)
  - `node scripts/list-dead-exports.mjs` でレポート再生成 → C カウントが減ったこと
  GOD OBJECT ファイル (GraphViewContainer / PanelBuilder / EdgeRenderer / RenderPipeline) には触らないこと。
  src/types.ts の export には触らないこと (D カテゴリは別タスク扱い)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

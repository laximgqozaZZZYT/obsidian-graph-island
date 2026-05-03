## Description (subtask of 1675-dead-exports)

ts-prune または knip を `pnpm dlx` で実行し、153件のdead exports
  (export済みかつプロジェクト内でimportされていない名前) を取得する。
  - `pnpm dlx ts-prune -p tsconfig.json` を実行して生出力をキャプチャ
  - 結果を `dead-exports-report.json` に保存（ファイルパス・export名・行番号）
  - ファイル別に件数を集計し、上位ディレクトリ（src/utils, src/views, src/layouts,
    src/parsers, src/ui 等）ごとに分類
  - レポートには「テスト/E2Eからのみ参照されている」ものは除外する判断材料も含める
  - GOD OBJECT 4ファイル (GraphViewContainer.ts, PanelBuilder.ts,
    EdgeRenderer.ts, RenderPipeline.ts) は別カテゴリで扱う
  - スクリプト本体は `scripts/find-dead-exports.mjs` に配置
  - 既存の lint/test には触れない、レポート生成のみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

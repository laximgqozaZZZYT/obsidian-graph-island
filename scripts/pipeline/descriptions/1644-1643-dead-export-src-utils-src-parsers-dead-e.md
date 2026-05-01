## Description (subtask of 1643-dead-exports)

1. `npx ts-prune` または `npx knip` を実行して、現在の dead exports リストを `dead-exports-report.txt` に出力 (コミット対象外、調査用)。実際の件数を測定して報告する。
  2. リストから src/utils/ と src/parsers/ 配下のエントリのみを抽出。
  3. 各エントリについて:
     - 同一ファイル内のみで参照されている → `export` キーワードを削除 (unexport)
     - どこからも参照されていない → 関数/定数/型自体を削除
     - 公開 API として将来必要そうなコメント/JSDoc がある場合は残す判断もあり (理由をコミットメッセージに記載)
  4. `pnpm test` で既存テストが全て通ることを確認。テストが落ちる場合、テストが dead export に依存していた可能性があるので、テスト側も調整。
  5. `pnpm lint` と `pnpm format:check` を通す。
  6. 着手前と着手後で `ts-prune` の件数を比較し、削減実数をコミットメッセージに記載 (例: "146 → 110, -36 in utils/parsers")。
  - 禁止: god object ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts) には触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

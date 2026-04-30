## Description (subtask of 1559-dead-exports)

pnpm exec ts-prune などで現状の dead exports 一覧を取得し、
  src/views/ 配下のシンボルのみを対象に処理する。
  各シンボルについて以下のいずれかを実行:
  - 完全に未使用 (テストからも未参照): 関数/定数/型ごと削除
  - export だけが余計 (同ファイル内では使用されている): export キーワードを外す
  - テストからのみ参照: テスト側の参照経路と存在意義を確認し、テストごと削除するか export 維持
  GOD OBJECT ポリシー (GraphViewContainer.ts / PanelBuilder.ts /
  EdgeRenderer.ts / RenderPipeline.ts) を遵守し、これらのファイルは
  「Max Allowed 行数を増やさない」ことを前提に、削除のみ行う (新規抽出はしない)。
  完了条件:
  - pnpm build / pnpm lint / pnpm test がグリーン
  - main.js のバンドルサイズが 800KB 予算を超えない
  - 該当タスクで処理した dead export 件数を commit message に明記する

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

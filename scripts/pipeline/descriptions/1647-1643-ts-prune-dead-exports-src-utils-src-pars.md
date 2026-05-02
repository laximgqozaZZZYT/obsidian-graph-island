## Description (subtask of 1643-dead-exports)

pnpm dlx ts-prune (または knip) を実行して dead exports 全件を取得し、
  プロジェクトルートに `.dead-exports.txt` として出力する (このファイルはコミットしない、作業メモ)。
  そのうち src/utils/, src/parsers/, src/layouts/ 配下のシンボルを対象に、
  以下の方針で対応する:
  - tests/ 配下からのみ import されている export → 残す (テスト用 public API)
  - src/ からも tests/ からも参照されていない export → `export` キーワードを削除して
    モジュール内 private 化、または完全に未使用なら関数/定数/型ごと削除
  - 型 export (interface/type) で未使用のものは削除
  pnpm test, pnpm lint, pnpm build を全て通すこと。
  バンドルサイズが減ることを `pnpm build` 後の main.js サイズで確認し、
  PR本文に before/after のサイズを記載する (推測値ではなく実測値)。
  GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は
  本サブタスクでは触らない (god object policyで別管理)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

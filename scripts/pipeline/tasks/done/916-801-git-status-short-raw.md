---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 801-769-subtask
depends: none
summary: `git status --short` を実行して raw 出力を取得するユーティリティを追加
---

## Description (subtask of 801-769-subtask)

親タスク 769-760-git-status-short のサブタスクとして、`git status --short` を
  read-only で呼び出して stdout を返すだけの薄いユーティリティを追加する。

  実装方針:
  - `scripts/autonomous/git-status-short.sh` (または既存の autonomous スクリプト群に合わせた配置) に
    `git -C "$REPO_ROOT" status --short` を実行し、終了コード 0 と raw stdout を保証する関数/シェルを追加
  - 出力は加工せずそのまま返す (trim・色付け・parsing は後続サブタスク/親タスクの責務)
  - エラー時 (non-zero exit) は stderr をそのまま透過し、exit code を呼び出し元に伝搬
  - 新規ファイル追加のみで、既存の God Object (GraphViewContainer.ts / PanelBuilder.ts /
    EdgeRenderer.ts / RenderPipeline.ts) には一切触れない
  - プラグイン本体の src/ は変更しない (これは自律パイプライン側のスクリプト)

  テスト:
  - 一時 git リポジトリを作成し、クリーン状態で空文字列が返ること
  - 未追跡ファイルや変更ファイルがあるとき `??`/`M ` などの short format が含まれること
  - 実行ディレクトリが git 外のとき non-zero exit することを検証
  - テストで `console.*` を使わない (CLAUDE.md 準拠)

  受け入れ基準:
  - `pnpm lint` / `pnpm format:check` パス
  - 追加テストが `pnpm test` でグリーン
  - 既存カバレッジ閾値を下げない
  - main.js バンドルに影響しない (src/ 外のため)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1084-1064-639-626-subtask-status-in-progress-done
depends: none
summary: 639-626 subtask ファイルの status を in-progress → done に置換
---

## Description (subtask of 1084-1064-639-626-subtask-status-in-progress-done)

対象ファイルの frontmatter 内 `status: cancelled` を `status: done` に置換する単一原子タスク。

  手順:
  1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定
     - 0件 or 2件以上なら作業中断しユーザーに報告
  2. Read で該当ファイルの先頭30行を取得し、frontmatter 内に `status: cancelled` が**1行だけ**存在することを確認
     - 複数ヒット or 0件なら中断
  3. Edit (replace_all=false) で `status: cancelled` → `status: done` を置換
  4. Bash `git status --short` を実行し、変更が当該1ファイルのみであることを確認
  5. Bash `git diff -- <file>` を実行し、以下がすべて保持されていることを目視確認:
     - priority / reported / source / parent / depends / summary フィールド
     - Description 本文および Acceptance criteria セクション
     - 差分が status 行1行のみ (`-status: cancelled` / `+status: done`)

  制約(CLAUDE.md準拠):
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は一切触らない
  - God Object 4ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は触らない
  - git mv / リネーム禁止
  - issues/ 配下の当該1ファイルのみ編集
  - pnpm test / pnpm lint は実行不要(ソース無変更のため)

  受け入れ基準:
  - 対象ファイルの frontmatter で `status: done`
  - 他 frontmatter フィールドおよび Description 本文が完全一致
  - `git status --short` の変更が当該1ファイルのみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

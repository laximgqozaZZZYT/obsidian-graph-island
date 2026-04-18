---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 1031-1011-git-mv-frontmatter-status-1
depends: none
summary: 対象ファイルを git mv + frontmatter status 更新 + 1コミット
---

## Description (subtask of 1031-1011-git-mv-frontmatter-status-1)

親issue 1011-990-subtask (さらにその親 990-866-issue-pending-done-git-mv-status-done) で指定された
  単一の対象ファイルに対して、以下を1セッション・1コミットで実施する。

  手順:
  1. 親issueの記述から対象ファイル1件を特定する
     (pending ディレクトリ配下にあるファイル1つ)
  2. `git mv <pending側パス> <done側パス>` でファイルを移動
     - 必ず `git mv` を使用 (cp+rm や mv 単独は禁止: 履歴追跡のため)
  3. 移動後ファイルの frontmatter の `status:` 行を1行だけ該当値
     (例: pending → done / completed など親issue指定に従う) に書き換える
     - frontmatter以外の本文は変更しない
     - `status:` 以外のフィールドは変更しない
  4. `git add` で mv と frontmatter 変更をまとめてステージし、1コミットにする
     - コミットメッセージ例: `chore: move <filename> pending→done and update status`
  5. 検証:
     - `pnpm test` が通ること
     - `pnpm lint` が通ること (任意だが推奨)
     - `git log -1 --stat` で rename 検出されていることを確認

  禁止事項 (CLAUDE.md 準拠):
  - God Object 4ファイル (GraphViewContainer.ts / PanelBuilder.ts /
    EdgeRenderer.ts / RenderPipeline.ts) への変更禁止
  - ハードコード追加禁止、coverageしきい値の変更禁止
  - 対象ファイル1件以外の編集禁止 (スコープ厳守)
  - `location.reload()` 追加禁止
  - 2コミットに分割しない (mv と status 変更は同一コミット)

  Acceptance:
  - [ ] 対象ファイルが done ディレクトリに移動済み (git mv 履歴あり)
  - [ ] frontmatter status が指定値に更新済み
  - [ ] 単一コミットで完結
  - [ ] `pnpm test` PASS
```

`★ Insight ─────────────────────────────────────`
- **過剰分解を避ける**: 親issueが「既に原子的」と宣言しているタスクをさらに分解すると、git mv とfrontmatter編集が別コミットになり `git log --follow` でのリネーム追跡が壊れる。1セッション=1コミットで保つのが正解。
- **`git mv` と通常mvの差**: Git は mv+edit を1コミットで行った場合のみ rename として検出する (類似度閾値 50%)。frontmatter 1行変更程度なら安全圏。
- **God Object ガード**: 本タスクは docs/task ファイルの移動のみなので src/views/* には触れない前提。分解先タスクで誤ってソースに波及しないよう "対象ファイル1件以外の編集禁止" を明記している。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

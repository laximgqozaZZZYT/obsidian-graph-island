---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 751-712-subtask
depends: none
summary: status=done の issue ファイルを git mv で移動し frontmatter を整合させて単一コミット
---

## Description (subtask of 751-712-subtask)

親issue `712-699-639-626-subtask-issue-status-done-git-mv` の指示に従い、
  status: done となっている issue ファイルを所定のアーカイブ/完了ディレクトリへ移動する。

  手順（1セッションで完結させること。途中コミット禁止）:
  1. 対象ファイルの特定
     - `issues/` 配下を Grep で `status: done` 検索
     - 既にアーカイブ/完了パスにあるものは除外
  2. 移動先ディレクトリの決定
     - 既存の done/完了 issue が置かれている慣例パスに合わせる（リポジトリ内を `ls` で確認）
     - 新規ディレクトリを勝手に作らない
  3. `git mv` でファイル移動（通常の `mv` は禁止: 履歴が切れる）
  4. frontmatter の整合性確認
     - `status: done` のまま保持
     - `parent:` などのパス参照が切れていないか grep で確認、切れていれば追従修正
  5. 単一コミットでコミット
     - メッセージ例: `chore: archive done issues via git mv`
     - `--no-verify` 禁止、hook が通ることを確認

  CLAUDE.md 準拠事項:
  - God Object (GraphViewContainer.ts 等) には一切触れない
  - `src/` 配下のコード変更は発生しない想定。発生する場合はスコープ外として中止
  - テスト追加は不要（ファイル移動のみでロジック変更なし、`pnpm test` が既存のまま通ることだけ確認）

  完了条件:
  - [ ] 対象ファイルが移動済み
  - [ ] frontmatter 整合
  - [ ] `pnpm test` パス（回帰なし確認）
  - [ ] 1コミットにまとまっている

---

これ以上の分解は行いません。自律パイプラインの1セッション (max-turns 30) で十分完結します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

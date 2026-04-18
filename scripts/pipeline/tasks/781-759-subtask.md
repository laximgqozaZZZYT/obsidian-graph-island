---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 759-730-edit-read-frontmatter
depends: none
summary: Edit 前の frontmatter/body を baseline.json に記録 (subtask-1)
---

## Description (subtask of 759-730-edit-read-frontmatter)

1. 対象 .md ファイル (parent 730-717-status-done-edit の Edit 対象) を Edit 実行前に Read。
2. frontmatter セクション (先頭 `---` から 2 つ目 `---` まで) をパースし以下キーを抽出:
   `priority` / `reported` / `status` / `parent` / `depends` / `summary` / `source`
   - `status` は期待値 `done` に置換して保存する (Edit 後の期待値として扱う)
3. `## Description` 行以降の本文 (末尾改行含む) を文字列としてそのまま保持。
4. `.claude/tasks/730-717-status-done-edit/baseline.json` に以下の JSON を書き込み:
   `{ "frontmatter": { ... }, "body": "..." }`
   - 保存先ディレクトリが無ければ作成。
5. 書き込み完了後 `BASELINE SAVED` を stdout に出力し exit 0。
6. 新規スクリプトは `src/` 配下に置かず CLAUDE.md の God Object には一切触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

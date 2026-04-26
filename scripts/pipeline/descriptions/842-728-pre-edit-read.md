
## Description (subtask of 728-717-subtask)

1. Glob で `issues/pending/*639-626*subtask*.md` にマッチするファイルを列挙する。
  2. 複数ヒットした場合は Read で frontmatter を確認し、`summary: subtask issueのstatusをdoneに更新しコミット` と一致するファイルを選択する。
  3. 対象ファイルを Read で完全に読み込み、frontmatter の現在の status 値が `status: decomposed` であることを検証する。
  4. この時点ではファイルを変更しない。
  5. 出力: 対象ファイルの絶対パス1件と、frontmatter 全行 (1-7行目相当) をそのまま表示する。
  6. CLAUDE.md に違反する変更 (God Object 肥大化, 依存追加, location.reload 等) は一切加えない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

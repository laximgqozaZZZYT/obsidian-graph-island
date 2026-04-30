## Description (subtask of 1408-type-assertions)

1. `grep -rn " as " src/parsers/ src/layouts/` でファイル別件数を測定
  2. 主に frontmatter パース・YAML パース由来の `value as string` / `meta as Record<…>` パターンを対象
  3. 置換方針:
     - `unknown` を入口で受け取り、型ガード (例: `isFrontmatterShape(v)`) を経由してから内部型に narrow
     - layout の `node as ExtendedNode` 系は ExtendedNode のフィールドを既存 Node に optional で吸収するか型ガードで分岐
  4. 型ガードは

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

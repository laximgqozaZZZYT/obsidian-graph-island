## Description (subtask of 1412-dead-exports)

1. `pnpm dlx ts-prune` または `pnpm dlx knip --reporter json` を実行し、
     "111個のdead exports" の実体を一覧化する。
     結果を `.autonomous-worktrees/.../dead-exports.txt` に保存
     (frontmatter なしの一時ファイル、commit 不要)。
  2. 一覧のうち src/utils/, src/parsers/, src/layouts/ 配下の項目に絞り込む。
     - 各シンボルについて `git log -S "export ... <name>"` で導入意図を確認
     - tests/ から参照されている場合は対象外 (テストヘルパは残す)
     - `src/main.ts` 経由で Obsidian 側に公開されている API は対象外
  3. 純粋な未使用シンボル: 宣言ごと削除
     関連ファイル内で内部利用されているシンボル: `export` キーワードのみ削除
  4. `pnpm build && pnpm test && pnpm lint` を通す。
  5. 削除件数を commit message に記載
     (例: "chore: remove N dead exports from utils/parsers/layouts")。
  ※ godobj ファイル (GraphViewContainer.ts 等) には touch しない。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

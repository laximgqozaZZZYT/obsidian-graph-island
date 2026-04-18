---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 1047-1020-subtask
depends: none
summary: 親issue 1020-1013-subtask のフロントマター status を done へ遷移
---

## Description (subtask of 1047-1020-subtask)

`issues/` ディレクトリ配下の親 issue ファイル `1020-1013-subtask.md` (または同名パターンのファイル) を特定し、
  フロントマターの `status: done` (または `in-progress`) を `status: done` に書き換える。

  手順:
  1. `ls issues/ | grep 1020-1013` でファイル名を確認 (git mv 回避のためリネームしない)
  2. Read ツールで対象ファイルのフロントマターを確認
  3. Edit ツールで `status:` 行のみを `done` に変更
  4. `pnpm lint` と `pnpm test` が通ることを確認 (フロントマター編集のみなので影響なしのはず)
  5. `git add issues/<該当ファイル> && git commit -m "chore: done 1020-1013-subtask"`

  制約:
  - ファイルリネーム (git mv) は禁止
  - 他のフィールド (priority/parent/depends 等) は変更しない
  - God Object ファイル (GraphViewContainer.ts 等) には一切触れない
  - `issues/` 配下のフロントマター1行書き換えのみに限定

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1010-988-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done へ原子的に移動（git mv + status書換 + 単一コミット）
---

## Description (subtask of 1010-988-639-626-subtask-issue-pending-done-git-m)

手順:
  1. `Glob issues/pending/*639-626*subtask*.md` で対象特定
     - 0件 → `Glob issues/done/*639-626*subtask*.md` 確認。該当あれば no-op で exit 0
     - 複数件 → 中止してユーザー報告（自動処理しない）
     - 1件 → 次へ
  2. Read で対象ファイルを開き、Edit で `status:` 行 (pending または in-progress) のみ `status: done` に置換
     - 他 frontmatter フィールド / Description 本文は絶対に変更しない
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行
  4. `git status` で差分検証:
     - pending/<filename>.md が削除
     - done/<filename>.md が追加
     - status 行 1行のみの変更
     - それ以外のファイル差分があれば中止
  5. `git add -A && git commit -m "chore: done <filename>"` (拡張子なしベース名)
  6. 最終検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` が "chore: done <filename>" と一致
     - `ls issues/done/<filename>.md` が存在
  
  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - issues/ 配下のみ
  - lint/test/build 不要
  - God Object の GraphViewContainer.ts 等は一切触らない
  - `location.reload()` 禁止規則は本タスクでは無関係（コード変更なし）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

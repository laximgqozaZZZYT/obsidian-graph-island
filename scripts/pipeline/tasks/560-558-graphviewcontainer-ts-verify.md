---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 558-554-graphviewcontainer-ts-verify
depends: none
summary: GraphViewContainer.ts の行数を verify し空コミットで記録
---

## Description (subtask of 558-554-graphviewcontainer-ts-verify)

verify-only タスク。コード変更は一切行わない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し実測行数を取得
  2. 実測値が 8612 以下であることを確認 (期待値: 8597)
     - 8612 超過時: 空コミットを作成せず、実測値と超過事実を報告して終了 (fail-fast)
  3. 条件を満たした場合、現ブランチ (fix/autofit-suppress-order) で空コミット作成:
     ```
     git commit --allow-empty -m "$(cat <<'EOF'
     chore: verify GraphViewContainer.ts ≤ 8612 (actual: <実測値> lines)

     - 親issue 518-501-graphviewcontainer-ts-verify の subtask chain (523-518 → 本タスク) を閉じる
     - CLAUDE.md GOD OBJECT Policy 上限 8597 以下を維持 (ratchet 準拠)
     - コード未変更のため pnpm test / pnpm lint は再実行不要
     EOF
     )"
     ```
  4. `git log -1 --oneline` で空コミットが記録されたことを確認
  5. `git status` がクリーン (作業ツリーに変更なし) であることを確認

  制約 (CLAUDE.md GOD OBJECT Policy 準拠):
  - src/views/GraphViewContainer.ts を含む全ファイルの編集禁止
  - pnpm test / pnpm lint の実行不要 (コード変更ゼロ)
  - git push は実行しない (ローカルコミットのみ)

  受け入れ条件:
  - [ ] wc -l 実測値が 8612 以下
  - [ ] 空コミットが fix/autofit-suppress-order に存在
  - [ ] git status がクリーン

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 554-536-graphviewcontainer-ts
depends: none
summary: GraphViewContainer.ts の行数を verify し空コミットで記録
---

## Description (subtask of 554-536-graphviewcontainer-ts)

verify-only タスク。コード変更は一切行わない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行
  2. 出力行数が 8612 以下であることを確認 (期待値: 8597)
     - 8612 超過の場合: 本タスクを中断し、報告のみで終了する (空コミットを作成しない)
  3. 行数が条件を満たした場合、現ブランチ (fix/autofit-suppress-order) に空コミットを作成:
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

  制約:
  - `src/views/GraphViewContainer.ts` を含む全ファイルを編集禁止 (CLAUDE.md GOD OBJECT Policy)
  - `pnpm test` / `pnpm lint` の実行不要 (コード変更ゼロのため)
  - `git push` は実行しない (ローカルコミットのみ)

  受け入れ条件:
  - `wc -l` 実測値が 8612 以下
  - 空コミットが fix/autofit-suppress-order に存在
  - `git status` がクリーン (作業ツリーに変更なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

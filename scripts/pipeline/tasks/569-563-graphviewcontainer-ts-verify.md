---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 563-560-graphviewcontainer-ts-verify
depends: none
summary: GraphViewContainer.ts の行数を verify し空コミットで記録
---

## Description (subtask of 563-560-graphviewcontainer-ts-verify)

verify-only。コード変更は一切行わない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で実測行数を取得
  2. 実測値 ≤ 8612 を確認 (期待値 8597)
     - 超過時: コミット作成せず、実測値と超過事実を報告して fail-fast 終了
  3. 条件満足時、fix/autofit-suppress-order ブランチで空コミット作成:
     ```
     git commit --allow-empty -m "$(cat <<'EOF'
     chore: verify GraphViewContainer.ts ≤ 8612 (actual: <実測値> lines)

     - 親issue 518-501-graphviewcontainer-ts-verify の subtask chain (523-518 → 本タスク) を閉じる
     - CLAUDE.md GOD OBJECT Policy 上限 8597 以下を維持 (ratchet 準拠)
     - コード未変更のため pnpm test / pnpm lint は再実行不要
     EOF
     )"
     ```
  4. `git log -1 --oneline` で空コミット記録を確認
  5. `git status` がクリーンであることを確認

  制約:
  - 全ファイル編集禁止 (src/views/GraphViewContainer.ts 含む)
  - pnpm test / pnpm lint 実行不要
  - git push は実行しない (ローカルコミットのみ)

  受け入れ条件:
  - wc -l 実測値 ≤ 8612
  - 空コミットが fix/autofit-suppress-order に存在
  - git status がクリーン

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

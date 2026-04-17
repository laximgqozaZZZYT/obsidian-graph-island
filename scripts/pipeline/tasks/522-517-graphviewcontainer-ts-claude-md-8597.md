---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 517-501-graphviewcontainer-ts-claude-md
depends: none
summary: GraphViewContainer.ts の行数計測と CLAUDE.md 上限 8597 との比較・判定
---

## Description (subtask of 517-501-graphviewcontainer-ts-claude-md)

実行手順:
  1. `wc -l src/views/GraphViewContainer.ts` を実行し行数 N を取得する。
  2. CLAUDE.md の GOD OBJECT Policy 表の "Max Allowed" = 8597 と比較する
     (元issueの "8612" は古い値、CLAUDE.md の 8597 を真とする)。

  分岐A: N ≤ 8597 の場合
  - ファイル変更なし。
  - `git commit --allow-empty -m "chore: verify GraphViewContainer.ts ≤ 8597 (actual: N lines)"`
    (N は実測値を埋める) で空コミットを作成する。
  - 標準出力に「PASS: N ≤ 8597」を1行出力して終了。

  分岐B: N > 8597 の場合
  - コミットは作らない。
  - 標準出力に以下を出力:
    - 実測行数 N
    - 超過幅 (N - 8597)
    - 次アクション: "parent task 491-483 に decompose subtask 追加要請"
  - 親 issue ファイル (.claude/issues/ 配下の 491-483-*.md) の description に
    超過事実を追記し、frontmatter の priority を critical に昇格させる。
  - この場合は親タスクの再分解が必要なため、ここでコード変更は行わない。

  制約:
  - GraphViewContainer.ts のリファクタリングは行わない (計測と判定のみ)。
  - CLAUDE.md の Max Allowed は ratchet down 専用 (増やさない)。
  - Acceptance: コード未変更のため `pnpm build` / `pnpm lint` は自明に PASS。
    分岐Aでは空コミット作成のみ、分岐Bではコミットなし + 親issue更新のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

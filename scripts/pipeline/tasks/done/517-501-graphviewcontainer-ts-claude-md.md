---
priority: high
reported: 2026-04-17
status: decomposed
source: decomposed
parent: 501-491-
depends: none
summary: GraphViewContainer.ts の行数計測と CLAUDE.md 上限判定
---

## Description (subtask of 501-491-)

`wc -l src/views/GraphViewContainer.ts` を実行し現在行数 N を取得。
  CLAUDE.md の GOD OBJECT Policy 表の "Max Allowed" 列 (現在 8597) と比較する。

  判定と出力:
  - N ≤ Max Allowed (8597) の場合:
    - 変更不要。`git commit --allow-empty` で
      "chore: verify GraphViewContainer.ts ≤ 8597 (actual: N lines)"
      のメッセージでコミット。
  - N > Max Allowed の場合:
    - コミットは作らず、以下を含む短いレポートを標準出力する:
      - 実測行数 N
      - 超過幅 (N - 8597)
      - 次アクション: "parent task 491-483 に decompose subtask 追加要請"
    - 親 issue 491-483 の description に超過事実を追記 (priority: critical に昇格)。

  注意:
  - CLAUDE.md の "Max Allowed" は ratchet down 専用 (増やさない)。
  - 元 issue 文中の "8612" は古い値。CLAUDE.md の現在値 8597 を真として使う。
  - 本タスクで GraphViewContainer.ts のリファクタリングは行わない (計測と判定のみ)。
  - Acceptance: `pnpm build` と `pnpm lint` が PASS のまま (コード未変更なので自明)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

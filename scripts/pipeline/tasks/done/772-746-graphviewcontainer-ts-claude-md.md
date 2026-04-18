---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 746-725-graphviewcontainer-ts-claude-md-god-obje
depends: none
summary: GraphViewContainer.ts の行数取得と CLAUDE.md 表との照合
---

## Description (subtask of 746-725-graphviewcontainer-ts-claude-md-god-obje)

GraphViewContainer.ts の現在行数を取得し、CLAUDE.md の GOD OBJECT Policy 表と照合する。

  手順:
  1. Bash で `wc -l src/views/GraphViewContainer.ts` を実行し、行数 N を取得
  2. Read ツールで CLAUDE.md の GOD OBJECT Policy 表 (該当する表の行 `| src/views/GraphViewContainer.ts | 8597 | 8597 |`) を確認
  3. 判定ロジック:
     - N < 8597 → "RATCHET_NEEDED" (subtask-3 で表を N に更新する必要あり)
     - N == 8597 → "NO_CHANGE" (境界値、更新不要)
     - N > 8597 → "POLICY_VIOLATION" (GOD OBJECT Policy 違反、要報告)
  4. 判定結果を conversation ログに記録する形式:
     ```
     GraphViewContainer.ts measurement result:
     - Current: N lines
     - CLAUDE.md table: 8597 lines
     - Delta: (N - 8597)
     - Judgment: RATCHET_NEEDED / NO_CHANGE / POLICY_VIOLATION
     - Next action: subtask-3 を実行する / スキップ / 上位へエスカレート
     ```

  制約:
  - src/ tests/ 配下は一切編集しない (read-only)
  - CLAUDE.md も編集しない (read-only、更新は subtask-3 の役割)
  - 測定と判定のみ、ファイル変更ゼロ
  - コミット不要 (測定のみのため)

  完了条件:
  - N 値と判定結果が conversation 内に明確に記録されている
  - ファイル変更が発生していない (`git status` で確認)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

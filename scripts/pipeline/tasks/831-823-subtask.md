---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 823-811-git-status-short-tmp-git-status-short-tx
depends: none
summary: subtask
---

## Description (subtask of 823-811-git-status-short-tmp-git-status-short-tx)

`★ Insight ─────────────────────────────────────`
- 元issueは既に非常に小粒（git status実行+検証のみ）なので、過剰分解せず論理的な検証ステップで区切るのが適切
- `EXIT=$?` パターンはshellの終了コードを出力にキャプチャする定番手法で、パイプライン側から機械的にパース可能
- `/tmp/` 配下限定・state変更禁止の制約は、読み取り専用のdiagnosticタスクとして安全に並列実行できる設計
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

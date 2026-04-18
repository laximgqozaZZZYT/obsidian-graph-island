---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 627-609-graphviewcontainer
depends: subtask-2
summary: 閾値との比較結果をissueに記録しPASS/FAIL判定
---

## Description (subtask of 627-609-graphviewcontainer)

subtask-2で取得した実測値とCLAUDE.md閾値 S28.6/B27.1/F25.4/L28.3 を比較。
  対象issueファイル（parent 609の本subtask）に以下を追記:
  - 実行日時
  - 実測値 S/B/F/L
  - 閾値との差分（+N.NN / -N.NN）
  - 判定: 全指標≥閾値ならPASS、1つでも下回ればFAIL
  FAIL時は不足指標と不足幅を明記し、statusを `failed` に更新（閾値引き下げは絶対禁止）。
  PASS時はstatusを `done` に更新、Acceptance criteriaにチェックを入れる。

---

`★ Insight ─────────────────────────────────────`
- 3タスクに絞った理由: 検証タスクは「設定確認 → 実測 → 判定記録」の3段が自然な粒度で、それ以上分けるとcontext受け渡しコストが増える
- subtask-2で一時ファイル経由にしたのは、claude -p セッション間で標準出力が共有されないため。ファイル経由が最も確実な受け渡し方法
- FAIL時の対応を「閾値を下げずに実装改善側で対処」と明示することで、ラチェット機構の意図（quality gate が緩まない）を守る
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

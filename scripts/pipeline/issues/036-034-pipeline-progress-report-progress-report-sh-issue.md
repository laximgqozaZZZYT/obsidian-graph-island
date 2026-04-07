---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 034-pipeline-progress-report
depends: none
summary: progress-report.sh のコア集計ロジック作成（コミット・セッション・issueキュー）
---

## Description (subtask of 034-pipeline-progress-report)

scripts/pipeline/progress-report.sh を新規作成。以下を集計して
  /tmp/graph-island-progress.md に Markdown 出力するシェルスクリプト:

  1. コマンド引数: HOURS (デフォルト 6)
  2. 直近 N 時間のコミット集計:
     - git log --since="$HOURS hours ago" --oneline --grep="(auto)" で
       auto-improve コミット抽出
     - focus 別内訳: commit message から (coverage|eslint|refactor|subtask) を
       grep -oP で抽出しカウント
  3. アクティブセッション数:
     - /tmp/graph-island-sessions/*.pid の有効PID数
       (kill -0 で生存確認、stale除外)
  4. 完了セッション一覧:
     - /tmp/graph-island-improve-results/*.json を jq でパースし
       直近 N 時間のものを timestamp でフィルタ
     - テーブル形式: | session | focus | commits | timestamp |
  5. Issue キュー状態:
     - scripts/pipeline/issues/*.md の status 別カウント
       (pending/in-progress)
     - scripts/pipeline/issues/done/*.md の件数
     - 直近完了した5件のissue名とsummary

  出力形式:
  # Graph Island 進捗レポート
  生成時刻: YYYY-MM-DD HH:MM:SS
  集計期間: 直近 N 時間
  ## コミット (N件)
  | focus | count |
  ## アクティブセッション (N/2)
  ## 完了セッション
  | session | focus | commits | timestamp |
  ## Issue キュー
  - pending: N件, in-progress: N件, done: N件
  - 直近完了: ...

  動作確認: bash scripts/pipeline/progress-report.sh で
  /tmp/graph-island-progress.md が生成され、cat で読めること。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

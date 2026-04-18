---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 730-717-status-done-edit
depends: none
summary: subtask
---

## Description (subtask of 730-717-status-done-edit)

手順:
  1. Bash ツールで `git status --short` を実行
  2. 出力をパースして以下を検証:
     - 対象ファイルが `M ` または ` M` マーク (modified) で出現する
     - 他に modified (`M`)/added (`A`)/deleted (`D`) のファイルが
       存在しない
  3. 予期せぬファイルが変更されていたら WARNING として報告:
     - ファイル名一覧
     - subtask-1 で編集したファイル以外が変わった原因の推測
       (hook による自動整形、IDE の副作用など)
  4. 検証結果をログに残して終了。git mv / git add / git commit は
     一切実行しない (兄弟タスクに委譲)。

  成功条件:
  - 対象ファイル 1 件だけが modified 状態
  - untracked ファイルが増えていない
  - 他の tracked ファイルが変更されていない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

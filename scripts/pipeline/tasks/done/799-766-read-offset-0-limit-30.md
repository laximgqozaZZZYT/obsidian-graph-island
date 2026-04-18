---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 766-733-issue-read-frontmatter
depends: none
summary: Read ツールを offset=0, limit=30 で実行しログ出力
---

## Description (subtask of 766-733-issue-read-frontmatter)

701-691-glob-read から引き渡された絶対パス変数 ISSUE_PATH に対し、
  Read ツール (offset=0, limit=30) を実行する疑似コード／ログ行を追記。
  取得した生テキストを変数 RAW_HEAD に格納し、
  ログに `[frontmatter-read] read 30 lines: <path>` を出力する。
  コードファイルは一切変更せず、タスクファイル内の Description に
  実行トレース（期待ログ）を追記するのみ。

### 実行トレース（期待ログ）

```text
# [前提] 701-691-glob-read の出力変数
ISSUE_PATH="/abs/path/to/issue.md"   # 絶対パス、存在検証済み

# [呼び出し] Read ツール (offset=0, limit=30)
RAW_HEAD = Read(file_path=ISSUE_PATH, offset=0, limit=30)

# [stdout ログ行]
[frontmatter-read] read 30 lines: /abs/path/to/issue.md

# [事後条件]
# - RAW_HEAD は先頭 30 行の生テキスト（cat -n 行番号プレフィックスは呼出側で剥がす）
# - 行数不足ファイル（<30 行）でも同ログを出力し、RAW_HEAD は実行数行分のみ保持
# - 本タスクはトレース追記のみで副作用なし（次タスクで RAW_HEAD を消費）
```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

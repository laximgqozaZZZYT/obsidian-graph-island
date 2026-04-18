---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 684-639-subtask-2-pass-fail
depends: subtask-1
summary: 集計・サマリ出力・SKIP判定・PASS時に結果ファイル保存
---

## Description (subtask of 684-639-subtask-2-pass-fail)

subtask-1 のスクリプト出力を受け取り、次タスク (subtask-3) の実行可否を判定する bash スクリプトを新規作成。
  - `scripts/read-subtask2-result.sh` を呼び出し key=value を取得。
  - stdout に下記サマリを出力:
    ```
    [607-597 subtask-2 result]
    status  : <status>
    PASS    : <pass>
    FAIL    : <fail>
    executed: <executed>
    ```
  - gate 判定:
    - `fail>0` または `status=blocked` または `status=unknown` の場合、`SKIP: subtask-3 は実行しない` を出力し exit 0 で終了 (パイプラインを止めない)。
    - 上記以外 (status=done かつ fail=0) の場合、`/tmp/607-597-subtask-2-result.txt` に 1 行サマリ `status=done pass=<N> fail=0 executed=<YYYY-MM-DD>` を書き出し、`OK: subtask-3 実行可` を出力。
  - ファイル編集はしない (`/tmp/` への書き出しのみ許可)。
  - CLAUDE.md の「God Object を肥大化させない」「console.* を production コードに入れない」ルールに違反しない (scripts/ 配下の bash なので該当しない)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 621-606-graphviewcontainer-ts-issue
depends: none
summary: GraphViewContainer.ts 行数計測スクリプト作成
---

## Description (subtask of 621-606-graphviewcontainer-ts-issue)

`scripts/check-gvc-lines.sh` を新規作成。
  処理内容:
  - `wc -l < src/views/GraphViewContainer.ts` で行数 N を取得
  - N <= 8597 の場合: `echo "OK: N=$N (<=8597)"` して exit 0
  - N > 8597 の場合:
    - 超過行数 over = N - 8597 を計算
    - `ls issues/*.md | sed -E 's|issues/([0-9]+)-.*|\1|' | sort -n | tail -1` で既存最大連番 M を取得
    - 次連番 NEXT = M + 1 を算出
    - ファイル名候補 `${NEXT}-598-graphviewcontainer-ts-over-limit.md` を生成
    - stdout に `N=<N>` `OVER=<over>` `NEXT=<NEXT>` `FILE=<filename>` を出力して exit 1
  シバン `#!/bin/bash` と `set -eu` を付ける。chmod +x で実行可能にする。issue ファイル自体の作成は行わない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

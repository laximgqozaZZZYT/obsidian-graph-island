## Description

`scripts/pipeline/verify-issue-done.sh` が autonomous pipeline の false-done を検出できていない。

### 観測された false-done 事例 (2026-05-06)
- task `1702-1700-addlinkneighborstoset-hover-helpers-ts-e` が `done` で commit (eb3a3ddf)
- task `1704-1701-density-heatmap-ts-accumulatedensitygrid` が `done` で commit (2de7d5bc)
- 実体: GraphViewContainer.ts:4250 `_addLinkNeighbors` も :6609 `_accumulateDensityGrid` も
  そのまま残存。hover-helpers.ts に `addLinkNeighborsToSet` export 無し。
  `src/views/density-heatmap.ts` は local main に**存在しない**(origin/main 限定)。
- それでも `bash scripts/pipeline/verify-issue-done.sh 1702-... ; echo $?` は **0** を返す。
- 結果: 親 issue 1700/1701 まで cascaded done → reconcile が必要に。

### 根本原因

verify-issue-done.sh は `## Acceptance criteria` section から backtick-quoted file path を
抽出して `git ls-files --error-unmatch` で存在確認する。

ところが decompose-issue.sh が生成する subtask の acceptance criteria template は:
```
## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
```
… と **generic 文言のみ** で backtick path を含まない。よって verify-issue-done.sh は
チェックすべきファイルが 0 件 と判定し、無条件で exit 0 する。

`scripts/pipeline/descriptions/1702-...md` の **Description 本文** には
`tests/views/hover-helpers.test.ts` (要新規作成) や具体的な signature が書かれているが、
verify は Acceptance criteria section しか見ない設計。

### 副次原因 (bifurcation)

local main と origin/main が divergent (local 12 state-flip vs origin 7 substantive PR)。
autonomous-improve.sh は local 上で動くため、PR #232/#233 で merge された helper file が
local に無く、extract task が **物理的に成立不能** な状態で pickup されている。

## Acceptance criteria

- [ ] `scripts/pipeline/decompose-issue.sh` の subtask template (around L74-89) を強化:
   acceptance criteria に「変更対象ファイル(複数可)を backtick で列挙する」項目を必須化。
   例: `- [ ] \`src/views/hover-helpers.ts\` に新規 export が追加されている`
- [ ] `scripts/pipeline/verify-issue-done.sh` を強化: backtick path が **新規作成** か
   **既存修正** かを判定し、新規作成なら `git diff --name-status main..HEAD -- <path>` で
   `A` (Added) を、既存修正なら `M` (Modified) を要求する。
   - ヒント: 現状は `git ls-files --error-unmatch` で存在確認のみ → 不十分
- [ ] `scripts/pipeline/reconcile-false-done.sh` を強化: 既存 done issue を再 verify する際に
   actual diff の有無を確認 (現状は verify-issue-done.sh と同じロジックで二度手間)。
- [ ] tests for verify-issue-done.sh: false-done を 1 件捕捉できる回帰テストを追加
   (例: 上記 1702 の状態を再現する fixture を `tests/pipeline/verify-issue-done.spec.sh` に)。
- [ ] **bifurcation 対策の検討** (このタスクに含めるかは impl 判断):
   autonomous-improve.sh で `git fetch origin main && git rev-list HEAD..origin/main --count` が
   閾値を超えたら SKIP し alert を file する。

## Candidate files
- `scripts/pipeline/verify-issue-done.sh:39-103` (Acceptance section parser + path verification)
- `scripts/pipeline/decompose-issue.sh:74-89` (subtask prompt template)
- `scripts/pipeline/reconcile-false-done.sh:23-31`
- `scripts/pipeline/autonomous-improve.sh` (bifurcation guard 候補位置: 起動前 dirty check 周辺)

## Observed evidence
- `eb3a3ddf chore: done 1702-1700-...` — diff stat = `2 files changed, 2 insertions(+), 2 deletions(-)`
  (どちらも CSV のみ。src/ tests/ への変更ゼロ)
- `2de7d5bc chore: done 1704-1701-...` — 同上。
- `7d709c91 chore(alert): autonomous-improve has SKIP-ed 3+ consecutive cycles` — bifurcation 由来の
  watchdog 発火。R7.1 で extract した `csv_file_alert` が現場で動いていることの確認にもなった。

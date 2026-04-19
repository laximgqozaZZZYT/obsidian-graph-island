---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1149-139-baseline-node-count-2000
depends: subtask-1
summary: E2E smoke テストを実行してトレース出力を tmp-debug-nodecount.md に記録し原因段階を特定
---

## Description (subtask of 1149-139-baseline-node-count-2000)

test vault (`/home/ubuntu/obsidian-plugins/開発/`) に subtask-1 の main.js をデプロイし、
  `npx playwright test e2e/smoke.spec.ts` を実行。
  CDP経由 (`localhost:9222`) で console.debug 出力を収集し、各段階の nodeCount を
  `tmp-debug-nodecount.md` に表形式で記録 (stage / nodes / edges / delta)。
  2000未満に減った段階を特定し、根本原因仮説 (例: showOrphans で has-tag エッジ扱いがおかしい、
  existingOnly で path解決ミス、など) を同ファイルに記述。
  このタスクで src/ 変更は無い (読み取り+実行+ログのみ) ため、subtask-1 のコミットを維持したまま観察する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

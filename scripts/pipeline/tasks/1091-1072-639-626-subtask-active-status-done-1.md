---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1072-1056-639-626-subtask-active-1-status-done
depends: none
summary: 639-626-subtask active 候補を列挙し status:done 置換対象 1 件を選定
---

## Description (subtask of 1072-1056-639-626-subtask-active-1-status-done)

1. Bash で `ls scripts/pipeline/tasks/ | grep -E '639-626.*subtask'` を実行し、
     done/ サブディレクトリを除いた active 候補を列挙する。
  2. 各候補を Read して frontmatter を確認し、以下の条件を満たすものを抽出:
     - `status:` が `decomposed` または `in-progress`
     - `depends: none`
  3. 抽出結果のうち ID 番号 (ファイル名先頭の数値列) が最小のものを 1 件選定。
  4. 選定根拠 (候補一覧・各 status 値・選定理由 = ID 最小) をテキスト出力する。
  5. 選定ファイルのパスを明示する。
  6. この段階ではファイル編集を行わない (選定のみ)。

  禁止: src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs,
  God Object 4 ファイルへの変更。git mv や done/ への移動も禁止。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

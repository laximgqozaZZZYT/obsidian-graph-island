---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 802-769-subtask
depends: none
summary: git status --short 実行関数を新規ファイルに実装
---

## Description (subtask of 802-769-subtask)

新規ファイル `src/utils/git-status.ts` を作成し、以下の純粋関数を実装する:
  - `runGitStatusShort(cwd: string): Promise<string>` — Obsidian環境で利用可能な子プロセス実行API（Electron `require("child_process").exec`）を介して `git status --short` を実行し、stdout生出力をそのまま返す
  - エラー時は rejected Promise を返す（stderr含む）
  - 戻り値は加工なしの string（改行・空白保持）
  - types.ts へのエクスポート追加は不要（utils内で完結）
  - CLAUDE.md規約: `console.*` 禁止、hardcoded magic number禁止、i18n不要（内部関数）
  - God Object への追加は一切しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

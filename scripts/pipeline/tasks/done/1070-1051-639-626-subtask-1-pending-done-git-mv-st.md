---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1051-1018-639-626-subtask-1-pending-done-git-mv-st
depends: none
summary: 639-626 subtask 1件を pending→done へ git mv + status書換 + 単一コミット
---

## Description (subtask of 1051-1018-639-626-subtask-1-pending-done-git-mv-st)

単一アトミック操作（分割禁止）。以下を1コミットで実行:

  1. Glob `issues/pending/*639-626*subtask*.md`
     - 0件 かつ issues/done に同名存在 → "already done" 報告して exit 0
     - 0件 かつ done にも無し → 中止（報告のみ）
     - 2件以上 → 中止（自動選択禁止、人間判断へエスカレーション）
     - 1件 → 次ステップへ
  2. Read で frontmatter を確認し、現 status が `decomposed` か `in-progress` か `pending` のどれか特定
  3. Edit で該当1行のみ `status: done` へ書換（replace_all 禁止、他行不変を保つため old_string に status行前後の文脈を含める）
  4. Bash `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  5. Bash `git status --short` で検証:
     - 期待パターン: `R  issues/pending/X -> issues/done/X` + `M  issues/done/X` のみ
     - issues/ 外の差分があれば中止（`git restore --staged` で戻す）
  6. Bash `git add -A && git commit -m "chore: done <filename-without-ext>"`
  7. 最終検証（3つ全て必須）:
     - `git status` が clean
     - `git log -1 --pretty=%s` が `chore: done <basename>` と一致
     - `ls issues/done/<filename>.md` が存在

  禁止事項:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs への一切の変更
  - God Object 4ファイル（GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts, RenderPipeline.ts）に触れない
  - lint/test/build の実行不要（issues/配下のみの変更のため）
  - `location.reload()` 類の混入禁止

  Acceptance:
  - [ ] git log -1 が `chore: done <basename>` 形式
  - [ ] issues/pending に対象ファイル無し
  - [ ] issues/done に status: done で存在
  - [ ] git status clean
  - [ ] CLAUDE.md ルール違反なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

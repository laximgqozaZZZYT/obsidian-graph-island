---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 610-595-verify-report
depends: subtask-1
summary: verify-report.md を生成し、Acceptance criteria 判定を記載して上書き保存
---

## Description (subtask of 610-595-verify-report)

`.verify-data.json` を読み込み、`verify-report.md` を生成 (Write ツールで上書き)。
  セクション構成:
  1. `## 行数チェック` — 4 God Object の表 (File / Current / Max Allowed / Diff / 判定)
  2. `## Lint / Format` — `pnpm lint` / `pnpm format:check` の PASS/FAIL
  3. `## Test` — 総数 / PASS / FAIL
  4. `## Coverage` — S/B/F/L の % (vitest.config.ts のしきい値と比較)
  5. `## God Object Policy` — いずれかの Current > Max なら FAIL、それ以外 PASS
  6. `## Acceptance criteria (582-570 親タスク)` — 全項目 PASS なら最終 PASS、1つでも FAIL なら FAIL
  最終行に判定サマリ: `**総合判定: PASS**` or `**総合判定: FAIL**`。
  ヘッダに生成日時 (Asia/Tokyo, YYYY-MM-DD HH:mm) を記載。
  既存 verify-report.md がある場合でも追記せず完全上書き。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

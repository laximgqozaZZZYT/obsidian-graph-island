---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1007-873-subtask
depends: none
summary: God Object 4ファイル行数測定 → CLAUDE.md Max Allowed 更新 → 原子的コミット
---

## Description (subtask of 1007-873-subtask)

元issueに「単一コミット要件のため分解は要件違反」と明示されているため、1タスクに集約。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` で現在行数を測定
  2. CLAUDE.md の "GOD OBJECT Policy" 表を読み込み、現在の Max Allowed と比較
  3. 実測値が Max Allowed より小さい場合のみ、Max Allowed を実測値に更新（ratchet down only ルール準拠）
  4. 実測値が Max Allowed を超えている場合は、PASS/FAIL を本文（CLAUDE.md外、コミットメッセージ）に記録し、超過ファイルを警告
  5. 実測値が Max Allowed と一致する場合は CLAUDE.md 変更なし、コミットなしでスキップ可
  6. 変更がある場合のみ、CLAUDE.md の差分を1コミットに含める（測定と記録の乖離防止のため、複数コミットに分割しない）

  ガード:
  - God Object ファイル本体は変更禁止（行数を増減させない）
  - Max Allowed の引き上げ禁止（ratchet down only）
  - 変更なしの場合は空コミットを作らない

  完了基準:
  - [ ] 4ファイル行数測定完了
  - [ ] CLAUDE.md Max Allowed が実測値以下であることを保証
  - [ ] 必要な場合のみ1コミット作成

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 1019-1007-god-object-4-claude-md-max-allowed
depends: none
summary: God Object 4ファイル行数測定 → CLAUDE.md Max Allowed ratchet down → 原子的1コミット
---

## Description (subtask of 1019-1007-god-object-4-claude-md-max-allowed)

単一コミット要件のため分解不可。以下を1セッション内で完遂する。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts` を実行し、4ファイルの現在行数を測定
  2. CLAUDE.md の "GOD OBJECT Policy" 表（GraphViewContainer.ts 8583 / PanelBuilder.ts 2216 / EdgeRenderer.ts 2702 / RenderPipeline.ts 2321）を Read で読み込み、実測値と比較
  3. 判定ロジック:
     - 実測値 < Max Allowed → Max Allowed を実測値に更新（ratchet down only）
     - 実測値 == Max Allowed → 変更なし、コミットなしで終了（空コミット禁止）
     - 実測値 > Max Allowed → CLAUDE.md は変更せず、コミットメッセージ本文に PASS/FAIL 表と超過警告を記録（ただしファイル変更がなければコミット自体作らない）
  4. CLAUDE.md に差分が発生した場合のみ、Edit で表を更新し、`git add CLAUDE.md && git commit` で1コミット作成
  5. コミットメッセージには4ファイルの実測値と旧 Max Allowed を併記し、測定と記録の乖離を追跡可能にする

  ガード:
  - God Object ファイル本体（src/views/*.ts）は読むのみ、絶対に編集しない
  - Max Allowed の引き上げ禁止（ratchet down only）
  - 変更なしケースで空コミットを作らない（`--allow-empty` 禁止）
  - 複数コミットへの分割禁止（測定と記録の原子性保証のため）

  完了基準:
  - 4ファイル行数測定が完了している
  - CLAUDE.md の Max Allowed 値がすべて実測値以上（超過時は CLAUDE.md 未変更で許容）
  - ファイル変更がある場合のみ1コミット、変更なしならコミットなしで正常終了

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1172-1167-buildedgedisplaysection-4
depends: subtask-1
summary: panel-sections-display.ts の不要 import / 未使用ヘルパー削除 + panel テスト緑化
---

## Description (subtask of 1172-1167-buildedgedisplaysection-4)

subtask-1 で `buildEdgeDisplaySection` 本体を削除したため、旧実装内だけで使われていた
  `src/views/panel-sections-display.ts` 内の import / 内部ヘルパー / 定数が dead code として
  残っている可能性がある。それを削除する。

  手順:
  1. `pnpm lint` を実行し "is defined but never used" / "is declared but never used" 系の
     warning/error をすべて拾う。
  2. 該当する import (types / i18n / UI helper) を削除。
  3. `buildEdgeDisplaySection` からのみ参照されていたファイル内 private helper 関数があれば
     削除 (他セクションから参照されている場合は残す — grep で確認すること)。
  4. God Object 方針遵守: 行数は純減のみ許可、新規ヘルパーは panel-sections-display.ts に
     追加しないこと (追加するなら panel-sections-edge-display.ts 側)。

  検証:
  - `pnpm build` 成功
  - `pnpm lint` が warning/error ゼロでパス
  - `pnpm test -- panel` で panel 関連テスト全パス

`★ Insight ─────────────────────────────────────`
- 2タスク構成にした理由: ラッパー置換(subtask-1)と dead code 掃除(subtask-2)は別コミットにすべき。置換だけならロジック等価性が明確だが、掃除は grep 必要で"判断"が入るため、レビュー単位を分離した方が安全。
- `panel-sections-display.ts` は subtask-1 実行後に約260行縮むため、God Object Policy (Max Allowed = 現在値の ratchet-down のみ) に自然適合する。新規コードを足さず純減させるのが鍵。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

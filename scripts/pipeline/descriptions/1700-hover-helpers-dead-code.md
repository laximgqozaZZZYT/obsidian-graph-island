## Description

PR #233 (autonomous refactor session auto-20260505-230001) で `src/views/hover-helpers.ts:589-684` に
新しい export が約 100 行追加された:

- `HoverHighlightTypes`
- `HoverHighlightInput` (interface, 9 GVC fields)
- `addLinkNeighborsToSet`
- `capHoverLabels`
- `buildHoverHighlightSet`

ところが `src/views/GraphViewContainer.ts:4213` の `_buildHoverHighlightSet` と `:4274` の
`_capHoverLabels` は **元のインライン実装のまま** で、新しい helper を import していない。

正味の効果: god-object 縮小を主張しながらコードベースを +100 行している (CLAUDE.md の
"GraphViewContainer.ts は priority-1 で減らせ" ポリシーに反する)。

## Root cause hypothesis

autonomous LLM が「extract する関数を別ファイルに書く」までは行ったが、
GVC 側を helper 呼び出しに置換する step を完遂せずに PR を merge してしまった。

## Acceptance criteria

- [ ] `src/views/GraphViewContainer.ts:4213 _buildHoverHighlightSet` 本体を削除し、
      `import { buildHoverHighlightSet } from "./hover-helpers"` 経由で呼ぶ
- [ ] `src/views/GraphViewContainer.ts:4274 _capHoverLabels` 本体を削除し、
      `import { capHoverLabels } from "./hover-helpers"` 経由で呼ぶ
- [ ] `tests/views/hover-helpers.test.ts` (新規) で extract 後の挙動を 5 件以上で検証
- [ ] GVC 行数が `_buildHoverHighlightSet` (~60 行) + `_capHoverLabels` (~20 行) ぶん減少
      → `Max Allowed: 8655` から ratchet down 可能になる
- [ ] hover-helpers.ts の `HoverHighlightInput` interface が leaky abstraction にならないか再検討:
      9 fields も forward するなら helper の意義が薄い → 必要なら shape を絞る

## Candidate files
- `src/views/GraphViewContainer.ts:4213, 4274` (置換対象)
- `src/views/hover-helpers.ts:589-684` (新 export — 現在 dead code)
- `src/views/hover-helpers.ts:53-62 HoverHighlightInput` (interface 設計再検討)

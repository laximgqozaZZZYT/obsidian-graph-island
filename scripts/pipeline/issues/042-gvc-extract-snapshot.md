---
priority: high
reported: 2026-04-07
status: pending
summary: GraphViewContainer.ts (8735行) から snapshot/export 系ロジックを抽出
---

## Description

`src/views/GraphViewContainer.ts` は最大の God Object (8735行/上限 9947)。CLAUDE.md の Decomposition Priority 1 で「snapshot, export, filter orchestration」を抽出すべきと明記されている。

最も独立性が高い候補:
- snapshot 取得関連 (グラフ状態を JSON に固める処理)
- export 系 (SVG/PNG/JSON 出力)

これらは描画ループに含まれず副作用が局所的で、純粋関数に切り出しやすい。

## Acceptance criteria

- [ ] GVC から **snapshot もしくは export 関連のメソッド群を新ファイルへ抽出** (例: `src/views/gvc/snapshot.ts` または `src/views/gvc/export-orchestrator.ts`)
- [ ] 抽出後の GVC 行数が **少なくとも 150 行減少**
- [ ] god-object-audit.sh の上限値を新しい行数に **ratchet down** (Max Allowed = current line count)
- [ ] 既存テストがすべてグリーン
- [ ] 抽出した関数に unit test を追加 (最低5ケース)
- [ ] CLAUDE.md の god object 表の current 行数を更新

## Non-goals

- 8735行を一気に減らす必要はない (1セッションで1モジュール)
- API 互換性を壊さない範囲での内部リファクタ

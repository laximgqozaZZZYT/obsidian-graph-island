---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1175-1168-buildedgevisibilitycontrols-3
depends: none
summary: buildEdgeVisibilityControls describe に 3 テスト追加
---

## Description (subtask of 1175-1168-buildedgevisibilitycontrols-3)

`tests/views/panel-sections-edge-display.test.ts` の末尾に以下の describe ブロックを追加する:

  ```ts
  describe("buildEdgeVisibilityControls", () => {
    it("edgeTypeCounts に link:5 を渡すと link トグル要素が生成される", () => {
      // container 要素を用意し、cb (mock callbacks: markDirty/rebuildPanel/getEdgeCounts) を渡す
      // buildEdgeVisibilityControls(container, { link: 5 }, cb) を呼ぶ
      // container.querySelector で link トグル (data-edge-type="link" 等) が存在することを確認
    });

    it("count=0 の edge type は (similar を除き) 描画されない", () => {
      // edgeTypeCounts={link:0, semantic:3, similar:0} を渡す
      // link トグルが querySelector で見つからないこと
      // similar トグルは存在すること (similar は count=0 でも常に表示)
      // semantic トグルは存在すること
    });

    it("Solo ボタンクリックで cb.markDirty と cb.rebuildPanel が両方呼ばれる", () => {
      // vi.fn() で markDirty, rebuildPanel を用意
      // buildEdgeVisibilityControls 呼び出し → solo ボタン取得 → click() ディスパッチ
      // expect(markDirty).toHaveBeenCalled() と expect(rebuildPanel).toHaveBeenCalled()
    });
  });
  ```

  制約:
  - 既存 5 テストの構造・mock セットアップに揃える (同ファイルの buildEdgeColorControls テスト参照)
  - 新規ヘルパーや fixture ファイルは作らない
  - `src/` 配下は一切変更しない (テスト追加のみ)
  - `pnpm test tests/views/panel-sections-edge-display.test.ts` が全 8 テスト PASS することを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

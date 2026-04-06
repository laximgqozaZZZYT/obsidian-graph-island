---
priority: medium
reported: 2026-04-06
status: pending
source: kaizen
summary: _showNodeExpansionのdocument keydownリスナーがEsc以外のクローズパスで解除されない
---

## Description

`src/views/GraphViewContainer.ts` line 3253-3260 の `_showNodeExpansion` メソッド:

```typescript
const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
        panel.remove();
        document.removeEventListener("keydown", onKey);
    }
};
document.addEventListener("keydown", onKey);
```

`document` に登録された `keydown` リスナーは **Escapeキー押下時のみ** 解除される。
しかし、パネルには他に2つのクローズパスがある:

1. **「Open file」ボタン** (line 3246-3248): `panel.remove()` のみ、`removeEventListener` なし
2. **「Cancel」ボタン** (line 3250-3251): `panel.remove()` のみ、`removeEventListener` なし

**結果**: ノードをクリック→Open/Cancelボタンで閉じるたびに、`document` に `keydown` リスナーが1つずつ蓄積する。
頻繁にノード詳細を開くユーザーでは数十〜数百のリスナーがリークし、Escapeキー押下時に全リスナーが一斉発火して
既に存在しないDOM要素の `panel.remove()` を繰り返し呼び出す。

## Acceptance criteria

- [ ] `onKey` リスナーの解除をすべてのクローズパス(Open/Cancel/Escape)で確実に行う
- [ ] パネルの `remove` をラッパー関数に統一し、リスナー解除を一元化する
- [ ] ビューの `onClose()` でもフォールバック解除する(パネル表示中にタブを閉じた場合)

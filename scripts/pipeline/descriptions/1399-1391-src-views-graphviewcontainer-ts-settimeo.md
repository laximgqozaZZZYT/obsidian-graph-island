## Description (subtask of 1391-settimeout-leaks)

Grep で `src/views/GraphViewContainer.ts` 内の全 `setTimeout(` 呼び出しを列挙する。
  各呼び出しが対応する `clearTimeout` を持つか確認し、未クリアのものを特定する。
  既存の `private` フィールドに `_pendingTimeouts: Set<number>` を追加し、
  未クリア箇所を以下パターンに置換:
    - 戻り値を `_pendingTimeouts.add(id)` で登録
    - コールバック先頭で `_pendingTimeouts.delete(id)` する
  既存の `onunload()` / `destroy()` で `_pendingTimeouts` を全 `clearTimeout` してから `clear()`。
  既に明示的に clearTimeout している既存箇所には触らない。
  GOD OBJECT ポリシー: ライン数増は最小限 (新フィールド1行 + cleanup 1ループのみ)、
  個別 setTimeout 行は変更後も実質1行を維持する。Max Allowed 8655 を超えないこと。
  完了条件: `grep -c "setTimeout(" src/views/GraphViewContainer.ts` と
  `grep -c "_pendingTimeouts\.add\|clearTimeout" src/views/GraphViewContainer.ts` を実測値で
  PR 本文に記載する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

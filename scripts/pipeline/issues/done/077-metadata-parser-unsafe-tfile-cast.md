---
priority: high
reported: 2026-04-11
status: done
source: kaizen
summary: metadata-parser.ts で getAbstractFileByPath の戻り値を null チェックなしに as TFile キャストしている
---

## Description

`src/parsers/metadata-parser.ts:405`:

```typescript
const cache = app.metadataCache.getFileCache(
    app.vault.getAbstractFileByPath(node.id) as TFile
);
```

`getAbstractFileByPath()` はファイルが存在しない場合 `null` を返す。
`as TFile` キャストにより TypeScript の null チェックがバイパスされ、
削除済みファイルや存在しない `node.id` が来た場合に `getFileCache(null)` が呼ばれる。

**再現条件**: vault 内のファイルを削除した直後、グラフが再描画される前にこのパスが実行される。
shared metadata edges のループ内なので、1件の欠損が後続の全エッジ計算に影響する可能性がある。

## Acceptance criteria

- [ ] `getAbstractFileByPath()` の戻り値を null チェックし、null なら `continue` する
- [ ] `as TFile` キャストを `instanceof TFile` ガードに置き換える
- [ ] 既存テスト (`pnpm test`) がパスする

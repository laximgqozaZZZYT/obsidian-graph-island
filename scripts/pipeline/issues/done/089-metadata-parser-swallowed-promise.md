---
priority: medium
reported: 2026-04-11
status: done
source: kaizen
summary: metadata-parser.ts の body preview Promise が空 catch でエラーを握りつぶしている
---
## Description

`src/parsers/metadata-parser.ts:138` で、body preview の非同期読み込み Promise の
`.catch(() => {})` が全てのエラーを無言で握りつぶしている。

```typescript
(rawContent as Promise<string>)
    .then((text) => {
        contentCache.set(file.path, text);
        const info = extractBodyInfo(text, 100);
        node.bodyPreview = info.preview;
        node.bodyLength = info.length;
    })
    .catch(() => {});  // ← 全エラーを無視
```

**問題:**
- ファイル I/O エラー（パーミッション、ディスク障害）が完全に隠蔽される
- `bodyPreview` と `bodyLength` が `undefined` のまま残り、
  下流のレンダリングやフィルタリングで予期しない動作を引き起こす可能性がある
- vault に問題があっても開発者・ユーザーにフィードバックが一切ない

**所在:** `src/parsers/metadata-parser.ts:138`

## Acceptance criteria
- [ ] `.catch()` 内で少なくとも `console.warn()` でエラー内容を記録する（esbuild が prod で除去）
- [ ] エラー時に `node.bodyPreview` と `node.bodyLength` に明示的なデフォルト値を設定する（例: `""` と `0`）
- [ ] 空 catch パターンが他にないか `src/` を確認する

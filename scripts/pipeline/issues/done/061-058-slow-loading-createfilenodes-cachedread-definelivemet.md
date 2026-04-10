---
priority: high
reported: 2026-04-10
status: done
source: decomposed
parent: 058-slow-loading
depends: subtask-1
summary: createFileNodes の cachedRead 二重呼び出しを排除し、defineLiveMeta を遅延化
---

## Description (subtask of 058-slow-loading)

現状の問題:
  - createFileNodes (L92-116) で attachBodyPreview → cachedRead を呼ぶ
  - buildEdgesFromLinks → collectInlineRelations (L263-274) で再度 cachedRead を呼ぶ
  - defineLiveMeta (L748-761) が全ノードに Object.defineProperty を実行
  
  改善:
  1. buildGraphFromVault 内でファイルコンテンツキャッシュ Map<string, string> を作成
     - Phase 1 の createFileNodes で cachedRead した結果をキャッシュに格納
     - Phase 3 の collectInlineRelations でキャッシュから取得 (cachedRead を省略)
     - 関数のパラメータに contentCache を追加
  
  2. defineLiveMeta の呼び出しを createFileNodes ループから除去
     - 代わりに node.meta を最初のアクセス時に遅延解決する Proxy パターン、
       または getGraphData() の後段で必要になるまで定義しない
     - ※ meta は UI 表示時のみ使用されるため、グラフ構築時には不要
  
  テスト: 既存の metadata-parser テストが全パス + 新規テスト (キャッシュ動作確認)
  計測:

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

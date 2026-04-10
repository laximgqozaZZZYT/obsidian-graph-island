---
priority: high
reported: 2026-04-10
status: done
source: decomposed
parent: 058-slow-loading
depends: subtask-2
summary: buildGraphFromVault の重い処理を非同期化し、UIスレッドブロックを解消
---

## Description (subtask of 058-slow-loading)

現状の問題:
  - getGraphData() → buildGraphFromVault() が同期実行
  - 2232ファイル × 5フェーズが UIスレッドを長時間ブロック
  
  改善:
  1. buildGraphFromVault を async 化 → buildGraphFromVaultAsync
     - Phase 1 (createFileNodes) を チャンク分割 (100ファイルごとに yield)
     - 各チャンク間で requestAnimationFrame or setTimeout(0) を挟む
     - Phase 3 (buildEdgesFromLinks) も同様にチャンク分割
  
  2. GraphViewContainer.getGraphData() を async 化
     - doRender() から呼ばれる箇所を await 対応に変更
     - ローディング表示: 構築中は statusEl に "Building graph..." を表示
  
  3. 後方互換: 同期版 buildGraphFromVault も残す (EmbeddedGraphRenderer が使用)
     - EmbeddedGraphRenderer (L129) は小規模データなので同期版で十分
  
  注意: GraphViewContainer.ts は God Object (8612行上限)。行数を増やさないこと。
  必要なら async wrapper を別の小さなヘルパーファイルに切り出す。
  
  テスト: 既存テスト全パス + async 版の基本動作テスト

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

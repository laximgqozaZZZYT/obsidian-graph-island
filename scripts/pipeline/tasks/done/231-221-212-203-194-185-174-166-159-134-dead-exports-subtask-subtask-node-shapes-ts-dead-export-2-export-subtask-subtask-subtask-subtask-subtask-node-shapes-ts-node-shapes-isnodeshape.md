---
priority: high
reported: 2026-04-16
status: done
source: decomposed
parent: 221-212-203-194-185-174-166-159-134-dead-exports-subtask-subtask-node-shapes-ts-dead-export-2-export-subtask-subtask-subtask-subtask-subtask
depends: none
summary: node-shapes.ts の NODE_SHAPES と isNodeShape のデッドエクスポート除去
---

## Description (subtask of 221-212-203-194-185-174-166-159-134-dead-exports-subtask-subtask-node-shapes-ts-dead-export-2-export-subtask-subtask-subtask-subtask-subtask)

src/utils/node-shapes.ts から以下のデッドエクスポートを処理する:
  
  1. `NODE_SHAPES` — export キーワードを除去し、ファイル内ローカル定数にする。
     NodeShape 型の導出 `(typeof NODE_SHAPES)[number]` で使われているため定義自体は残す。
     ALL_SHAPES と重複しているが、NodeShape型がNODE_SHAPESに依存しているため残す。
  
  2. `isNodeShape` — src/ 内のどこからもimportされていない。
     export キーワードを除去してローカル関数にする。
     ファイル内でも呼び出されていないなら、関数自体を削除する。
  
  3. tests/node-shapes.test.ts から isNodeShape のimportがあれば除去し、
     関連テストケースも削除する（テストのみで使われるexportは不要）。
  
  4. `pnpm lint && pnpm test` で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 221-212-203-194-185-174-166-159-134-dead-exports-subtask-subtask-node-shapes-ts-dead-export-2-export-subtask-subtask-subtask-subtask-subtask
depends: none
summary: node-shapes.ts の getNodeDisplayConfig デッドエクスポート除去
---

## Description (subtask of 221-212-203-194-185-174-166-159-134-dead-exports-subtask-subtask-node-shapes-ts-dead-export-2-export-subtask-subtask-subtask-subtask-subtask)

src/utils/node-shapes.ts から以下のデッドエクスポートを処理する:
  
  1. `getNodeDisplayConfig` — src/ 内のどこからもimportされていない（テストのみ）。
     この関数がプロダクションコードで使われる見込みがないなら:
     - export キーワードを除去してローカル関数にする
     - テストファイルからのimportと関連テストケースを削除
     - ファイル内で使われていなければ関数自体を削除
  
  2. ただし、この関数が ShapeRule の display フィールドと連携する
     意図的なパブリックAPIである可能性を確認すること。
     src/ 内で ShapeRule.display を参照している箇所を grep で確認し、
     getNodeDisplayConfig が本来呼ばれるべき箇所がないか調べる。
     もし呼ばれるべき箇所があるなら、export を残してこのタスクはスキップ。
  
  3. `pnpm lint && pnpm test` で確認。
```

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

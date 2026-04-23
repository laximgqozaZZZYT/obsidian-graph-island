---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1210-1205-export
depends: none
summary: cluster-force.ts の3純粋関数に export を追加
---

## Description (subtask of 1210-1205-export)

src/layouts/cluster-force.ts の以下の関数に `export` キーワードを追加する (シグネチャ変更禁止):
  - L2438付近: `function backlinkBucket(deg: number): string` → `export function backlinkBucket(...)`
  - L2345付近: `function partitionNodes(nodes, groupBy, degrees)` → `export function partitionNodes(...)`
  - L1538付近: `function computeEffectiveColumnSpacing(...)` → `export function computeEffectiveColumnSpacing(...)`

  注意点:
  - 行番号は目安。実際は関数名で grep して該当箇所を特定
  - 関数本体・引数・戻り値は一切変更しない
  - 既存の呼び出し箇所への影響なし (export 追加は後方互換)
  - ビルド確認: `pnpm build` がエラーなく通ること
  - 既存テスト: `pnpm test cluster-force` が回帰しないこと
  - GOD OBJECT ポリシー違反なし (cluster-force.ts は対象外、行数増加なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

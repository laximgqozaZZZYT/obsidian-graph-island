---
priority: medium
reported: 2026-04-17
status: decomposed
source: decomposed
parent: 492-483-pnpm-build-800kb
depends: none
summary: subtask
---

## Description (subtask of 492-483-pnpm-build-800kb)

で 800KB 超過が判明した場合のみ実行。
  subtask-3 で追加されたコード差分 (`git diff` parent..HEAD) を確認し、
  esbuild の `--analyze` 相当（`metafile: true` 出力）でサイズ寄与の大きいモジュールを特定。
  削減手段は以下の順で検討: (1) 不要 import 削除, (2) デバッグ/console 残留除去,
  (3) 重複ユーティリティの統合。God Object 拡張は禁止（CLAUDE.md GOD OBJECT Policy）。
  予算内に戻ったら再度 pnpm build で確認しコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

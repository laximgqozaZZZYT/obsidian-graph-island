---
priority: medium
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 116-scattered-constants
depends: subtask-3
summary: src/parsers/ と src/utils/ の定数を constants.ts に集約 (バッチ3: ~80個)
---

## Description (subtask of 116-scattered-constants)

parsers/ と utils/ 配下から閾値・limit・フィールド名定数を抽出。
  - 対象: `MAX_*_LENGTH`, `DEFAULT_*_LIMIT`, `*_FIELD_NAME`, `*_PATTERN`, 正規表現以外の文字列定数
  - 正規表現リテラルは移動しない (ファイル内文脈が重要なため)
  - `src/constants.ts` に `// === PARSING === ` と `// === QUERY ===` セクションを追加
  - pnpm test で parsers/utils 系テストが全て PASS することを確認
  - 目標: 約80個 (278 → 198)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

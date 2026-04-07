---
priority: critical
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 040-merge-skip-silent-failure
depends: none
summary: verify-issue-done.sh を新規作成し受け入れ基準ファイル存在検証を実装
---

## Description (subtask of 040-merge-skip-silent-failure)

新規スクリプト `scripts/pipeline/verify-issue-done.sh` を作成。
  引数: issue ファイルパス (例: issues/034-xxx.md)
  処理:
  1. issue ファイルの Acceptance criteria セクションを grep で抽出
  2. バッククォート囲みのファイルパス (`scripts/...`, `src/...` 等) を正規表現で収集
  3. 各パスに対し `git ls-files --error-unmatch <path>` で main HEAD に存在するか検証
  4. 1つでも欠けていたら exit 1 + "MISSING: <path>" を stderr 出力
  5. 全部揃っていたら exit 0
  chmod +x 付与。bash strict mode (`set -euo pipefail`)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 627-609-graphviewcontainer
depends: subtask-1
summary: pnpm test:coverageを実行しS/B/F/L数値を取得
---

## Description (subtask of 627-609-graphviewcontainer)

`pnpm test:coverage` を実行し、標準出力から
  All files の statements / branches / functions / lines 4指標を抽出。
  GraphViewContainer単体のカバレッジも併せて出力末尾を確認（ファイル別行）。
  数値を一時ファイル `/tmp/coverage-609-subtask2.txt` に
  `S=XX.XX B=XX.XX F=XX.XX L=XX.XX` 形式で保存。
  vitest実行に失敗した場合はエラーメッセージを記録して停止し、subtask-3はスキップ。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

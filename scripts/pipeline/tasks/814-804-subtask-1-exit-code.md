---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 804-769-
depends: none
summary: subtask-1 exit code 検証とエラー時即時終了ロジック実装
---

## Description (subtask of 804-769-)

subtask-2 スクリプトの前段として、subtask-1 の実行結果を受け取り検証する処理を実装。
  - subtask-1 の $? (exit code) を捕捉
  - 非0 の場合: stderr 内容を含めて報告メッセージを出力し、exit 1 で即終了
  - 0 の場合のみ後続処理へ進める (gate として機能)
  - bash/sh スクリプトでの実装 — プラグイン TypeScript には触れない
  - God Object ファイル (GraphViewContainer.ts 等) 非変更
  - CLAUDE.md Forbidden Patterns 遵守 (プラグイン側には console.* 追加しない)
  テスト: subtask-1 が成功/失敗する両ケースで手動検証 (exit 0 / exit 1 返却確認)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

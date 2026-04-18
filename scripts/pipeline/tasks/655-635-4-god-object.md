---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 635-624-4-god-object-wc-l
depends: none
summary: 4つのGod Objectファイルの行数を計測して一時ファイルに保存
---

## Description (subtask of 635-624-4-god-object-wc-l)

以下を実行する:

  1. プロジェクトルート (/home/ubuntu/obsidian-plugins/obsidian-graph-island) で次のコマンドを実行:
     wc -l src/views/GraphViewContainer.ts src/views/PanelBuilder.ts src/views/EdgeRenderer.ts src/views/RenderPipeline.ts > /tmp/god-object-measurement-2026-04-18.txt

  2. cat /tmp/god-object-measurement-2026-04-18.txt で4ファイル分 + total 行が含まれていることを確認

  3. CLAUDE.md の "GOD OBJECT Policy" テーブルの "Max Allowed" 値（GraphViewContainer.ts: 8597, PanelBuilder.ts: 2216, EdgeRenderer.ts: 2702, RenderPipeline.ts: 2321）と計測値を比較し、超過がある場合のみ警告として標準出力に表示（ファイル変更はしない）

  制約:
  - コード変更・テスト変更は一切しない (git diff は空のまま完了)
  - 新規ファイル追加禁止（/tmp配下の一時ファイルのみ可）
  - GOD OBJECT ファイルの編集は厳禁
  - pnpm test/build は不要（read-only タスク）

  完了条件:
  - /tmp/god-object-measurement-2026-04-18.txt に4ファイル分の行数が記録されている
  - git status がクリーン

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

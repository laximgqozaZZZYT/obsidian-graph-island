---
priority: critical
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 138-perf-usability-overhaul
depends: subtask-1
summary: doRender重複呼出+rAF多重起動の抑止層を新規ファイルに抽出
---

## Description (subtask of 138-perf-usability-overhaul)

新規 render-scheduler.ts に scheduleRender(reason) / cancelPending() / isFrameInFlight() を純粋関数 + 単一状態オブジェクトで実装。
  - 同一frame内で複数回 doRender() が呼ばれても 1回に coalesce
  - requestAnimationFrame が in-flight のときは新規発行せず reason を積む
  - cancel時に handle を null にし leak を防ぐ
  GraphViewContainer.ts からは「直接 requestAnimationFrame(this.doRender) を呼ぶ箇所」「doRender() を同期連鎖で呼ぶ箇所」を scheduler 経由に置換 (行数を増やさず**置換**で収める)。
  tests/views/render-scheduler.test.ts で coalesce/キャンセル/reason蓄積を単体検証。
  Acceptance: baseline.json 比でズーム中fpsが30+を維持、不要再描画回数が半減以上。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

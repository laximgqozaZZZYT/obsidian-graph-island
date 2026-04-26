## Description (subtask of 1294-settimeout-leaks)

src/utils/timer-registry.ts を新規作成。
  - class TimerRegistry { setTimeout(fn, ms): handle; clear(handle): void; clearAll(): void; size(): number }
  - 内部は Set<ReturnType<typeof setTimeout>> で保持
  - clearAll() は全ハンドルに clearTimeout を呼んで Set を空に
  - fn 実行完了時は自動で Set から削除 (リーク防止)
  tests/utils/timer-registry.test.ts で以下を検証:
  - setTimeout 登録 → size 増加
  - 自然完了で size 減少
  - clear(handle) で個別削除
  - clearAll() で全削除
  - clearAll 後に新規 setTimeout が動作すること
  本タスクでは既存の setTimeout 呼び出しは変更しない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと


## Description (subtask of 148-settimeout-leaks)

新規ファイル src/utils/managed-timers.ts を作成する。
  - class ManagedTimers を実装: setTimeout(fn, ms) と setInterval(fn, ms) のラッパーを提供し、返されたハンドルを内部 Set で保持する
  - clear(handle) で個別キャンセル、clearAll() で一括キャンセルとハンドル集合のクリアを行う
  - 各ラッパーの setTimeout 版は、コールバック実行後に自動でハンドル追跡を解除する (fire-and-forget のハンドルが Set に残り続けないようにする)
  - tests/utils/managed-timers.test.ts で下記を検証:
    1. setTimeout 追跡 → clearAll() で全て未実行
    2. setInterval 追跡 → clearAll() 後に tick しない
    3. setTimeout の自動発火後に size が 0 に戻る
    4. clear(handle) で単一キャンセル可能
  - GOD OBJECT には追加しない。純粋に独立ユーティリティとして完結させる
  - src/ の他ファイルは本サブタスクでは変更しない (導入は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

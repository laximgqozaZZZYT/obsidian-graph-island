## Description (subtask of 1391-settimeout-leaks)

src/views/ 配下の全 setTimeout 呼び出しを grep で列挙し、各呼び出しに対して
  - View destroy / onClose / disablePlugin 経路でクリアされているか
  - registerInterval / this.register(() => clearTimeout(id)) でライフサイクルに紐付いているか
  を確認する。
  クリアされていないものは以下のいずれかで対応:
  - timeoutId をフィールド保存し onClose() / unload() で clearTimeout
  - this.register(() => clearTimeout(id)) でPluginのライフサイクルに登録
  注意: God Object 規約により GraphViewContainer.ts は 8655 行を超えてはならない。
  クリア用の小ヘルパが必要なら src/utils/ に新規ファイル(例: src/utils/timeout-tracker.ts)で抽出すること。
  既存 onClose / unload メソッドへの追記は許可。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

## Description (subtask of 1294-settimeout-leaks)

目的: setTimeout を一元管理し destroy 時に clearAll で解放するための
  ユーティリティを新規作成する (現状 TimerRegistry はリポジトリに存在しない)。

  実装内容 (src/utils/timer-registry.ts):
  - export class TimerRegistry を新規作成
  - public set(handler: () => void, ms: number): number
    - window.setTimeout でラップして id を内部 Set に登録
    - ハンドラ実行直後に内部 Set から id を削除する wrapper を渡す
    - 戻り値は元の timer id
  - public clear(id: number): void
    - window.clearTimeout(id) し、内部 Set からも削除
  - public clearAll(): void
    - 内部 Set の全 id を window.clearTimeout し、Set をクリア
  - public size: number アクセサ (テスト用)

  テスト (tests/utils/timer-registry.test.ts) 最低 4 ケース:
  - set() で登録した timer が ms 経過後に発火する (vi.useFakeTimers)
  - 発火後は size が減っている (auto-cleanup)
  - clear(id) 後はその timer が発火しない
  - clearAll() 後は登録済み timer が一切発火せず size === 0

  制約:
  - GOD OBJECT ファイル (GraphViewContainer/PanelBuilder/EdgeRenderer/RenderPipeline) は変更しない
  - i18n/しきい値の追加は不要
  - console.* 不使用

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

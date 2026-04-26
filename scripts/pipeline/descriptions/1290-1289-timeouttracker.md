## Description (subtask of 1289-settimeout-leaks)

src/utils/timeout-tracker.ts を新規作成。
  - class TimeoutTracker { setTimeout(fn, ms): number; clearTimeout(id): void; clearAll(): void }
  - 内部で Set<number> に id を保持し、ハンドラ実行時に自分で id を Set から除去
  - destroy() / clearAll() 呼び出しで全 id を clearTimeout
  - 別関数 registerComponentTimeout(component: Component, fn, ms) を export し、
    Obsidian の Component.register(() => clearTimeout(id)) で自動 teardown を仕込む
  tests/utils/timeout-tracker.test.ts を新規作成し、以下を vitest fake timers で検証:
  - setTimeout 後 clearAll で発火しないこと
  - 個別 clearTimeout で対象だけ止まること
  - 発火完了した id は内部 Set から消えていること
  - registerComponentTimeout が Component 模倣の register コールバックを通じて clear されること
  GOD OBJECT には触れない。i18n/RenderThresholds は不要。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

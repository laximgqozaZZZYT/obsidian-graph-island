## Description (subtask of 1303-settimeout-leaks)

src/views/RenderPipeline.ts には setTimeout 12個に対して clearTimeout が 2個しかない。
  各 setTimeout の戻り値を `private _pendingTimeouts: Set<ReturnType<typeof setTimeout>>` のような
  メンバに保持し、コンポーネント破棄時 (destroy/cleanup メソッド) に全件 clearTimeout する仕組みを導入する。
  既存の clearTimeout 2箇所のロジックは温存。GOD OBJECT Policy によりファイルを肥大化させないよう、
  追跡ヘルパーを `private _trackTimeout(cb, ms)` の単一メソッドに集約して既存の setTimeout 呼び出しを置換する。
  完了条件: ファイル内 setTimeout 呼び出しのうち追跡されない箇所が 0 になる、ユニットテストが
  全て pass する (pnpm test)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

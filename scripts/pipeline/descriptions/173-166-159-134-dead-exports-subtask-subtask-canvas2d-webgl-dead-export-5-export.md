
## Description (subtask of 166-159-134-dead-exports-subtask-subtask)

- CanvasChild (CanvasContainer.ts): export 解除
  - IScale, IChild, IAnchor (interfaces.ts): export 解除
  - WebGLAppOptions (WebGLApp.ts): export 解除
  - BufferHandle (buffer-pool.ts): export 解除
  型が同ファイル内で使われている場合は export のみ外す。
  WebGL関連は opt-in 機能だが、現在 import されていないなら外す。
  pnpm build && pnpm test で確認。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

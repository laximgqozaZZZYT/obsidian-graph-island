## Description (subtask of 1486-settimeout-leaks)

src/views/GraphViewContainer.ts 内の `setTimeout(` 呼び出しを全列挙し、
  返り値ID が変数に保持されず onunload/destroy で clearTimeout されていない
  ものを特定する。修正方針:
    1. クラス内に `private _pendingTimeouts: Set<number> = new Set();` を追加
    2. 未クリアの setTimeout を helper でラップ:
       const id = window.setTimeout(() => { this._pendingTimeouts.delete(id); fn(); }, ms);
       this._pendingTimeouts.add(id);
    3. onunload/onClose 等の既存 cleanup フックで
       this._pendingTimeouts.forEach(id => window.clearTimeout(id));
       this._pendingTimeouts.clear();
       を実行
  GraphViewContainer.ts は Max Allowed 8655行。修正は最小行数で行い、
  hardcoded ms 値は触らない (RenderThresholds 移行は別タスク)。
  完了条件: GraphViewContainer.ts 内の setTimeout/clearTimeout 件数が均衡する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

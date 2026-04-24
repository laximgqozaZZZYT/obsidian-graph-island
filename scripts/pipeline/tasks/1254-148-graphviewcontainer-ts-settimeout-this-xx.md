---
priority: high
reported: 2026-04-25
status: in-progress
source: decomposed
parent: 148-settimeout-leaks
depends: none
summary: GraphViewContainer.ts の未クリア setTimeout を this._xxxTimeout に保存し onClose で clearTimeout
---

## Description (subtask of 148-settimeout-leaks)

src/views/GraphViewContainer.ts 内の全 setTimeout 呼び出しを精読して列挙し、
  現時点で clearTimeout 対象になっていないものについて以下を行う:
  - `const id = setTimeout(...)` を `this._<用途名>Timeout = setTimeout(...)` に変更
  - 既存の onClose() / destroy 系メソッド末尾で
    `if (this._<用途名>Timeout) { clearTimeout(this._<用途名>Timeout); this._<用途名>Timeout = null; }` を追加
  - 同名プロパティを class フィールドとして `private _<用途名>Timeout: number | null = null;` で宣言
  注意: 既に clearTimeout されている箇所は変更しないこと。行数増加は最小限 (+N行程度)に抑え、
  GraphViewContainer.ts の Max Allowed (8424) を超えないこと。必要ならメソッド抽出でオフセット。
  完了条件: ripgrep で数えた未クリア setTimeout 数 (= setTimeout 総数 − clearTimeout 総数) が
  プロジェクト全体で 10 個以下。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

# Task 776-756 — status 値抽出ロジック検証ログ

**Date**: 2026-04-18
**Parent**: `756-729-status-done-no-op`
**Regex**: `/^status:\s*(\S+)/m`
**Constraint**: コードファイル変更なし（検証ログのみ）

## 目的

frontmatter テキストから `status:` 値を抽出し、`STATUS_VALUE` 変数に格納する動作を確認する。

- 抽出成功時: `[status-check] extracted: <value>` を出力
- status 行欠落時: `[status-check] missing status field` を出力し abort フラグを立てる

## 実行コマンド

```bash
node -e "
  const fs = require('fs');
  function extractStatus(fm, label) {
    const m = fm.match(/^status:\s*(\S+)/m);
    if (m) { console.log(\`[\${label}] [status-check] extracted: \${m[1]}\`); return { STATUS_VALUE: m[1], abort: false }; }
    console.log(\`[\${label}] [status-check] missing status field\`); return { STATUS_VALUE: null, abort: true };
  }
  // 6 test cases ...
"
```

## 検証ログ

```
[case1:pending]     [status-check] extracted: pending
[case2:done]        [status-check] extracted: done
[case3:in-progress] [status-check] extracted: in-progress
[case4:decomposed]  [status-check] extracted: decomposed
[case5:missing]     [status-check] missing status field
[case6:extra-ws]    [status-check] extracted: pending
```

## 結果

| # | 入力 | 期待値 | 実際値 | abort | 判定 |
|---|------|--------|--------|-------|------|
| 1 | `status: pending`         | `pending`     | `pending`     | false | PASS |
| 2 | `status: done`            | `done`        | `done`        | false | PASS |
| 3 | `status: in-progress`     | `in-progress` | `in-progress` | false | PASS |
| 4 | `status: decomposed`      | `decomposed`  | `decomposed`  | false | PASS |
| 5 | (status 行なし)            | missing       | missing       | true  | PASS |
| 6 | `status:    pending` (連続空白) | `pending` | `pending`     | false | PASS |

## Acceptance 判定

- [x] 抽出成功: case1–4, case6 で `STATUS_VALUE` が期待値と一致
- [x] missing 検知: case5 で `missing status field` ログ出力 + abort フラグ
- [x] 空白バリアント耐性: `\s*` と `\S+` の組合せで複数空白を吸収（case6）
- [x] コードファイル未変更: `src/` 無変更

抽出ロジックは仕様どおり動作する。次段（777-756-subtask: STATUS_VALUE の 3 分岐判定）に引き渡し可能。

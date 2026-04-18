---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 619-600-subtask
depends: 618-600-graphviewcontainer-ts-lint-test
summary: 618 の実測行数で GraphViewContainer.ts GOD OBJECT 枠内確認の空コミットを作成
---

## Description (subtask of 619-600-subtask)

前提: 親タスク 618 が完了しており、その出力から GraphViewContainer.ts の実測行数 NNNN を取得済みであること。
  NNNN が不明な場合は `wc -l src/views/GraphViewContainer.ts` で取得し直す (出力の先頭整数を採用)。

  手順:
  1. `git status --porcelain` を実行し、出力が空であることを確認。何か出力があれば即座に停止し、ユーザーに報告 (ステージ済み/未ステージ変更を巻き込まない)。
  2. `git rev-parse --abbrev-ref HEAD` でブランチ名を確認 (main への直接コミットは禁止 — feature/chore ブランチであること)。
  3. 618 から受領した実測行数 NNNN を以下のコマンドの `NNNN` に必ず実数値で置換してから実行:
     ```
     git commit --allow-empty -m "chore: verify GraphViewContainer.ts within GOD OBJECT limit (NNNN/8597 lines)"
     ```
     ※ `NNNN` 未置換のまま実行しない。置換後の値が 8597 を超えていた場合は GOD OBJECT 違反なのでコミットせずエスカレーション。
  4. `git log -1 --format=%s` で直近コミットメッセージを表示し、NNNN と 8597 が両方含まれることを目視確認。
  5. `git status --porcelain` を再実行し、出力が空 (クリーン) であることを確認。

  受け入れ条件:
  - 空コミットが HEAD に1つ追加されている (`git log -1 --stat` で差分0行)
  - コミットメッセージに実測行数 NNNN と上限 8597 が両方含まれる
  - コミット後のワーキングツリーがクリーン (`git status --porcelain` 出力なし)
  - CLAUDE.md の GOD OBJECT ポリシー (Max Allowed 8597 を超えない) に違反していない

  禁止事項:
  - 実測値が 8597 を超えていたらコミットせず停止 (ラチェット逆行を記録してはならない)
  - `git add` / `git commit` (非 `--allow-empty`) の使用禁止 — このタスクは空コミット専用
  - commit hook を `--no-verify` でスキップしない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

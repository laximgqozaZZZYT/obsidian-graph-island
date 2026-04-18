---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 924-900-639-626-subtask-issue-frontmatter-status
depends: none
summary: 639-626 subtask issue の frontmatter status を done に更新してコミット
---

## Description (subtask of 924-900-639-626-subtask-issue-frontmatter-status)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを特定する
  2. 0件の場合は Glob `issues/done/*639-626*subtask*.md` を確認。ヒットすれば既に完了として no-op で成功終了。両方0件ならエラー終了
  3. 複数候補がある場合は frontmatter の summary が「status を done」系の記述を含むものを優先採用
  4. Read で対象ファイルの frontmatter を確認し、既に `status: done` なら no-op 終了
  5. Edit で `status: in-progress` を `status: done` に置換(1行のみ、他フィールド・本文は不変)
  6. frontmatter のみの変更なので lint/test/build は実行しない
  7. `git add <path> && git commit -m "chore: done <basename>"` でコミット
  8. ファイル移動は行わない (pending/ 配下に残す)

  受け入れ条件:
  - status フィールドのみが変更されている (git diff で1行変更を確認)
  - コミットが作成されている
  - CLAUDE.md のルールに違反しない (God Object未変更、ハードコード未追加)

★ Insight ─────────────────────────────────────
- このissueは本質的にアトミックな操作(frontmatter 1行変更+commit)のため、複数のsubtaskに分解する合理性がない。無理に分割すると「Edit」と「commit」を別セッションにしてしまい、かえってオーバーヘッドが増える
- Glob → Read → Edit → Bash(commit) の4ツール呼び出しで完結するため、max-turns 30 のパイプラインには十分余裕がある
- parent issue名が `900-893-639-626-subtask-issue-frontmatter-status` という連鎖 (900 → 893 → 639 → 626) で、subtask分解の履歴がID chainに埋め込まれている設計になっている
─────────────────────────────────────────────────

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと

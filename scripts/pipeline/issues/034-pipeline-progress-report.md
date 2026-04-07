---
priority: medium
reported: 2026-04-07
status: decomposed
summary: 自律パイプラインに進捗レポート生成機能を追加
---

## Description

現状、ユーザーが「進捗報告」を求めると、人間 (or 親エージェント) が手動で `git log` / `pgrep` / セッションJSON / issueキューを集計して報告している。これは自律パイプラインの趣旨に反する。

パイプライン自身が定期的に進捗サマリを生成し、ユーザーが集計コマンドを叩かずに状況を把握できる状態にしたい。

## Background

- 既存リソース:
  - `/tmp/graph-island-improve-results/*.json` — セッション毎のサマリ (session, focus, commits, timestamp)
  - `/tmp/graph-island-improve.log` — 全セッションの統合ログ
  - `git log --oneline` — auto-improve コミット履歴
  - `scripts/pipeline/issues/` および `done/` — issue キュー状態
  - `vitest.config.ts` のカバレッジしきい値 — ratchet推移
- 既存スクリプト: `scripts/pipeline/autonomous-improve.sh`, `scripts/pipeline/enforce-gates.sh`, `scripts/pipeline/visual-report.ts`

## Acceptance criteria

- [ ] `scripts/pipeline/progress-report.sh` を新規作成
- [ ] 以下の項目を集計して Markdown 形式で出力:
  - [ ] 直近 N 時間 (デフォルト 6h、引数で変更可) のコミット数と内訳 (focus別)
  - [ ] アクティブセッション数 (`pgrep` 経由)
  - [ ] 完了セッション一覧 (focus, commits, timestamp)
  - [ ] Issue キュー状態 (pending/in-progress/done 件数 + 直近完了したissue)
  - [ ] カバレッジしきい値の推移 (`git log -p vitest.config.ts` から ratchet コミットを抽出)
  - [ ] God object サイズ推移 (CLAUDE.md の Max Allowed と現状の差分)
- [ ] 出力先は `/tmp/graph-island-progress.md` (ユーザーが `cat` で読める)
- [ ] cron に登録 (e.g. 毎時 `0 * * * *`) して自動更新
- [ ] `autonomous-improve.sh` の各セッション完了時にも呼び出し、最新状態を保つ
- [ ] 既存の `MEMORY.md` にある `MAX_SESSIONS=3` の記述ズレ (実際は 2) も合わせて確認・修正
- [ ] テスト: 手動実行 `bash scripts/pipeline/progress-report.sh` で正しい Markdown が生成されること

## Non-goals

- リアルタイムダッシュボード化 (Markdown ファイルで十分)
- Slack/メール通知 (ローカル運用なので不要)
- グラフ・チャート生成 (テキストテーブルで十分)

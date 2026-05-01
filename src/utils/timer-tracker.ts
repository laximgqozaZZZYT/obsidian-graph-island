// ---------------------------------------------------------------------------
// createTimerTracker — fire-and-forget `setTimeout` の漏れ追跡ユーティリティ。
//
// 内部 `Set<number>` に id を保持し、コールバック完了時に自動的に Set から削除する
// (単発タイマーが永続的にエントリを残さないようにするため)。`clearAll()` で
// pending な id を全て `window.clearTimeout` する。
//
// `ManagedTimers` (class、`setInterval` / `clear(handle)` 対応) と並立する形で、
// setTimeout 専用の最小 API を関数スタイルで保持したい新規 call-site 向けに提供する。
// ---------------------------------------------------------------------------

export interface TimerTracker {
	setTimeout(fn: () => void, ms: number): number;
	clearAll(): void;
	size(): number;
}

export function createTimerTracker(): TimerTracker {
	const ids = new Set<number>();
	return {
		setTimeout(fn, ms) {
			let id = 0;
			id = window.setTimeout(() => {
				try {
					fn();
				} finally {
					ids.delete(id);
				}
			}, ms) as unknown as number;
			ids.add(id);
			return id;
		},
		clearAll() {
			for (const id of ids) {
				window.clearTimeout(id);
			}
			ids.clear();
		},
		size() {
			return ids.size;
		},
	};
}

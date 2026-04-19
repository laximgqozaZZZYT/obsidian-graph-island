/**
 * animation-controller
 *
 * Lightweight rAF orchestration utilities carved out of GraphViewContainer so
 * that the GOD OBJECT does not grow. Primary goal: rAF chains must be
 * cancellable — after .cancel() the `step` callback is guaranteed not to run
 * and no further frames are scheduled.
 *
 * rAF/cAF are parameterised via {@link RAFApi} so unit tests can drive frames
 * synchronously without global stubs.
 */

export interface RAFHandle {
	cancel: () => void;
}

export interface RAFApi {
	request: (cb: (t: number) => void) => number;
	cancel: (id: number) => void;
}

const defaultRAFApi: RAFApi = {
	request: (cb) => requestAnimationFrame(cb),
	cancel: (id) => cancelAnimationFrame(id),
};

/**
 * Drive a cancellable rAF loop.
 *
 * @param step Called every frame with the current timestamp. Return `true` to
 *             continue, `false` to stop. After the handle is cancelled `step`
 *             will NOT be invoked again, even if a frame was already queued.
 * @param api  rAF/cAF implementation — override for tests.
 */
export function startCancellableRAF(
	step: (t: number) => boolean,
	api: RAFApi = defaultRAFApi,
): RAFHandle {
	let rafId: number | null = null;
	let cancelled = false;

	const tick = (t: number): void => {
		if (cancelled) return;
		const cont = step(t);
		if (!cont || cancelled) {
			rafId = null;
			return;
		}
		rafId = api.request(tick);
	};

	rafId = api.request(tick);

	return {
		cancel(): void {
			if (cancelled) return;
			cancelled = true;
			if (rafId !== null) {
				api.cancel(rafId);
				rafId = null;
			}
		},
	};
}

/**
 * Cancel every handle in `handles` then empty the set. Safe on empty sets.
 */
export function cancelAllHandles(handles: Set<RAFHandle>): void {
	for (const h of handles) h.cancel();
	handles.clear();
}

/**
 * Structural subset of PixiNode that fadeNodeAlphaCancellable touches. Using
 * a narrow interface keeps tests from needing to fabricate a full PixiNode.
 */
export interface FadeableNode {
	gfx: { alpha: number };
}

const ALPHA_EPSILON = 0.001;

/**
 * Fade a node's alpha toward `targetAlpha` over `durationMs`, cancelling any
 * prior fade registered for the same `nodeKey` in `activeMap`. On completion
 * the handle is removed from `activeMap`.
 *
 * @param onTick Optional hook invoked after each alpha write (e.g. markDirty).
 */
export function fadeNodeAlphaCancellable(
	node: FadeableNode,
	targetAlpha: number,
	durationMs: number,
	activeMap: Map<string, RAFHandle>,
	nodeKey: string,
	api: RAFApi = defaultRAFApi,
	onTick?: () => void,
): RAFHandle {
	const existing = activeMap.get(nodeKey);
	if (existing) existing.cancel();

	const startAlpha = node.gfx.alpha;
	if (Math.abs(startAlpha - targetAlpha) < ALPHA_EPSILON || durationMs <= 0) {
		node.gfx.alpha = targetAlpha;
		activeMap.delete(nodeKey);
		return { cancel: () => {} };
	}

	let startTime: number | null = null;
	let handle: RAFHandle | null = null;

	const step = (now: number): boolean => {
		if (startTime === null) startTime = now;
		const t = Math.min(1, (now - startTime) / durationMs);
		node.gfx.alpha = startAlpha + (targetAlpha - startAlpha) * t;
		onTick?.();
		if (t >= 1) {
			if (activeMap.get(nodeKey) === handle) activeMap.delete(nodeKey);
			return false;
		}
		return true;
	};

	handle = startCancellableRAF(step, api);
	activeMap.set(nodeKey, handle);
	return handle;
}

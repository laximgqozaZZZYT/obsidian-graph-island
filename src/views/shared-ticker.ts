/**
 * Shared Ticker implementation used by both CanvasApp and WebGLApp.
 *
 * Drives the render loop via requestAnimationFrame, invoking registered
 * callbacks each frame and stopping automatically when all are removed.
 */

import type { ITicker } from "./canvas2d/interfaces";

type TickerCallback = () => void;

export class Ticker implements ITicker {
	private callbacks: { fn: TickerCallback; context: unknown }[] = [];
	private _rafId: number | null = null;
	private _running = false;

	add(fn: TickerCallback, context?: unknown) {
		if (this.callbacks.some((cb) => cb.fn === fn && cb.context === context)) return;
		this.callbacks.push({ fn, context });
		if (!this._running) this._start();
	}

	remove(fn: TickerCallback, context?: unknown) {
		this.callbacks = this.callbacks.filter((cb) => !(cb.fn === fn && cb.context === context));
		if (this.callbacks.length === 0) this._stop();
	}

	private _tick = () => {
		for (const cb of this.callbacks) {
			cb.fn.call(cb.context);
		}
		if (this._running) {
			this._rafId = requestAnimationFrame(this._tick);
		}
	};

	private _start() {
		if (this._running) return;
		this._running = true;
		this._rafId = requestAnimationFrame(this._tick);
	}

	private _stop() {
		this._running = false;
		if (this._rafId !== null) {
			cancelAnimationFrame(this._rafId);
			this._rafId = null;
		}
	}

	destroy() {
		this._stop();
		this.callbacks.length = 0;
	}
}

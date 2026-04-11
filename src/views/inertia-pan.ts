export const FRICTION = 0.92;
export const MIN_VELOCITY = 0.5;

const HISTORY_WINDOW_MS = 100;

interface Sample {
	x: number;
	y: number;
	t: number;
}

export class InertiaPan {
	private samples: Sample[] = [];
	private vx = 0;
	private vy = 0;
	private active = false;
	private isEnabled: () => boolean;

	constructor(
		isEnabled: boolean | (() => boolean),
		private applyDelta: (dx: number, dy: number) => void,
	) {
		this.isEnabled =
			typeof isEnabled === "function" ? isEnabled : () => isEnabled;
	}

	trackPointer(screenX: number, screenY: number, timestamp: number): void {
		const cutoff = timestamp - HISTORY_WINDOW_MS;
		this.samples = this.samples.filter((s) => s.t >= cutoff);
		this.samples.push({ x: screenX, y: screenY, t: timestamp });
	}

	release(): { vx: number; vy: number } {
		if (!this.isEnabled() || this.samples.length < 2) {
			this.samples = [];
			return { vx: 0, vy: 0 };
		}
		const first = this.samples[0];
		const last = this.samples[this.samples.length - 1];
		const dt = last.t - first.t;
		if (dt <= 0) {
			this.samples = [];
			return { vx: 0, vy: 0 };
		}
		const msPerFrame = 1000 / 60;
		this.vx = ((last.x - first.x) / dt) * msPerFrame;
		this.vy = ((last.y - first.y) / dt) * msPerFrame;
		this.samples = [];
		this.active = true;
		return { vx: this.vx, vy: this.vy };
	}

	tick(): boolean {
		if (!this.active) return false;
		this.vx *= FRICTION;
		this.vy *= FRICTION;
		if (Math.abs(this.vx) < MIN_VELOCITY && Math.abs(this.vy) < MIN_VELOCITY) {
			this.active = false;
			this.vx = 0;
			this.vy = 0;
			return false;
		}
		this.applyDelta(this.vx, this.vy);
		return true;
	}

	cancel(): void {
		this.active = false;
		this.vx = 0;
		this.vy = 0;
		this.samples = [];
	}

	isActive(): boolean {
		return this.active;
	}
}

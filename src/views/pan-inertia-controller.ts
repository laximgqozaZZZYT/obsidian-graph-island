export class PanInertiaController {
	private rafId: number | null = null;
	private velocity: { x: number; y: number } = { x: 0, y: 0 };

	start(
		vx: number,
		vy: number,
		onStep: (dx: number, dy: number) => void,
		friction = 0.92,
		minSpeed = 0.1,
	): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.velocity = { x: vx, y: vy };
		const loop = (): void => {
			this.velocity.x *= friction;
			this.velocity.y *= friction;
			if (
				Math.abs(this.velocity.x) < minSpeed &&
				Math.abs(this.velocity.y) < minSpeed
			) {
				this.velocity = { x: 0, y: 0 };
				this.rafId = null;
				return;
			}
			onStep(this.velocity.x, this.velocity.y);
			this.rafId = requestAnimationFrame(loop);
		};
		this.rafId = requestAnimationFrame(loop);
	}

	cancel(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.velocity = { x: 0, y: 0 };
	}

	isActive(): boolean {
		return this.rafId !== null;
	}
}

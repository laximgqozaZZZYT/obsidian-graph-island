/**
 * Smoothly transitions node positions from current to target over a duration.
 * Used when switching between static layouts (concentric, arc, tree).
 */

export interface TransitionNode {
  /** The node data with mutable x, y */
  data: { x: number; y: number };
  /** Animation start position */
  fromX: number;
  fromY: number;
  /** Animation target position */
  toX: number;
  toY: number;
}

const TRANSITION_DURATION_MS = 600;
const TRANSITION_DURATION_LARGE_MS = 300;
const LARGE_GRAPH_THRESHOLD = 1000;

export class LayoutTransition {
  private nodes: TransitionNode[] = [];
  private startTime = 0;
  private duration = TRANSITION_DURATION_MS;
  private running = false;
  private onComplete: (() => void) | null = null;

  /**
   * Begin a transition. Uses supplied from/to positions.
   * @param nodeData - Array of objects with { data, fromX, fromY, toX, toY }
   * @param onComplete - Called when transition finishes
   */
  start(
    nodeData: { data: { x: number; y: number }; fromX: number; fromY: number; toX: number; toY: number }[],
    onComplete?: () => void,
  ) {
    this.nodes = nodeData.map(n => ({
      data: n.data,
      fromX: n.fromX,
      fromY: n.fromY,
      toX: n.toX,
      toY: n.toY,
    }));
    // Use shorter duration for large graphs
    this.duration = nodeData.length > LARGE_GRAPH_THRESHOLD
      ? TRANSITION_DURATION_LARGE_MS
      : TRANSITION_DURATION_MS;
    this.startTime = performance.now();
    this.running = true;
    this.onComplete = onComplete ?? null;

    // prefers-reduced-motion: skip animation, jump to final positions
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const n of this.nodes) {
        n.data.x = n.toX;
        n.data.y = n.toY;
      }
      this.running = false;
      this.onComplete?.();
      return;
    }

    // Set initial positions to from
    for (const n of this.nodes) {
      n.data.x = n.fromX;
      n.data.y = n.fromY;
    }
  }

  /** Returns true if the transition is currently active */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Advance the transition. Call this on each render frame.
   * Returns true if still animating, false if done.
   */
  tick(): boolean {
    if (!this.running) return false;

    const elapsed = performance.now() - this.startTime;
    let t = Math.min(elapsed / this.duration, 1);
    // Ease-in-out cubic
    t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    for (const n of this.nodes) {
      n.data.x = n.fromX + (n.toX - n.fromX) * t;
      n.data.y = n.fromY + (n.toY - n.fromY) * t;
    }

    if (elapsed >= this.duration) {
      // Snap to final positions
      for (const n of this.nodes) {
        n.data.x = n.toX;
        n.data.y = n.toY;
      }
      this.running = false;
      this.onComplete?.();
      return false;
    }
    return true;
  }

  /** Cancel the transition, leaving nodes at current interpolated positions */
  cancel() {
    this.running = false;
    this.nodes = [];
    this.onComplete = null;
  }
}

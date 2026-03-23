import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LayoutTransition,
  easeInOutCubic,
  LAYOUT_TRANSITION_DURATION_MS,
  LAYOUT_LARGE_GRAPH_THRESHOLD,
} from "../src/views/LayoutTransition";

// ---------------------------------------------------------------------------
// easeInOutCubic — pure easing function
// ---------------------------------------------------------------------------
describe("easeInOutCubic", () => {
  it("returns 0 at t=0", () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("returns 0.5 at t=0.5 (symmetry point)", () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it("is monotonically increasing", () => {
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const val = easeInOutCubic(i / 100);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });

  it("is symmetric: f(t) + f(1-t) = 1", () => {
    for (const t of [0.1, 0.2, 0.3, 0.4]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1);
    }
  });

  it("ease-in: f(0.1) < 0.1", () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
  });

  it("ease-out: f(0.9) > 0.9", () => {
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

// ---------------------------------------------------------------------------
// LayoutTransition — animation lifecycle
// ---------------------------------------------------------------------------
describe("LayoutTransition", () => {
  let transition: LayoutTransition;
  let perfNowMock: ReturnType<typeof vi.spyOn>;
  let currentTime: number;
  beforeEach(() => {
    // Mock window.matchMedia (not available in Node/vitest env)
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    transition = new LayoutTransition();
    currentTime = 0;
    perfNowMock = vi.spyOn(performance, "now").mockImplementation(() => currentTime);
  });

  afterEach(() => {
    perfNowMock.mockRestore();
    vi.unstubAllGlobals();
  });

  it("should not be running initially", () => {
    expect(transition.isRunning()).toBe(false);
  });

  it("tick returns false when not running", () => {
    expect(transition.tick()).toBe(false);
  });

  it("should set initial positions to from values on start", () => {
    const data = { x: 100, y: 200 };
    currentTime = 0;
    transition.start([
      { data, fromX: 0, fromY: 0, toX: 100, toY: 200 },
    ]);
    expect(transition.isRunning()).toBe(true);
    expect(data.x).toBe(0);
    expect(data.y).toBe(0);
  });

  it("should interpolate positions during animation", () => {
    const data = { x: 0, y: 0 };
    currentTime = 0;
    transition.start([
      { data, fromX: 0, fromY: 0, toX: 100, toY: 200 },
    ]);

    // Advance to 50% of 600ms
    currentTime = 300;
    const stillRunning = transition.tick();
    expect(stillRunning).toBe(true);
    // At t=0.5, cubic ease-in-out: 4*0.5^3 = 0.5
    expect(data.x).toBe(50);
    expect(data.y).toBe(100);
  });

  it("should snap to final positions when complete", () => {
    const data = { x: 0, y: 0 };
    currentTime = 0;
    transition.start([
      { data, fromX: 0, fromY: 0, toX: 100, toY: 200 },
    ]);

    // Advance past duration
    currentTime = 700;
    const stillRunning = transition.tick();
    expect(stillRunning).toBe(false);
    expect(data.x).toBe(100);
    expect(data.y).toBe(200);
    expect(transition.isRunning()).toBe(false);
  });

  it("should call onComplete callback when finished", () => {
    const data = { x: 0, y: 0 };
    const onComplete = vi.fn();
    currentTime = 0;
    transition.start(
      [{ data, fromX: 0, fromY: 0, toX: 100, toY: 200 }],
      onComplete,
    );

    currentTime = 700;
    transition.tick();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("should handle cancel correctly", () => {
    const data = { x: 0, y: 0 };
    currentTime = 0;
    transition.start([
      { data, fromX: 0, fromY: 0, toX: 100, toY: 200 },
    ]);

    currentTime = 300;
    transition.tick();
    const midX = data.x;
    const midY = data.y;

    transition.cancel();
    expect(transition.isRunning()).toBe(false);

    // Positions stay at mid-animation values
    expect(data.x).toBe(midX);
    expect(data.y).toBe(midY);

    // tick should return false after cancel
    expect(transition.tick()).toBe(false);
  });

  it("should handle multiple nodes", () => {
    const data1 = { x: 0, y: 0 };
    const data2 = { x: 50, y: 50 };
    currentTime = 0;
    transition.start([
      { data: data1, fromX: 0, fromY: 0, toX: 100, toY: 200 },
      { data: data2, fromX: 50, fromY: 50, toX: 150, toY: 250 },
    ]);

    currentTime = 700;
    transition.tick();

    expect(data1.x).toBe(100);
    expect(data1.y).toBe(200);
    expect(data2.x).toBe(150);
    expect(data2.y).toBe(250);
  });

  it("should use shorter duration for large graphs (> 1000 nodes)", () => {
    const nodes = Array.from({ length: 1001 }, (_, i) => ({
      data: { x: 0, y: 0 },
      fromX: 0, fromY: 0,
      toX: i, toY: i,
    }));
    currentTime = 0;
    transition.start(nodes);

    // At 300ms (short duration), the animation should be complete
    currentTime = 300;
    const stillRunning = transition.tick();
    expect(stillRunning).toBe(false);
    expect(transition.isRunning()).toBe(false);
  });

  it("should use easing function (not linear)", () => {
    const data = { x: 0, y: 0 };
    currentTime = 0;
    transition.start([
      { data, fromX: 0, fromY: 0, toX: 100, toY: 0 },
    ]);

    // At 25% time, cubic ease-in-out should give less than 25% progress
    currentTime = 150; // 25% of 600ms
    transition.tick();
    expect(data.x).toBeLessThan(25);

    // At 75% time, cubic ease-in-out should give more than 75% progress
    currentTime = 450; // 75% of 600ms
    transition.tick();
    expect(data.x).toBeGreaterThan(75);
  });

  it("should skip animation with prefers-reduced-motion", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
    });
    const lt = new LayoutTransition();
    const data = { x: 0, y: 0 };
    const onComplete = vi.fn();
    lt.start([{ data, fromX: 0, fromY: 0, toX: 100, toY: 200 }], onComplete);

    // Should immediately be at final positions
    expect(data.x).toBe(100);
    expect(data.y).toBe(200);
    expect(lt.isRunning()).toBe(false);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("re-start replaces previous transition", () => {
    const data1 = { x: 0, y: 0 };
    currentTime = 0;
    transition.start([{ data: data1, fromX: 0, fromY: 0, toX: 100, toY: 100 }]);

    const data2 = { x: 50, y: 50 };
    transition.start([{ data: data2, fromX: 50, fromY: 50, toX: 200, toY: 200 }]);

    currentTime = 700;
    transition.tick();
    expect(data2.x).toBe(200);
    expect(data2.y).toBe(200);
  });

  it("cancel does not trigger onComplete", () => {
    const onComplete = vi.fn();
    currentTime = 0;
    transition.start(
      [{ data: { x: 0, y: 0 }, fromX: 0, fromY: 0, toX: 100, toY: 100 }],
      onComplete,
    );
    transition.cancel();

    currentTime = 700;
    transition.tick();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("multiple ticks produce smooth monotonic progression", () => {
    const data = { x: 0, y: 0 };
    currentTime = 0;
    transition.start([{ data, fromX: 0, fromY: 0, toX: 100, toY: 0 }]);

    const xs: number[] = [];
    for (let i = 0; i <= 10; i++) {
      currentTime = (LAYOUT_TRANSITION_DURATION_MS * i) / 10;
      transition.tick();
      xs.push(data.x);
    }

    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 0.001);
    }
    expect(xs[0]).toBeCloseTo(0);
    expect(xs[xs.length - 1]).toBeCloseTo(100);
  });
});

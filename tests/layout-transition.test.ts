import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LayoutTransition } from "../src/views/LayoutTransition";

describe("LayoutTransition", () => {
  let transition: LayoutTransition;
  let perfNowMock: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    transition = new LayoutTransition();
    currentTime = 0;
    perfNowMock = vi.spyOn(performance, "now").mockImplementation(() => currentTime);
  });

  afterEach(() => {
    perfNowMock.mockRestore();
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
});

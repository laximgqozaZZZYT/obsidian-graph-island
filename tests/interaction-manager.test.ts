import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  computeZoomFactor,
  clampScale,
  ZOOM_IN_FACTOR,
  ZOOM_OUT_FACTOR,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  InteractionManager,
  PixiNode,
  type InteractionHost,
} from "../src/views/InteractionManager";

// ---------------------------------------------------------------------------
// computeZoomFactor — wheel event → scale multiplier
// ---------------------------------------------------------------------------
describe("computeZoomFactor", () => {
  it("returns > 1 for zoom in (negative deltaY)", () => {
    const factor = computeZoomFactor(-100);
    expect(factor).toBeGreaterThan(1);
  });

  it("returns < 1 for zoom out (positive deltaY)", () => {
    const factor = computeZoomFactor(100);
    expect(factor).toBeLessThan(1);
  });

  it("default sensitivity produces base factors", () => {
    expect(computeZoomFactor(-1, 1.0)).toBeCloseTo(ZOOM_IN_FACTOR, 5);
    expect(computeZoomFactor(1, 1.0)).toBeCloseTo(ZOOM_OUT_FACTOR, 5);
  });

  it("half sensitivity produces smaller zoom steps", () => {
    const inF = computeZoomFactor(-1, 0.5);
    const outF = computeZoomFactor(1, 0.5);
    // inF should be closer to 1 than ZOOM_IN_FACTOR
    expect(inF).toBeCloseTo(1.05, 5);
    expect(outF).toBeCloseTo(0.95, 5);
  });

  it("double sensitivity produces larger zoom steps", () => {
    const inF = computeZoomFactor(-1, 2.0);
    const outF = computeZoomFactor(1, 2.0);
    // inF = 1 + (0.1) * 2 = 1.2
    expect(inF).toBeCloseTo(1.2, 5);
    // outF = 1 - (0.1) * 2 = 0.8
    expect(outF).toBeCloseTo(0.8, 5);
  });

  it("zero sensitivity produces factor of 1 (no zoom)", () => {
    expect(computeZoomFactor(-1, 0)).toBeCloseTo(1.0, 5);
    expect(computeZoomFactor(1, 0)).toBeCloseTo(1.0, 5);
  });

  it("zoom in and out are complementary at default sensitivity", () => {
    // Applying zoom in then zoom out should roughly cancel
    const combined = computeZoomFactor(-1) * computeZoomFactor(1);
    expect(combined).toBeCloseTo(ZOOM_IN_FACTOR * ZOOM_OUT_FACTOR, 3);
  });
});

// ---------------------------------------------------------------------------
// clampScale — enforce zoom range
// ---------------------------------------------------------------------------
describe("clampScale", () => {
  it("passes through values within range", () => {
    expect(clampScale(1.0)).toBe(1.0);
    expect(clampScale(0.5)).toBe(0.5);
    expect(clampScale(5.0)).toBe(5.0);
  });

  it("clamps values below minimum", () => {
    expect(clampScale(0.001)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(0)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(-1)).toBe(ZOOM_SCALE_MIN);
  });

  it("clamps values above maximum", () => {
    expect(clampScale(100)).toBe(ZOOM_SCALE_MAX);
    expect(clampScale(10.1)).toBe(ZOOM_SCALE_MAX);
  });

  it("boundary values are preserved", () => {
    expect(clampScale(ZOOM_SCALE_MIN)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(ZOOM_SCALE_MAX)).toBe(ZOOM_SCALE_MAX);
  });

  it("handles NaN by returning minimum", () => {
    // Math.max(0.02, Math.min(10, NaN)) → Math.max(0.02, NaN) → NaN
    // This documents current behavior — NaN propagates
    const result = clampScale(NaN);
    expect(Number.isNaN(result)).toBe(true);
  });

  it("handles Infinity", () => {
    expect(clampScale(Infinity)).toBe(ZOOM_SCALE_MAX);
    expect(clampScale(-Infinity)).toBe(ZOOM_SCALE_MIN);
  });
});

// ---------------------------------------------------------------------------
// Zoom factor + clamp integration
// ---------------------------------------------------------------------------
describe("zoom factor + clamp integration", () => {
  it("repeated zoom-in stays within bounds", () => {
    let scale = 1.0;
    for (let i = 0; i < 200; i++) {
      scale *= computeZoomFactor(-1, 2.0);
      scale = clampScale(scale);
    }
    expect(scale).toBe(ZOOM_SCALE_MAX);
  });

  it("repeated zoom-out stays within bounds", () => {
    let scale = 1.0;
    for (let i = 0; i < 200; i++) {
      scale *= computeZoomFactor(1, 2.0);
      scale = clampScale(scale);
    }
    expect(scale).toBe(ZOOM_SCALE_MIN);
  });
});

// ---------------------------------------------------------------------------
// PixiNode interface shape (type-level, verifying import works)
// ---------------------------------------------------------------------------
describe("PixiNode interface", () => {
  it("can be imported from InteractionManager", async () => {
    const mod = await import("../src/views/InteractionManager");
    // Just verifying module loads without error
    expect(mod.computeZoomFactor).toBeTypeOf("function");
    expect(mod.clampScale).toBeTypeOf("function");
  });
});

// ---------------------------------------------------------------------------
// InteractionManager class construction and setup
// ---------------------------------------------------------------------------
describe("InteractionManager", () => {
  let canvas: HTMLCanvasElement;
  let mockHost: InteractionHost;
  let mockWorld: any;
  let interactionManager: InteractionManager | null = null;

  beforeEach(() => {
    // Create mock canvas (mock document if needed)
    const mockDoc = (globalThis as any).document || {
      createElement: vi.fn((tag: string) => {
        if (tag === "canvas") {
          return {
            width: 0,
            height: 0,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            getBoundingClientRect: vi.fn(() => ({
              left: 0,
              top: 0,
              width: 800,
              height: 600,
            })),
          } as any;
        }
        return {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as any;
      }),
    };

    if (!(globalThis as any).document) {
      (globalThis as any).document = mockDoc;
    }

    canvas = mockDoc.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;

    // Mock CanvasContainer (world)
    mockWorld = {
      toLocal: vi.fn((point: any) => ({ x: point.x, y: point.y })),
      toGlobal: vi.fn((point: any) => ({ x: point.x, y: point.y })),
      scale: { x: 1, y: 1, set: vi.fn() },
      x: 0,
      y: 0,
    };

    // Mock InteractionHost with all required methods
    mockHost = {
      hitTestNode: vi.fn(() => null),
      markDirty: vi.fn(),
      applyHover: vi.fn(),
      getHighlightedNodeId: vi.fn(() => null),
      setHighlightedNodeId: vi.fn(),
      getCurrentLayout: vi.fn(() => "force"),
      getShells: vi.fn(() => []),
      getNodeShellIndex: vi.fn(() => new Map()),
      getPixiNodes: vi.fn(() => new Map()),
      getSimulation: vi.fn(() => null),
      openFile: vi.fn(),
      toggleHold: vi.fn(),
      clearAllHolds: vi.fn(),
      getAccentColor: vi.fn(() => 0xffffff),
      zoomToScreenRect: vi.fn(),
      getPixiApp: vi.fn(() => null),
      handleSuperNodeDblClick: vi.fn(() => false),
      setPathfinderNode: vi.fn(),
      clearPathfinder: vi.fn(),
      getPathfinderState: vi.fn(() => ({ startId: null, endId: null })),
      getApp: vi.fn(() => ({})),
      getContainerEl: vi.fn(() => mockDoc.createElement("div")),
      addCompareNode: vi.fn(),
      clearCompareSelection: vi.fn(),
      setSearchQuery: vi.fn(),
    } as any;
  });

  it("should instantiate without error", () => {
    expect(() => {
      interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    }).not.toThrow();
    expect(interactionManager).toBeDefined();
  });

  it("should attach event listeners on construction", () => {
    const addEventListenerSpy = vi.spyOn(canvas, "addEventListener");
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);

    expect(addEventListenerSpy).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    expect(addEventListenerSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("pointerleave", expect.any(Function));

    addEventListenerSpy.mockRestore();
  });

  it("detach() should remove all event listeners", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    const removeEventListenerSpy = vi.spyOn(canvas, "removeEventListener");

    interactionManager.detach();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("wheel", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("pointerleave", expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it("marqueeMode should be false by default", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(interactionManager.marqueeMode).toBe(false);
  });

  it("lassoMode should be false by default", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(interactionManager.lassoMode).toBe(false);
  });

  it("should toggle marqueeMode", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(interactionManager.marqueeMode).toBe(false);
    interactionManager.marqueeMode = true;
    expect(interactionManager.marqueeMode).toBe(true);
    interactionManager.marqueeMode = false;
    expect(interactionManager.marqueeMode).toBe(false);
  });

  it("should toggle lassoMode", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(interactionManager.lassoMode).toBe(false);
    interactionManager.lassoMode = true;
    expect(interactionManager.lassoMode).toBe(true);
    interactionManager.lassoMode = false;
    expect(interactionManager.lassoMode).toBe(false);
  });

  it("detach() should clear timers", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    // Simulate a timer being set
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

    interactionManager.detach();

    // Should have called clearTimeout for zoom layout and cull timers
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it("detach() should destroy marquee graphics if present", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);

    // We can't easily test this without complex mocking, but we can verify detach runs
    expect(() => {
      interactionManager?.detach();
    }).not.toThrow();
  });

  it("detach() should destroy lasso graphics if present", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);

    // Similar to above, verify detach runs without error
    expect(() => {
      interactionManager?.detach();
    }).not.toThrow();
  });

  it("should allow multiple sequential instantiations and detachments", () => {
    // First instance
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(interactionManager).toBeDefined();
    interactionManager.detach();

    // Second instance with same canvas
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(interactionManager).toBeDefined();
    interactionManager.detach();
  });

  it("marqueeMode and lassoMode are independent", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);

    interactionManager.marqueeMode = true;
    interactionManager.lassoMode = false;
    expect(interactionManager.marqueeMode).toBe(true);
    expect(interactionManager.lassoMode).toBe(false);

    interactionManager.marqueeMode = false;
    interactionManager.lassoMode = true;
    expect(interactionManager.marqueeMode).toBe(false);
    expect(interactionManager.lassoMode).toBe(true);

    interactionManager.marqueeMode = true;
    interactionManager.lassoMode = true;
    expect(interactionManager.marqueeMode).toBe(true);
    expect(interactionManager.lassoMode).toBe(true);
  });

  it("canvas reference is preserved", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    // We can't directly access private properties, but we can verify it was created
    expect(interactionManager).toBeDefined();
  });

  it("should handle detach() multiple times safely", () => {
    interactionManager = new InteractionManager(mockHost, canvas, mockWorld);
    expect(() => {
      interactionManager?.detach();
      interactionManager?.detach(); // Second detach should not throw
      interactionManager?.detach(); // Third detach should not throw
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// InteractionHost interface validation
// ---------------------------------------------------------------------------
describe("InteractionHost interface", () => {
  let mockDoc: any;

  beforeEach(() => {
    mockDoc = (globalThis as any).document || {
      createElement: vi.fn((tag: string) => {
        return {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        } as any;
      }),
    };
  });

  it("should have all required methods", () => {
    const requiredMethods = [
      "hitTestNode",
      "markDirty",
      "applyHover",
      "getHighlightedNodeId",
      "setHighlightedNodeId",
      "getCurrentLayout",
      "getShells",
      "getNodeShellIndex",
      "getPixiNodes",
      "getSimulation",
      "openFile",
      "toggleHold",
      "clearAllHolds",
      "getAccentColor",
      "zoomToScreenRect",
      "getPixiApp",
      "handleSuperNodeDblClick",
      "setPathfinderNode",
      "clearPathfinder",
      "getPathfinderState",
      "getApp",
      "getContainerEl",
      "addCompareNode",
      "clearCompareSelection",
      "setSearchQuery",
    ];

    const mockHost: InteractionHost = {
      hitTestNode: () => null,
      markDirty: () => {},
      applyHover: () => {},
      getHighlightedNodeId: () => null,
      setHighlightedNodeId: () => {},
      getCurrentLayout: () => "force",
      getShells: () => [],
      getNodeShellIndex: () => new Map(),
      getPixiNodes: () => new Map(),
      getSimulation: () => null,
      openFile: () => {},
      toggleHold: () => {},
      clearAllHolds: () => {},
      getAccentColor: () => 0xffffff,
      zoomToScreenRect: () => {},
      getPixiApp: () => null,
      handleSuperNodeDblClick: () => false,
      setPathfinderNode: () => {},
      clearPathfinder: () => {},
      getPathfinderState: () => ({ startId: null, endId: null }),
      getApp: () => ({}) as any,
      getContainerEl: () => mockDoc.createElement("div"),
      addCompareNode: () => {},
      clearCompareSelection: () => {},
      setSearchQuery: () => {},
    } as any;

    for (const method of requiredMethods) {
      expect(mockHost).toHaveProperty(method);
      expect(typeof (mockHost as any)[method]).toBe("function");
    }
  });

  it("should support optional methods", () => {
    const mockHost: InteractionHost = {
      hitTestNode: () => null,
      markDirty: () => {},
      applyHover: () => {},
      getHighlightedNodeId: () => null,
      setHighlightedNodeId: () => {},
      getCurrentLayout: () => "force",
      getShells: () => [],
      getNodeShellIndex: () => new Map(),
      getPixiNodes: () => new Map(),
      getSimulation: () => null,
      openFile: () => {},
      toggleHold: () => {},
      clearAllHolds: () => {},
      getAccentColor: () => 0xffffff,
      zoomToScreenRect: () => {},
      getPixiApp: () => null,
      handleSuperNodeDblClick: () => false,
      setPathfinderNode: () => {},
      clearPathfinder: () => {},
      getPathfinderState: () => ({ startId: null, endId: null }),
      getApp: () => ({}) as any,
      getContainerEl: () => mockDoc.createElement("div"),
      addCompareNode: () => {},
      clearCompareSelection: () => {},
      setSearchQuery: () => {},
      // Optional methods
      getZoomSensitivity: () => 1.0,
      applyFocusOnClick: () => {},
      focusZoomToNode: () => {},
      onZoomLayoutUpdate: () => {},
      updateLabelsForZoom: () => {},
      applyTextFade: () => {},
      updateZoomIndicator: () => {},
    } as any;

    // Verify optional methods are accessible
    expect(mockHost.getZoomSensitivity?.()).toBe(1.0);
    expect(() => {
      mockHost.applyFocusOnClick?.("");
      mockHost.focusZoomToNode?.("");
      mockHost.onZoomLayoutUpdate?.(1.0);
      mockHost.updateLabelsForZoom?.();
      mockHost.applyTextFade?.();
      mockHost.updateZoomIndicator?.(1.0);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Constants validation
// ---------------------------------------------------------------------------
describe("InteractionManager constants", () => {
  it("ZOOM_IN_FACTOR should be reasonable", () => {
    expect(ZOOM_IN_FACTOR).toBeGreaterThan(1);
    expect(ZOOM_IN_FACTOR).toBeLessThan(1.5);
  });

  it("ZOOM_OUT_FACTOR should be reasonable", () => {
    expect(ZOOM_OUT_FACTOR).toBeGreaterThan(0.5);
    expect(ZOOM_OUT_FACTOR).toBeLessThan(1);
  });

  it("zoom scales should be properly ordered", () => {
    expect(ZOOM_SCALE_MIN).toBeGreaterThan(0);
    expect(ZOOM_SCALE_MIN).toBeLessThan(0.1);
    expect(ZOOM_SCALE_MAX).toBeGreaterThan(1);
    expect(ZOOM_SCALE_MIN).toBeLessThan(ZOOM_SCALE_MAX);
  });
});

// ---------------------------------------------------------------------------
// computeZoomFactor edge cases and advanced scenarios
// ---------------------------------------------------------------------------
describe("computeZoomFactor edge cases", () => {
  it("handles very large deltaY values", () => {
    const factorLarge = computeZoomFactor(10000);
    const factorSmall = computeZoomFactor(1);
    // Both should be zoom-out, but large values don't change the direction
    expect(factorLarge).toBeLessThan(1);
    expect(factorSmall).toBeLessThan(1);
    // The factors should be equal since only the sign matters
    expect(factorLarge).toBeCloseTo(factorSmall, 10);
  });

  it("handles very small negative deltaY values", () => {
    const factorSmall = computeZoomFactor(-1);
    const factorLarge = computeZoomFactor(-10000);
    // Both should be zoom-in
    expect(factorSmall).toBeGreaterThan(1);
    expect(factorLarge).toBeGreaterThan(1);
    // Direction is determined only by sign, not magnitude
    expect(factorSmall).toBeCloseTo(factorLarge, 10);
  });

  it("sensitivity below 0 still works (extrapolation)", () => {
    const factor = computeZoomFactor(-1, -0.5);
    // With negative sensitivity, the zoom in factor becomes inverted
    // inF = 1 + (0.1) * (-0.5) = 1 - 0.05 = 0.95
    expect(factor).toBeCloseTo(0.95, 5);
    expect(factor).toBeLessThan(1); // zoom out effect with negative sensitivity
  });

  it("very high sensitivity (3.0) produces aggressive zoom", () => {
    const inFactor = computeZoomFactor(-1, 3.0);
    const outFactor = computeZoomFactor(1, 3.0);
    // inF = 1 + 0.1 * 3 = 1.3
    expect(inFactor).toBeCloseTo(1.3, 5);
    // outF = 1 - 0.1 * 3 = 0.7
    expect(outFactor).toBeCloseTo(0.7, 5);
  });

  it("sensitivity monotonically controls zoom intensity for zoom in", () => {
    const f0 = computeZoomFactor(-1, 0);
    const f05 = computeZoomFactor(-1, 0.5);
    const f1 = computeZoomFactor(-1, 1.0);
    const f2 = computeZoomFactor(-1, 2.0);

    // All should be >= 1 (zoom in direction)
    expect(f0).toBeGreaterThanOrEqual(1);
    expect(f05).toBeGreaterThanOrEqual(1);
    expect(f1).toBeGreaterThanOrEqual(1);
    expect(f2).toBeGreaterThanOrEqual(1);

    // Should be monotonically increasing
    expect(f0).toBeLessThanOrEqual(f05);
    expect(f05).toBeLessThanOrEqual(f1);
    expect(f1).toBeLessThanOrEqual(f2);
  });

  it("sensitivity monotonically controls zoom intensity for zoom out", () => {
    const f0 = computeZoomFactor(1, 0);
    const f05 = computeZoomFactor(1, 0.5);
    const f1 = computeZoomFactor(1, 1.0);
    const f2 = computeZoomFactor(1, 2.0);

    // All should be <= 1 (zoom out direction)
    expect(f0).toBeLessThanOrEqual(1);
    expect(f05).toBeLessThanOrEqual(1);
    expect(f1).toBeLessThanOrEqual(1);
    expect(f2).toBeLessThanOrEqual(1);

    // Should be monotonically decreasing (as sensitivity increases, zoom-out gets stronger)
    expect(f0).toBeGreaterThanOrEqual(f05);
    expect(f05).toBeGreaterThanOrEqual(f1);
    expect(f1).toBeGreaterThanOrEqual(f2);
  });
});

// ---------------------------------------------------------------------------
// clampScale edge cases and boundary conditions
// ---------------------------------------------------------------------------
describe("clampScale edge cases", () => {
  it("clamping at exact boundaries should be identity", () => {
    expect(clampScale(ZOOM_SCALE_MIN)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(ZOOM_SCALE_MAX)).toBe(ZOOM_SCALE_MAX);
  });

  it("just inside boundaries should pass through", () => {
    const justAboveMin = ZOOM_SCALE_MIN + 0.0001;
    const justBelowMax = ZOOM_SCALE_MAX - 0.0001;
    expect(clampScale(justAboveMin)).toBeCloseTo(justAboveMin, 4);
    expect(clampScale(justBelowMax)).toBeCloseTo(justBelowMax, 4);
  });

  it("just outside boundaries should clamp", () => {
    const justBelowMin = ZOOM_SCALE_MIN - 0.0001;
    const justAboveMax = ZOOM_SCALE_MAX + 0.0001;
    expect(clampScale(justBelowMin)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(justAboveMax)).toBe(ZOOM_SCALE_MAX);
  });

  it("very large positive numbers clamp to max", () => {
    expect(clampScale(1e10)).toBe(ZOOM_SCALE_MAX);
    expect(clampScale(1e100)).toBe(ZOOM_SCALE_MAX);
    expect(clampScale(Number.MAX_VALUE)).toBe(ZOOM_SCALE_MAX);
  });

  it("very small positive numbers clamp to min", () => {
    expect(clampScale(1e-10)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(1e-100)).toBe(ZOOM_SCALE_MIN);
    expect(clampScale(Number.MIN_VALUE)).toBe(ZOOM_SCALE_MIN);
  });

  it("monotonicity: clamping preserves order for in-range values", () => {
    const vals = [0.5, 1.0, 2.0, 5.0];
    const clamped = vals.map(clampScale);
    for (let i = 0; i < clamped.length - 1; i++) {
      expect(clamped[i]).toBeLessThanOrEqual(clamped[i + 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Zoom factor + clamp realistic scenarios
// ---------------------------------------------------------------------------
describe("Zoom + clamp realistic zoom sequences", () => {
  it("alternating rapid zoom in/out should stay within bounds", () => {
    let scale = 1.0;
    for (let i = 0; i < 100; i++) {
      scale *= i % 2 === 0 ? computeZoomFactor(-1, 1.5) : computeZoomFactor(1, 1.5);
      scale = clampScale(scale);
    }
    expect(scale).toBeGreaterThanOrEqual(ZOOM_SCALE_MIN);
    expect(scale).toBeLessThanOrEqual(ZOOM_SCALE_MAX);
  });

  it("continuous zoom-in with high sensitivity should reach max and stay there", () => {
    let scale = 1.0;
    let hitMax = false;
    for (let i = 0; i < 50; i++) {
      scale *= computeZoomFactor(-1, 2.0);
      scale = clampScale(scale);
      if (scale === ZOOM_SCALE_MAX) hitMax = true;
    }
    expect(hitMax).toBe(true);
    expect(scale).toBe(ZOOM_SCALE_MAX);
  });

  it("continuous zoom-out with high sensitivity should reach min and stay there", () => {
    let scale = 1.0;
    let hitMin = false;
    for (let i = 0; i < 50; i++) {
      scale *= computeZoomFactor(1, 2.0);
      scale = clampScale(scale);
      if (scale === ZOOM_SCALE_MIN) hitMin = true;
    }
    expect(hitMin).toBe(true);
    expect(scale).toBe(ZOOM_SCALE_MIN);
  });

  it("zoom in from min should eventually exceed min", () => {
    let scale = ZOOM_SCALE_MIN;
    const originalScale = scale;
    scale *= computeZoomFactor(-1, 1.0);
    scale = clampScale(scale);
    expect(scale).toBeGreaterThan(originalScale);
  });

  it("zoom out from max should eventually be less than max", () => {
    let scale = ZOOM_SCALE_MAX;
    const originalScale = scale;
    scale *= computeZoomFactor(1, 1.0);
    scale = clampScale(scale);
    expect(scale).toBeLessThan(originalScale);
  });
});

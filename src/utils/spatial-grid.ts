// ---------------------------------------------------------------------------
// SpatialHashGrid — generic 2D spatial hash for AABB overlap detection
// ---------------------------------------------------------------------------
// Extracted from RenderPipeline._createOverlapGrid for testability.
// Used by label culling, but generic enough for any rect-based overlap test.
// ---------------------------------------------------------------------------

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const DEFAULT_CELL_SIZE = 200;
const HASH_PRIME = 73856093;

/**
 * A spatial hash grid for O(n*k) AABB overlap detection.
 *
 * @param cellSize  Grid cell size in pixels (default 200)
 * @param margin    Extra margin around rects for overlap detection
 */
export class SpatialHashGrid<T extends Rect = Rect> {
	private gridMap = new Map<number, T[]>();
	private cellSize: number;
	private margin: number;

	constructor(cellSize = DEFAULT_CELL_SIZE, margin = 0) {
		this.cellSize = cellSize;
		this.margin = margin;
	}

	private cellKey(cx: number, cy: number): number {
		return cx * HASH_PRIME + cy;
	}

	private getCellRange(rect: Rect): { x0: number; y0: number; x1: number; y1: number } {
		const m = this.margin;
		const cs = this.cellSize;
		return {
			x0: Math.floor((rect.x - m) / cs),
			y0: Math.floor((rect.y - m) / cs),
			x1: Math.floor((rect.x + rect.w + m) / cs),
			y1: Math.floor((rect.y + rect.h + m) / cs),
		};
	}

	/** Insert a rect into the grid. */
	insert(rect: T): void {
		const { x0, y0, x1, y1 } = this.getCellRange(rect);
		for (let cx = x0; cx <= x1; cx++) {
			for (let cy = y0; cy <= y1; cy++) {
				const k = this.cellKey(cx, cy);
				const arr = this.gridMap.get(k);
				if (arr) arr.push(rect);
				else this.gridMap.set(k, [rect]);
			}
		}
	}

	/** Check if a rect overlaps any existing rect in the grid. */
	checkOverlap(rect: Rect): boolean {
		const m = this.margin;
		const { x0, y0, x1, y1 } = this.getCellRange(rect);
		for (let cx = x0; cx <= x1; cx++) {
			for (let cy = y0; cy <= y1; cy++) {
				const arr = this.gridMap.get(this.cellKey(cx, cy));
				if (!arr) continue;
				for (const p of arr) {
					if (
						rect.x - m < p.x + p.w + m &&
						rect.x + rect.w + m > p.x - m &&
						rect.y - m < p.y + p.h + m &&
						rect.y + rect.h + m > p.y - m
					)
						return true;
				}
			}
		}
		return false;
	}

	/** Iterate all rects near a point within a given radius. */
	forEachNear(x: number, y: number, radius: number, cb: (r: T) => void): void {
		const cs = this.cellSize;
		const cx0 = Math.floor((x - radius) / cs);
		const cy0 = Math.floor((y - radius) / cs);
		const cx1 = Math.floor((x + radius) / cs);
		const cy1 = Math.floor((y + radius) / cs);
		const seen = new Set<T>();
		for (let cx = cx0; cx <= cx1; cx++) {
			for (let cy = cy0; cy <= cy1; cy++) {
				const arr = this.gridMap.get(this.cellKey(cx, cy));
				if (!arr) continue;
				for (const p of arr) {
					if (!seen.has(p)) {
						seen.add(p);
						cb(p);
					}
				}
			}
		}
	}

	/** Clear the grid. */
	clear(): void {
		this.gridMap.clear();
	}

	/** Number of cells with at least one rect. */
	get cellCount(): number {
		return this.gridMap.size;
	}
}

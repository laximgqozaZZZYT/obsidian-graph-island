export type Pt = { x: number; y: number };

/** Hit region for aggregate group circles (label rect + circle area). */
export interface AggregateHitRegion {
	x: number;
	y: number;
	w: number;
	h: number;
	cx: number;
	cy: number;
	r: number;
}

/**
 * Hit-test a point against a list of aggregate hit regions.
 * Each region has both a rectangular label area and a circular area.
 * Returns the first matching region, or null if none match.
 */
export function hitTestAggregateRegions(
	wx: number,
	wy: number,
	regions: readonly AggregateHitRegion[],
): AggregateHitRegion | null {
	for (const hr of regions) {
		// Rectangular label area
		if (wx >= hr.x && wx <= hr.x + hr.w && wy >= hr.y && wy <= hr.y + hr.h) {
			return hr;
		}
		// Circular area
		const dx = wx - hr.cx;
		const dy = wy - hr.cy;
		if (dx * dx + dy * dy <= hr.r * hr.r) {
			return hr;
		}
	}
	return null;
}

/**
 * Collect positions of nodes whose filePath or id starts with the given key prefix,
 * then compute the padded bounding rect {x, y, w, h}.
 * Returns null if no members match.
 */
export function computeGroupMemberBounds(
	nodes: Iterable<{ data: { filePath?: string; id?: string; x: number; y: number } }>,
	memberKey: string,
	padding: number,
): Rect | null {
	const members: Pt[] = [];
	for (const pn of nodes) {
		if (pn.data.filePath?.startsWith(memberKey) || pn.data.id?.startsWith(memberKey)) {
			members.push({ x: pn.data.x, y: pn.data.y });
		}
	}
	if (members.length === 0) return null;
	const bb = computeBoundingBox(members);
	return {
		x: bb.minX - padding,
		y: bb.minY - padding,
		w: bb.maxX - bb.minX + padding * 2,
		h: bb.maxY - bb.minY + padding * 2,
	};
}

/** Axis-aligned rectangle for overlap testing */
export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Check if two axis-aligned rectangles overlap */
export function rectsOverlap(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface BBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface BBoxWithCentroid extends BBox {
	cx: number;
	cy: number;
	count: number;
}

/**
 * Compute axis-aligned bounding box for a collection of points.
 */
export function computeBoundingBox(points: Iterable<{ x: number; y: number }>): BBox {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY };
}

/**
 * Compute bounding box together with centroid and point count.
 */
export function computeBBoxWithCentroid(points: Iterable<{ x: number; y: number }>): BBoxWithCentroid {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	let sx = 0,
		sy = 0,
		cnt = 0;
	for (const p of points) {
		sx += p.x;
		sy += p.y;
		cnt++;
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, minY, maxX, maxY, cx: cnt ? sx / cnt : 0, cy: cnt ? sy / cnt : 0, count: cnt };
}

/**
 * Clamp a numeric value to the range [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/** Euclidean distance between two deltas */
export function magnitude(dx: number, dy: number): number {
	return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the convex hull of a set of 2D points using Andrew's monotone chain.
 * Returns vertices in counter-clockwise order.
 */
export function convexHull(points: Pt[]): Pt[] {
	const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (pts.length <= 2) return pts;

	const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

	const lower: Pt[] = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}

	const upper: Pt[] = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}

	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

/**
 * Ray-casting algorithm for point-in-polygon test.
 * Works with any simple polygon (convex or concave).
 */
export function pointInPolygon(pt: Pt, polygon: Pt[]): boolean {
	if (polygon.length < 3) return false;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x,
			yi = polygon[i].y;
		const xj = polygon[j].x,
			yj = polygon[j].y;
		if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

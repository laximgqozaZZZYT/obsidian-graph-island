import type { Offset } from "./types";
import { centroidOf, subgroupHashOffset } from "./anchor-placement";

// Sub-group center positions during layout. Each entry tracks the
// current centre, the half-extents (= sub-group bbox), and a "pin"
// weight used by the relaxation step to bias displacement toward
// multi-membership sub-groups (they absorb most of the push) and away
// from single-membership ones (they barely drift).
export interface SubPos {
	cx: number;
	cy: number;
	halfW: number;
	halfH: number;
	pin: number; // higher = harder to move
}

// Build the initial SubPos for each packed sub-group:
//   1. Centroid of the sub-group's cluster anchors (= where each tag
//      cluster sits on the lattice).
//   2. + user-defined cluster offset for the primary membership.
//   3. + tiny deterministic radial perturbation hashed from the
//      membership signature so coincident centroids (= many sub-groups
//      sharing the same anchors) split apart predictably.
// Pin weight = number of memberships (= a single-tag sub-group has
// pin 1 so it barely drifts in relaxation; a many-tag combination has
// higher pin so it absorbs more of the push).
//
// Bug-fix anchor: bug #1 ("group members spread") routes through this
// centroid + the relaxation that follows it. Many sub-groups landing on
// nearby centroids end up pushed far apart by relaxation, scattering
// the parent cluster's members.
export function buildInitialSubPositions(
	packed: { memberships: string[]; width: number; height: number }[],
	anchors: Map<string, { x: number; y: number }>,
	clusterOff: Record<string, Offset>,
	hashOffsetMagnitude: number = 4,
): SubPos[] {
	return packed.map((p) => {
		const centroid = centroidOf(p.memberships, anchors);
		const off = clusterOff[p.memberships[0] ?? ""] ?? { dx: 0, dy: 0 };
		const tinyOff =
			p.memberships.length > 1
				? subgroupHashOffset(p.memberships.join("|"), hashOffsetMagnitude)
				: { x: 0, y: 0 };
		return {
			cx: centroid.x + off.dx + tinyOff.x,
			cy: centroid.y + off.dy + tinyOff.y,
			halfW: p.width / 2,
			halfH: p.height / 2,
			pin: p.memberships.length,
		};
	});
}

// AABB collision-resolution loop. For every pair of overlapping
// sub-group bboxes, push them apart along the shorter overlap axis.
// Displacement splits proportionally to the OTHER side's pin so high-
// pin singles act as anchors and low-pin singletons / multis migrate.
// `gap` is the minimum free space required between any two sub-groups
// once relaxation settles.
export function relaxSubgroups(
	subPositions: SubPos[],
	gap: number,
	maxIter: number = 80,
): void {
	for (let iter = 0; iter < maxIter; iter++) {
		let any = false;
		for (let i = 0; i < subPositions.length; i++) {
			for (let j = i + 1; j < subPositions.length; j++) {
				const a = subPositions[i];
				const b = subPositions[j];
				const dx = b.cx - a.cx;
				const dy = b.cy - a.cy;
				const reqX = a.halfW + b.halfW + gap;
				const reqY = a.halfH + b.halfH + gap;
				const overlapX = reqX - Math.abs(dx);
				const overlapY = reqY - Math.abs(dy);
				if (overlapX <= 0 || overlapY <= 0) continue;
				any = true;
				const totalPin = a.pin + b.pin;
				const fracA = b.pin / totalPin;
				const fracB = a.pin / totalPin;
				if (overlapX < overlapY) {
					const push = overlapX + 0.5;
					const sign = dx >= 0 ? 1 : -1;
					a.cx -= sign * push * fracA;
					b.cx += sign * push * fracB;
				} else {
					const push = overlapY + 0.5;
					const sign = dy >= 0 ? 1 : -1;
					a.cy -= sign * push * fracA;
					b.cy += sign * push * fracB;
				}
			}
		}
		if (!any) break;
	}
}

// Snap sub-group centres to the integer grid after relaxation, so cards
// inside each sub-group land on whole-cell positions when the per-card
// cell snap runs next.
export function snapSubgroupsToGrid(
	subPositions: SubPos[],
	gridX: number,
	gridY: number,
): void {
	for (const sp of subPositions) {
		sp.cx = Math.round(sp.cx / gridX) * gridX;
		sp.cy = Math.round(sp.cy / gridY) * gridY;
	}
}

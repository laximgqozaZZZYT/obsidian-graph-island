import type { PositionedNode, ClusterRect } from "./layout";

// Post-layout reconciliation: a node may have ended up inside the
// rectangular bbox of a cluster it doesn't belong to (= "foreign
// enclosure intrusion"). This is the visible artefact behind the
// "unrelated nodes inside group enclosure" bug — the rectangular bbox
// inherently covers cells between members, and a non-member card
// occupying one of those gap cells reads as "wrong cluster".
//
// This pass walks every node and, if it's inside any foreign bbox,
// relocates it to the nearest cell that satisfies BOTH:
//   - inside every cluster bbox of the node's own memberships
//   - outside every cluster bbox NOT in its memberships
// Free cell selection uses a spiral search starting from the centroid
// of the node's own clusters. Occupancy bookkeeping prevents collision
// with cards that haven't been moved.

export function evictForeignNodes(
	positionedNodes: PositionedNode[],
	clusters: ClusterRect[],
	slotW: number,
	slotH: number,
): void {
	if (clusters.length === 0 || positionedNodes.length === 0) return;

	const clusterByKey = new Map<string, ClusterRect>();
	for (const c of clusters) clusterByKey.set(c.groupKey, c);

	// Occupied cells. Use the node's footprint (= ceil(w / slotW) ×
	// ceil(h / slotH) cells) so multi-cell cards are tracked accurately.
	const occupied = new Set<string>();
	const footprintOf = (n: PositionedNode): { c: number; r: number; cs: number; rs: number } => {
		const cs = Math.max(1, Math.ceil(n.width / slotW));
		const rs = Math.max(1, Math.ceil(n.height / slotH));
		const c = Math.round(n.x / slotW - cs / 2);
		const r = Math.round(n.y / slotH - rs / 2);
		return { c, r, cs, rs };
	};
	const markFootprint = (c: number, r: number, cs: number, rs: number, op: "add" | "del"): void => {
		for (let dc = 0; dc < cs; dc++) {
			for (let dr = 0; dr < rs; dr++) {
				const k = `${c + dc},${r + dr}`;
				if (op === "add") occupied.add(k);
				else occupied.delete(k);
			}
		}
	};

	for (const n of positionedNodes) {
		const f = footprintOf(n);
		markFootprint(f.c, f.r, f.cs, f.rs, "add");
	}

	// Predicate: does a node's CENTER (cx, cy) fall inside a cluster rect?
	const insideRect = (cx: number, cy: number, c: ClusterRect): boolean =>
		cx >= c.x && cx < c.x + c.width && cy >= c.y && cy < c.y + c.height;

	// Validity check for a candidate (col, row) for node n. The cell must
	// (a) accept the node's footprint without occupying any cell already
	// taken by another node, (b) sit inside every own-cluster bbox, and
	// (c) sit outside every foreign-cluster bbox.
	const validCell = (n: PositionedNode, col: number, row: number, cs: number, rs: number): boolean => {
		// (a) footprint cells must be free (treat the node's OWN current
		//     cells as free since we'll remove them before re-placing).
		for (let dc = 0; dc < cs; dc++) {
			for (let dr = 0; dr < rs; dr++) {
				if (occupied.has(`${col + dc},${row + dr}`)) return false;
			}
		}
		// Centre of the candidate footprint (in pixel coords) is what we
		// test against cluster rects, matching the conventional "node at
		// rect centre" semantics elsewhere in the layout.
		const cx = (col + cs / 2) * slotW;
		const cy = (row + rs / 2) * slotH;
		for (const m of n.memberships) {
			const own = clusterByKey.get(m);
			if (!own) continue;
			if (!insideRect(cx, cy, own)) return false;
		}
		for (const c of clusters) {
			if (n.memberships.includes(c.groupKey)) continue;
			if (insideRect(cx, cy, c)) return false;
		}
		return true;
	};

	// Iteration order: nodes with MORE memberships first (= more
	// constrained, harder to relocate). Within the same membership
	// count, process by current position deterministically.
	const order = positionedNodes
		.map((_, i) => i)
		.sort((a, b) => {
			const ma = positionedNodes[a].memberships.length;
			const mb = positionedNodes[b].memberships.length;
			if (ma !== mb) return mb - ma;
			return positionedNodes[a].id.localeCompare(positionedNodes[b].id);
		});

	for (const idx of order) {
		const n = positionedNodes[idx];
		const cx = n.x;
		const cy = n.y;

		// Is n's current center inside any foreign cluster?
		let foreign: ClusterRect | null = null;
		for (const c of clusters) {
			if (n.memberships.includes(c.groupKey)) continue;
			if (insideRect(cx, cy, c)) {
				foreign = c;
				break;
			}
		}
		if (!foreign) continue;

		// Search target = centroid of own cluster centres (= the natural
		// home of this membership combination).
		let tCx = 0;
		let tCy = 0;
		let owns = 0;
		for (const m of n.memberships) {
			const own = clusterByKey.get(m);
			if (!own) continue;
			tCx += own.x + own.width / 2;
			tCy += own.y + own.height / 2;
			owns++;
		}
		if (owns === 0) continue; // unreachable in practice
		tCx /= owns;
		tCy /= owns;

		const f = footprintOf(n);
		markFootprint(f.c, f.r, f.cs, f.rs, "del");

		const initC = Math.round(tCx / slotW - f.cs / 2);
		const initR = Math.round(tCy / slotH - f.rs / 2);
		let foundC = initC;
		let foundR = initR;
		let found = validCell(n, initC, initR, f.cs, f.rs);

		// Spiral search bounded by 64 (= roughly 16 cells of stride).
		for (let rad = 1; rad < 64 && !found; rad++) {
			outer: for (let dc = -rad; dc <= rad; dc++) {
				for (let dr = -rad; dr <= rad; dr++) {
					if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
					if (validCell(n, initC + dc, initR + dr, f.cs, f.rs)) {
						foundC = initC + dc;
						foundR = initR + dr;
						found = true;
						break outer;
					}
				}
			}
		}

		if (found) {
			n.x = (foundC + f.cs / 2) * slotW;
			n.y = (foundR + f.rs / 2) * slotH;
			markFootprint(foundC, foundR, f.cs, f.rs, "add");
		} else {
			// No valid cell available; put the footprint back where it was.
			markFootprint(f.c, f.r, f.cs, f.rs, "add");
		}
	}
}

// Tag-graph (bipartite) layout. Two node kinds share one world-space canvas:
//   • SET nodes  — one per membership tag, drawn big + coloured, fixed on a
//     ring whose order follows a greedy co-occurrence chain (adjacent tags
//     share members → fewer long edges).
//   • NOTE nodes — one per GraphNode, small, pulled toward the centroid of the
//     SET nodes they belong to.
// A note↔set edge is emitted per membership, so a high-multiplicity note is
// just "more edges" — no overview/detail split needed.
//
// Hub mitigation (a sparse vault hairballs around a few universal tags):
//   1. drop singleton tags (size < 2) and GIANT tags (on > 40% of notes) so
//      mid-degree tags survive; then keep the top-N by size.
//   2. edges only go to VISIBLE tags (pruning); `pruneEdges` is the hook for
//      future Jaccard / per-note degree-cap strategies.
//
// Layout reuses the existing relaxation asset (`relaxSubgroups`) for final box
// de-overlap, on top of a bounded grid-repulsion spring embedder that keeps
// iterations capped and the lowest-stress snapshot (no oscillation/divergence).
import { GraphData, SET_PREFIX } from "./types";
import type { LaidOut, LayoutOptions, PositionedEdge, PositionedNode } from "./layout";
import { computeChannelDims, minFontScale } from "./card-sizing";
import { relaxSubgroups, SubPos } from "./subgroup-relax";

interface XY {
	x: number;
	y: number;
}

export function layoutBipartite(data: GraphData, opts: LayoutOptions): LaidOut {
	const labels = opts.clusterLabels ?? new Map<string, string>();
	const { channelW, channelH } = computeChannelDims(
		opts.nodeSpacing,
		minFontScale(opts.minFontPx ?? 0),
	);
	const cardW = opts.cellW > 0 ? opts.cellW : 80;
	const cardH = opts.cellH > 0 ? opts.cellH : 24;
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;
	const gap = Math.max(channelW, channelH);
	const noteW = cardW;
	const noteH = cardH;
	const setW = Math.round(cardW * 1.5);
	const setH = Math.round(cardH * 2);
	const nNotes = data.nodes.length;

	// --- tag selection / hub mitigation -------------------------------------
	const tagCount = new Map<string, number>();
	for (const n of data.nodes)
		for (const m of n.memberships) tagCount.set(m, (tagCount.get(m) ?? 0) + 1);
	const tags = selectTags(tagCount, nNotes, opts.bipartiteMaxTags ?? 80);
	const tagSet = new Set(tags);

	// Per-tag member sets, for the ring co-occurrence ordering.
	const tagMembers = new Map<string, Set<string>>();
	for (const t of tags) tagMembers.set(t, new Set());
	for (const n of data.nodes)
		for (const m of n.memberships) {
			const s = tagMembers.get(m);
			if (s) s.add(n.id);
		}
	const ringOrder = coocChain(tags, tagMembers);

	// --- SET node ring positions (fixed anchors) ----------------------------
	const ringN = Math.max(1, ringOrder.length);
	const circumference = ringN * (setW + gap * 2);
	const R = circumference / (2 * Math.PI);
	const setPos = new Map<string, XY>();
	ringOrder.forEach((t, i) => {
		const a = (i / ringN) * Math.PI * 2 - Math.PI / 2;
		setPos.set(t, { x: R * Math.cos(a), y: R * Math.sin(a) });
	});

	// --- NOTE seed positions + spring targets -------------------------------
	const prev = opts.bipartitePrev;
	const target: (XY | null)[] = [];
	const pos: XY[] = data.nodes.map((n, i) => {
		const vis = n.memberships.filter((m) => tagSet.has(m));
		let tg: XY | null = null;
		if (vis.length) {
			let sx = 0;
			let sy = 0;
			for (const m of vis) {
				const p = setPos.get(m)!;
				sx += p.x;
				sy += p.y;
			}
			tg = { x: sx / vis.length, y: sy / vis.length };
		}
		target.push(tg);
		// Seed from the previous frame's position when available so a relayout
		// (tag-count change) doesn't visually teleport every node.
		const pp = prev?.get(n.id);
		if (pp) return { x: pp.x, y: pp.y };
		if (tg) {
			const j = jitter(i);
			return { x: tg.x + j.x * slotW * 2, y: tg.y + j.y * slotH * 2 };
		}
		// Isolated note (only excluded/giant tags): park on a small inner ring.
		const a = (i / Math.max(1, nNotes)) * Math.PI * 2;
		return { x: R * 0.18 * Math.cos(a), y: R * 0.18 * Math.sin(a) };
	});

	// --- bounded force: spring + grid repulsion, best-keep ------------------
	forceLayout(pos, target, slotW, slotH);

	// --- final overlap cleanup via existing relaxSubgroups ------------------
	// Skip for very large graphs where the O(n²) pass would stall; the grid
	// repulsion above has already spread them.
	if (nNotes > 0 && nNotes <= 1500) {
		const subs: SubPos[] = [];
		for (const t of ringOrder) {
			const p = setPos.get(t)!;
			// pin huge → set anchors barely move; note↔set collisions push the NOTE.
			subs.push({ cx: p.x, cy: p.y, halfW: setW / 2, halfH: setH / 2, memberships: [t], pin: 1000 });
		}
		for (let i = 0; i < nNotes; i++)
			subs.push({
				cx: pos[i].x,
				cy: pos[i].y,
				halfW: noteW / 2,
				halfH: noteH / 2,
				memberships: data.nodes[i].memberships,
				pin: 1,
			});
		relaxSubgroups(subs, gap, 60);
		ringOrder.forEach((t, i) => setPos.set(t, { x: subs[i].cx, y: subs[i].cy }));
		for (let i = 0; i < nNotes; i++) {
			pos[i].x = subs[ringN + i].cx;
			pos[i].y = subs[ringN + i].cy;
		}
	}

	// --- emit nodes (sets first, then notes) --------------------------------
	const nodes: PositionedNode[] = [];
	const setNodeIds = new Set<string>();
	for (const t of ringOrder) {
		const p = setPos.get(t)!;
		const id = SET_PREFIX + t;
		setNodeIds.add(id);
		nodes.push({
			id,
			label: `${labels.get(t) ?? t} (${tagCount.get(t)})`,
			memberships: [t],
			x: p.x,
			y: p.y,
			width: setW,
			height: setH,
		});
	}
	data.nodes.forEach((n, i) => {
		nodes.push({
			id: n.id,
			label: n.label,
			memberships: n.memberships,
			x: pos[i].x,
			y: pos[i].y,
			width: noteW,
			height: noteH,
		});
	});

	// --- edges: note → set (visible tags only), then pruning hook -----------
	let edges: PositionedEdge[] = [];
	data.nodes.forEach((n, i) => {
		for (const m of n.memberships) {
			if (!tagSet.has(m)) continue; // visible-tag pruning
			const sp = setPos.get(m)!;
			edges.push({
				source: n.id,
				target: SET_PREFIX + m,
				weight: 1,
				path: [
					{ x: pos[i].x, y: pos[i].y },
					{ x: sp.x, y: sp.y },
				],
				bundled: false,
				bundleCount: 1,
			});
		}
	});
	edges = pruneEdges(edges, opts);

	return { nodes, edges, clusters: [], trunks: [], slotW, slotH, channelW, channelH, setNodeIds };
}

// Hub mitigation: drop singletons + giant ubiquitous tags so mid-degree tags
// survive; then keep the top-N by size.
function selectTags(
	tagCount: Map<string, number>,
	nNotes: number,
	maxTags: number,
): string[] {
	const giant = Math.max(4, Math.floor(nNotes * 0.4));
	return [...tagCount.keys()]
		.filter((t) => {
			const s = tagCount.get(t)!;
			return s >= 2 && s <= giant;
		})
		.sort((a, b) => tagCount.get(b)! - tagCount.get(a)! || (a < b ? -1 : 1))
		.slice(0, Math.max(1, maxTags));
}

// Greedy nearest-neighbour chain by shared members so co-occurring tags end up
// adjacent on the ring (fewer long edges / crossings).
function coocChain(tags: string[], members: Map<string, Set<string>>): string[] {
	if (tags.length <= 2) return tags.slice();
	const used = new Set<string>();
	const order: string[] = [tags[0]];
	used.add(tags[0]);
	let cur = tags[0];
	while (order.length < tags.length) {
		const cm = members.get(cur)!;
		let best: string | null = null;
		let bestSh = -1;
		for (const t of tags) {
			if (used.has(t)) continue;
			const sh = overlapCount(cm, members.get(t)!);
			if (sh > bestSh) {
				bestSh = sh;
				best = t;
			}
		}
		cur = best!;
		order.push(cur);
		used.add(cur);
	}
	return order;
}

function overlapCount(a: Set<string>, b: Set<string>): number {
	const [s, l] = a.size < b.size ? [a, b] : [b, a];
	let n = 0;
	for (const x of s) if (l.has(x)) n++;
	return n;
}

// Deterministic pseudo-jitter in [-0.5, 0.5] from an index. Stable across
// rebuilds (no churn) and combines with the bipartitePrev seed.
function jitter(i: number): XY {
	const h1 = (Math.imul(i + 1, 2654435761) >>> 0) / 0xffffffff;
	const h2 = (Math.imul(i + 1, 40503) >>> 0) / 0xffffffff;
	return { x: h1 - 0.5, y: h2 - 0.5 };
}

// Bounded spring embedder: notes pulled toward their tags' centroid (springs)
// and pushed off nearby notes (grid-binned repulsion, O(n) per pass). Capped
// iterations + lowest-stress snapshot prevent oscillation / divergence.
function forceLayout(pos: XY[], target: (XY | null)[], slotW: number, slotH: number): void {
	const N = pos.length;
	if (N === 0) return;
	const MAX_ITER = 60;
	const SPRING = 0.1;
	const cell = Math.max(slotW, slotH) * 1.3;
	const minDist = Math.max(slotW, slotH);
	const GW = 100000;
	let bestScore = Infinity;
	let best = pos.map((p) => ({ x: p.x, y: p.y }));
	let noImprove = 0;
	for (let it = 0; it < MAX_ITER; it++) {
		for (let i = 0; i < N; i++) {
			const t = target[i];
			if (!t) continue;
			pos[i].x += (t.x - pos[i].x) * SPRING;
			pos[i].y += (t.y - pos[i].y) * SPRING;
		}
		const grid = new Map<number, number[]>();
		const gkey = (x: number, y: number): number =>
			Math.floor(x / cell) * GW + Math.floor(y / cell);
		for (let i = 0; i < N; i++) {
			const k = gkey(pos[i].x, pos[i].y);
			let a = grid.get(k);
			if (!a) {
				a = [];
				grid.set(k, a);
			}
			a.push(i);
		}
		let overlaps = 0;
		for (let i = 0; i < N; i++) {
			const gx = Math.floor(pos[i].x / cell);
			const gy = Math.floor(pos[i].y / cell);
			for (let ox = -1; ox <= 1; ox++)
				for (let oy = -1; oy <= 1; oy++) {
					const a = grid.get((gx + ox) * GW + (gy + oy));
					if (!a) continue;
					for (const j of a) {
						if (j <= i) continue;
						let dx = pos[i].x - pos[j].x;
						let dy = pos[i].y - pos[j].y;
						let d2 = dx * dx + dy * dy;
						if (d2 < 1e-6) {
							dx = ((i * 7 + 1) % 5) - 2;
							dy = ((j * 7 + 1) % 5) - 2;
							d2 = dx * dx + dy * dy + 1e-6;
						}
						const d = Math.sqrt(d2);
						if (d < minDist) {
							overlaps++;
							const f = ((minDist - d) / d) * 0.5;
							const px = dx * f;
							const py = dy * f;
							pos[i].x += px;
							pos[i].y += py;
							pos[j].x -= px;
							pos[j].y -= py;
						}
					}
				}
		}
		let stress = 0;
		for (let i = 0; i < N; i++) {
			const t = target[i];
			if (t) {
				const dx = pos[i].x - t.x;
				const dy = pos[i].y - t.y;
				stress += Math.sqrt(dx * dx + dy * dy);
			}
		}
		const score = stress + overlaps * minDist;
		if (score < bestScore - 0.5) {
			bestScore = score;
			best = pos.map((p) => ({ x: p.x, y: p.y }));
			noImprove = 0;
		} else if (++noImprove >= 5) break;
	}
	for (let i = 0; i < N; i++) {
		pos[i].x = best[i].x;
		pos[i].y = best[i].y;
	}
}

// Edge-pruning extension point. Currently identity — the only pruning applied
// is dropping edges to hidden (excluded) tags in the emit loop. Future
// strategies (Jaccard co-occurrence threshold, per-note degree cap) plug in
// here without touching the emit loop or the renderer.
function pruneEdges(edges: PositionedEdge[], _opts: LayoutOptions): PositionedEdge[] {
	return edges;
}

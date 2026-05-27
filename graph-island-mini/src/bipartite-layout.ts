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
//   2. edges only go to VISIBLE tags (the excluded tags carry no edges).
//
// Layout is selectable: "force" (default, spring embedder) or "concentric"
// (tags on an inner ring, notes on outer ring(s), both Jaccard-seriated). Only
// node POSITIONS differ between the two — the node/edge set is identical.
//
// Layout reuses the existing relaxation asset (`relaxSubgroups`) for final box
// de-overlap, on top of a bounded grid-repulsion spring embedder that keeps
// iterations capped and the lowest-stress snapshot (no oscillation/divergence).
import { GraphData, GraphNode, SET_PREFIX } from "./types";
import type { LaidOut, LayoutOptions, PositionedEdge, PositionedNode } from "./layout";
import { computeChannelDims, minFontScale } from "./card-sizing";
import { relaxSubgroups, SubPos } from "./subgroup-relax";
import { barycenter } from "./matrix-layout";

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
	let ringOrder = coocChain(tags, tagMembers);
	const ringN = Math.max(1, ringOrder.length);
	const setPos = new Map<string, XY>();
	let pos: XY[];

	// --- CONCENTRIC layout (opt-in): tags on an inner ring, notes on outer
	// ring(s), both in Jaccard-seriated order so related tags/notes sit on
	// adjacent arcs and edges span short spans. Topology (edge set) unchanged —
	// this only computes positions. No force / relax needed (equiangular).
	if (opts.bipartiteLayout === "concentric") {
		const c = placeConcentric(data, tags, { setW, noteW, noteH, gap });
		ringOrder = c.tagOrder;
		for (const [t, p] of c.setPos) setPos.set(t, p);
		pos = c.notePos;
		return emitBipartite(data, ringOrder, setPos, pos, {
			labels,
			tagCount,
			tagSet,
			setW,
			setH,
			noteW,
			noteH,
			slotW,
			slotH,
			channelW,
			channelH,
			arcRIn: c.rIn, // concentric → bow edges away from centre
		});
	}

	// --- FORCE layout (default) ---------------------------------------------
	// SET node ring positions (fixed anchors).
	const R = (ringN * (setW + gap * 2)) / (2 * Math.PI);
	ringOrder.forEach((t, i) => {
		const a = (i / ringN) * Math.PI * 2 - Math.PI / 2;
		setPos.set(t, { x: R * Math.cos(a), y: R * Math.sin(a) });
	});

	// --- per-signature blob anchors -----------------------------------------
	// Notes sharing the SAME visible-tag SET (signature) should read as ONE
	// blob. A note's raw centroid (mean of its tag positions) collapses many
	// different signatures onto the ring centre — that's why everything piled
	// up in the middle. Instead, give each unique signature its own anchor (=
	// centroid of its tags) and push overlapping anchors apart (reusing
	// relaxSubgroups). Same signature → identical anchor → one tight blob;
	// different signatures → separated anchors → distinct blobs.
	const slot = Math.max(slotW, slotH);
	const SEP = "";
	const sigOf = (n: GraphNode): string =>
		n.memberships
			.filter((m) => tagSet.has(m))
			.sort()
			.join(SEP);
	const sigNotes = new Map<string, number[]>();
	data.nodes.forEach((n, i) => {
		const sig = sigOf(n);
		let a = sigNotes.get(sig);
		if (!a) {
			a = [];
			sigNotes.set(sig, a);
		}
		a.push(i);
	});
	const sigKeys: string[] = [];
	const sigSubs: SubPos[] = [];
	for (const [sig, idxs] of sigNotes) {
		const vis = data.nodes[idxs[0]].memberships.filter((m) => tagSet.has(m));
		let cx = 0;
		let cy = 0;
		if (vis.length) {
			for (const m of vis) {
				const p = setPos.get(m)!;
				cx += p.x;
				cy += p.y;
			}
			cx /= vis.length;
			cy /= vis.length;
		}
		// Blob box grows with sqrt(member count) so a big signature reserves
		// proportionally more room when anchors are pushed apart. A generous
		// floor + multiplier spreads the (centrally-clustered) multi-tag blob
		// anchors well apart so distinct signatures read as separate clusters
		// instead of one central mass.
		const side = Math.max(slot * 2.4, Math.sqrt(idxs.length) * slot * 1.6);
		sigKeys.push(sig);
		sigSubs.push({ cx, cy, halfW: side / 2, halfH: side / 2, memberships: vis, pin: 1 });
	}
	if (sigSubs.length > 1) relaxSubgroups(sigSubs, gap * 2, 200);
	const sigAnchor = new Map<string, XY>();
	sigKeys.forEach((sig, i) => sigAnchor.set(sig, { x: sigSubs[i].cx, y: sigSubs[i].cy }));

	// --- NOTE seed + spring targets (toward the signature blob anchor) ------
	const prev = opts.bipartitePrev;
	const target: XY[] = data.nodes.map((n) => sigAnchor.get(sigOf(n)) ?? { x: 0, y: 0 });
	pos = data.nodes.map((n, i) => {
		// Seed from the previous frame's position when available so a relayout
		// (tag-count change) doesn't visually teleport every node.
		const pp = prev?.get(n.id);
		if (pp) return { x: pp.x, y: pp.y };
		const t = target[i];
		const j = jitter(i);
		return { x: t.x + j.x * slot, y: t.y + j.y * slot };
	});

	// --- bounded force: spring toward blob anchor + light repulsion ---------
	forceLayout(pos, target, slot);

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

	return emitBipartite(data, ringOrder, setPos, pos, {
		labels,
		tagCount,
		tagSet,
		setW,
		setH,
		noteW,
		noteH,
		slotW,
		slotH,
		channelW,
		channelH,
	});
}

interface EmitCtx {
	labels: Map<string, string>;
	tagCount: Map<string, number>;
	tagSet: Set<string>;
	setW: number;
	setH: number;
	noteW: number;
	noteH: number;
	slotW: number;
	slotH: number;
	channelW: number;
	channelH: number;
	// When set (concentric), edges are drawn as bezier arcs bowing away from the
	// ring centre (radius = arcRIn); omitted (force) → straight 2-point paths.
	arcRIn?: number;
}

// Shared emit for both layouts: same node set (sets first, then notes) and the
// same note→set edge set (visible-tag pruning) — only the supplied positions
// differ, so the topology is identical whichever layout produced them.
function emitBipartite(
	data: GraphData,
	tagOrder: string[],
	setPos: Map<string, XY>,
	pos: XY[],
	ctx: EmitCtx,
): LaidOut {
	const nodes: PositionedNode[] = [];
	const setNodeIds = new Set<string>();
	for (const t of tagOrder) {
		const p = setPos.get(t)!;
		const id = SET_PREFIX + t;
		setNodeIds.add(id);
		nodes.push({
			id,
			label: `${ctx.labels.get(t) ?? t} (${ctx.tagCount.get(t)})`,
			memberships: [t],
			x: p.x,
			y: p.y,
			width: ctx.setW,
			height: ctx.setH,
		});
	}
	data.nodes.forEach((n, i) => {
		nodes.push({
			id: n.id,
			label: n.label,
			memberships: n.memberships,
			x: pos[i].x,
			y: pos[i].y,
			width: ctx.noteW,
			height: ctx.noteH,
		});
	});

	const edges: PositionedEdge[] = [];
	data.nodes.forEach((n, i) => {
		for (const m of n.memberships) {
			if (!ctx.tagSet.has(m)) continue; // visible-tag pruning
			const sp = setPos.get(m)!;
			const path =
				ctx.arcRIn !== undefined
					? arcPath(pos[i], sp, ctx.arcRIn)
					: [
							{ x: pos[i].x, y: pos[i].y },
							{ x: sp.x, y: sp.y },
						];
			edges.push({
				source: n.id,
				target: SET_PREFIX + m,
				weight: 1,
				path,
				bundled: false,
				bundleCount: 1,
			});
		}
	});

	return {
		nodes,
		edges,
		clusters: [],
		trunks: [],
		slotW: ctx.slotW,
		slotH: ctx.slotH,
		channelW: ctx.channelW,
		channelH: ctx.channelH,
		setNodeIds,
	};
}

// Concentric placement: tags on an inner ring, notes on outer ring(s), both in
// Jaccard-seriated order (reusing the matrix barycenter). Note angle tracks its
// seriation FRACTION so it lands near its tags' arc; radius is staggered across
// rings to avoid angular crowding when notes outnumber one ring.
function placeConcentric(
	data: GraphData,
	tags: string[],
	dims: { setW: number; noteW: number; noteH: number; gap: number },
): { tagOrder: string[]; setPos: Map<string, XY>; notePos: XY[]; rIn: number } {
	const nTags = tags.length;
	const nNotes = data.nodes.length;
	const tagIdx = new Map<string, number>();
	tags.forEach((t, i) => tagIdx.set(t, i));
	const noteTags: number[][] = data.nodes.map((n) => {
		const a: number[] = [];
		for (const m of n.memberships) {
			const ti = tagIdx.get(m);
			if (ti !== undefined) a.push(ti);
		}
		return a;
	});
	const tagNotes: number[][] = tags.map(() => []);
	noteTags.forEach((ts, r) => {
		for (const ti of ts) tagNotes[ti].push(r);
	});
	// Seriate (tags = rows, notes = cols): one barycenter gives both orders,
	// co-optimised so a note's tags cluster at a similar angular fraction.
	let tagOrderIdx = tags.map((_, i) => i);
	let noteOrderIdx = data.nodes.map((_, i) => i);
	if (nTags > 1 && nNotes > 1) {
		const res = barycenter(tagNotes, noteTags, nTags, nNotes);
		tagOrderIdx = res.rowOrder;
		noteOrderIdx = res.colOrder;
	}
	const tagOrder = tagOrderIdx.map((i) => tags[i]);

	const TWO_PI = Math.PI * 2;
	const tagStep = dims.setW + dims.gap * 2;
	const rIn = Math.max((nTags * tagStep) / TWO_PI, dims.setW * 2);
	const setPos = new Map<string, XY>();
	tagOrder.forEach((t, p) => {
		const a = (p / Math.max(1, nTags)) * TWO_PI - Math.PI / 2;
		setPos.set(t, { x: rIn * Math.cos(a), y: rIn * Math.sin(a) });
	});

	const noteStep = dims.noteW + dims.gap;
	const rOuterBase = rIn + dims.setW + dims.gap * 3;
	const cap = Math.max(8, Math.floor((TWO_PI * rOuterBase) / noteStep));
	const ringLevels = Math.max(1, Math.ceil(nNotes / cap));
	const ringGap = dims.noteH + dims.gap * 1.5;
	const notePos: XY[] = new Array(nNotes);
	noteOrderIdx.forEach((orig, p) => {
		const a = (p / Math.max(1, nNotes)) * TWO_PI - Math.PI / 2;
		const r = rOuterBase + (p % ringLevels) * ringGap;
		notePos[orig] = { x: r * Math.cos(a), y: r * Math.sin(a) };
	});
	return { tagOrder, setPos, notePos, rIn };
}

// Quadratic-bezier arc that bows AWAY from the ring centre (origin), sampled to
// a polyline so the existing polyline edge renderer draws it as a curve. The
// control point sits on the angular bisector of the two endpoints, pushed
// outward by an offset that scales with their angular gap — so a wide
// cross-centre chord bows hard (clearing the middle) while a near-radial arm
// stays (almost) straight. Used only by the concentric bipartite layout.
function arcPath(a: XY, b: XY, rIn: number): XY[] {
	const aA = Math.atan2(a.y, a.x);
	const aB = Math.atan2(b.y, b.x);
	let diff = aB - aA;
	while (diff > Math.PI) diff -= Math.PI * 2;
	while (diff < -Math.PI) diff += Math.PI * 2;
	const span = Math.abs(diff); // 0..π
	if (span < 0.15) return [a, b]; // near-radial arm → straight
	const aMid = aA + diff / 2;
	const mx = (a.x + b.x) / 2;
	const my = (a.y + b.y) / 2;
	const offset = 0.8 * (span / Math.PI) * rIn;
	const cx = mx + Math.cos(aMid) * offset;
	const cy = my + Math.sin(aMid) * offset;
	const n = Math.min(14, Math.max(6, Math.round((span / Math.PI) * 14)));
	const pts: XY[] = [];
	for (let k = 0; k <= n; k++) {
		const t = k / n;
		const u = 1 - t;
		pts.push({
			x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
			y: u * u * a.y + 2 * u * t * cy + t * t * b.y,
		});
	}
	return pts;
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

// Bounded spring embedder: notes pulled HARD toward their signature blob
// anchor (so same-signature notes converge into one tight blob) and pushed
// just off exact neighbours (light grid-binned repulsion — the readable
// spacing is finished by relaxSubgroups afterwards). Capped iterations +
// lowest-stress snapshot prevent oscillation / divergence. A strong spring is
// what makes the blobs visible; the overlap term in the score is down-weighted
// so the snapshot kept is the CLUSTERED one, not the spread-out one.
function forceLayout(pos: XY[], target: (XY | null)[], slot: number): void {
	const N = pos.length;
	if (N === 0) return;
	const MAX_ITER = 80;
	const SPRING = 0.28;
	const cell = slot * 1.3;
	// Light anti-stack distance only; readable spacing comes from relaxSubgroups.
	const minDist = slot * 0.6;
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
		// Down-weight overlaps (×0.25) so best-keep favours the CLUSTERED
		// configuration; the final relaxSubgroups handles true de-overlap.
		const score = stress + overlaps * minDist * 0.25;
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

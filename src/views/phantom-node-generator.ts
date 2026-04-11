/**
 * Pure functions for generating phantom (invisible junction) nodes
 * used by the road network layout system.
 */
import type { GraphNode } from "../types";
import { POLAR_ARRANGEMENTS } from "../constants";

/**
 * Generate phantom nodes at layout pattern intersections.
 * These participate in the simulation (forces, arrangement, auto-adjustment)
 * but are never rendered (isPhantom = true).
 *
 * Polar layouts: spoke × ring intersections
 * Cartesian layouts: grid intersections
 */
export function generatePhantomNodes(
	realNodes: GraphNode[],
	cx: number,
	cy: number,
	arrangement: string,
): GraphNode[] {
	if (POLAR_ARRANGEMENTS.has(arrangement)) {
		return generatePolarPhantoms(realNodes, cx, cy);
	}
	return generateGridPhantoms(realNodes, cx, cy);
}

function computeMaxRadius(realNodes: GraphNode[], cx: number, cy: number): number {
	let maxR = 0;
	for (const n of realNodes) {
		if (n.isPhantom) continue;
		const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
		if (d > maxR) maxR = d;
	}
	return maxR < 10 ? 500 : maxR;
}

export function generatePolarPhantoms(realNodes: GraphNode[], cx: number, cy: number): GraphNode[] {
	const spokeCount = Math.min(12, Math.max(8, Math.ceil(Math.sqrt(realNodes.length / 5))));
	const ringCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(realNodes.length / 10))));
	const maxR = computeMaxRadius(realNodes, cx, cy);
	const phantoms: GraphNode[] = [];

	for (let ri = 1; ri <= ringCount; ri++) {
		const r = (maxR * ri) / (ringCount + 1);
		for (let si = 0; si < spokeCount; si++) {
			const theta = (si / spokeCount) * Math.PI * 2;
			phantoms.push({
				id: `__phantom_r${ri}_s${si}`,
				label: "",
				x: cx + r * Math.cos(theta),
				y: cy + r * Math.sin(theta),
				vx: 0,
				vy: 0,
				isPhantom: true,
			});
		}
	}
	return phantoms;
}

function computeGridBounds(
	realNodes: GraphNode[],
	cx: number,
	cy: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
	let xMin = Infinity,
		xMax = -Infinity,
		yMin = Infinity,
		yMax = -Infinity;
	for (const n of realNodes) {
		if (n.isPhantom) continue;
		if (n.x < xMin) xMin = n.x;
		if (n.x > xMax) xMax = n.x;
		if (n.y < yMin) yMin = n.y;
		if (n.y > yMax) yMax = n.y;
	}
	if (xMin === Infinity) {
		return { xMin: cx - 250, xMax: cx + 250, yMin: cy - 250, yMax: cy + 250 };
	}
	return { xMin, xMax, yMin, yMax };
}

export function generateGridPhantoms(realNodes: GraphNode[], cx: number, cy: number): GraphNode[] {
	const gridSize = Math.min(10, Math.max(6, Math.ceil(Math.sqrt(realNodes.length / 8))));
	const { xMin, xMax, yMin, yMax } = computeGridBounds(realNodes, cx, cy);
	const w = xMax - xMin || 500;
	const h = yMax - yMin || 500;
	const phantoms: GraphNode[] = [];

	for (let xi = 0; xi <= gridSize; xi++) {
		for (let yi = 0; yi <= gridSize; yi++) {
			phantoms.push({
				id: `__phantom_x${xi}_y${yi}`,
				label: "",
				x: xMin + (w * xi) / gridSize,
				y: yMin + (h * yi) / gridSize,
				vx: 0,
				vy: 0,
				isPhantom: true,
			});
		}
	}
	return phantoms;
}

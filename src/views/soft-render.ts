import type { GraphData, GraphNode } from "../types";
import type { PixiNode } from "./InteractionManager";

interface SoftRenderHost {
	pixiNodes: Map<string, PixiNode>;
	_invalidateRenderCaches(): void;
	getGraphData(): GraphData;
	_buildGraphMetadata(gd: GraphData): void;
	_buildTagMembership(gd: GraphData): void;
	_buildMissingNeighborSet(gd: GraphData): void;
	recolorNodes(): void;
	recalcNodeRadii(): void;
	setStatus(s: string): void;
	markDirty(forceFullRedraw: boolean): void;
	doRender(): Promise<void>;
}

export async function applySoftRender(host: SoftRenderHost): Promise<void> {
	host._invalidateRenderCaches();
	let gd: GraphData;
	try {
		gd = host.getGraphData();
	} catch {
		return;
	}
	if (gd.nodes.some((n: GraphNode) => !host.pixiNodes.has(n.id))) {
		await host.doRender();
		return;
	}
	const ids = new Set(gd.nodes.map((n: GraphNode) => n.id));
	for (const id of host.pixiNodes.keys()) {
		if (!ids.has(id)) host.pixiNodes.delete(id);
	}
	host._buildGraphMetadata(gd);
	host._buildTagMembership(gd);
	host._buildMissingNeighborSet(gd);
	host.recolorNodes();
	host.recalcNodeRadii();
	host.setStatus(`${gd.nodes.length} nodes, ${gd.edges.length} edges`);
	host.markDirty(true);
}

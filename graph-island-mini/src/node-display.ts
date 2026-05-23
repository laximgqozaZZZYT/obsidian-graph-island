import type { GraphNode } from "./types";

// Resolved NODE_DISPLAY values for a single node — the renderer reads
// these instead of touching settings directly so per-cluster overrides
// resolve consistently across cardFor / measureCard / drawCard.
export interface NodeDisplay {
	nodeRows: number;
	nodeCols: number;
	nodeSizeMode: "fixed" | "indegree" | "outdegree";
}

export type NodeSizeMode = "fixed" | "indegree" | "outdegree";

export interface NodeDisplayOverride {
	nodeRows?: number;
	nodeCols?: number;
	nodeSizeMode?: NodeSizeMode;
}

// Defaults used as the final fallback when no override applies anywhere
// in the resolution chain.
export interface NodeDisplayDefaults {
	nodeRows: number;
	nodeCols: number;
	nodeSizeMode: NodeSizeMode;
}

// Dependencies the resolver needs to walk the chain. Pulled in once per
// rebuild and reused across every per-node lookup.
export interface NodeDisplayDeps {
	overrides: Record<string, NodeDisplayOverride>;
	inheritFrom: Record<string, string>;
	supersetsOf: Map<string, string[]>;
	defaults: NodeDisplayDefaults;
}

// Resolve NODE_DISPLAY for a node by walking, per field, the chain:
//   1. Override on the node's group
//   2. Override on `inheritFrom[group]`
//   3. Override on any strict superset of the group
//   4. Global default
// Memberships are tried in the node's declared order; the first concrete
// value found at any level for a given field wins.
export function resolveNodeDisplay(
	n: GraphNode,
	deps: NodeDisplayDeps,
): NodeDisplay {
	const { overrides, inheritFrom, supersetsOf, defaults } = deps;
	const lookup = <K extends keyof NodeDisplayOverride>(
		field: K,
	): NodeDisplayOverride[K] | undefined => {
		for (const m of n.memberships) {
			const own = overrides[m]?.[field];
			if (own !== undefined) return own;
			const inh = inheritFrom[m];
			if (inh) {
				const v = overrides[inh]?.[field];
				if (v !== undefined) return v;
			}
			const supers = supersetsOf.get(m) ?? [];
			for (const sup of supers) {
				const v = overrides[sup]?.[field];
				if (v !== undefined) return v;
			}
		}
		return undefined;
	};
	return {
		nodeRows: (lookup("nodeRows") as number | undefined) ?? defaults.nodeRows,
		nodeCols: (lookup("nodeCols") as number | undefined) ?? defaults.nodeCols,
		nodeSizeMode:
			(lookup("nodeSizeMode") as NodeSizeMode | undefined) ??
			defaults.nodeSizeMode,
	};
}

// Resolve what a cluster's NODE_DISPLAY WOULD be when it has no override
// of its own. Used by the panel to show placeholder values that reflect
// the effective resolution from inheritFrom / supersets / global.
export function resolveFromCluster(
	groupKey: string,
	deps: NodeDisplayDeps,
): NodeDisplay {
	const { overrides, inheritFrom, supersetsOf, defaults } = deps;
	const lookup = <K extends keyof NodeDisplayOverride>(
		field: K,
	): NodeDisplayOverride[K] | undefined => {
		const own = overrides[groupKey]?.[field];
		if (own !== undefined) return own;
		const inh = inheritFrom[groupKey];
		if (inh) {
			const v = overrides[inh]?.[field];
			if (v !== undefined) return v;
		}
		const supers = supersetsOf.get(groupKey) ?? [];
		for (const sup of supers) {
			const v = overrides[sup]?.[field];
			if (v !== undefined) return v;
		}
		return undefined;
	};
	return {
		nodeRows: (lookup("nodeRows") as number | undefined) ?? defaults.nodeRows,
		nodeCols: (lookup("nodeCols") as number | undefined) ?? defaults.nodeCols,
		nodeSizeMode:
			(lookup("nodeSizeMode") as NodeSizeMode | undefined) ??
			defaults.nodeSizeMode,
	};
}

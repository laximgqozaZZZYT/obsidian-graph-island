/**
 * panel-sections-nodes-tab-tree.ts
 *
 * Pure (DOM-independent) directory-tree helpers extracted from
 * `panel-sections-nodes-tab.ts`. Building / counting / collecting on the
 * `DirNode` structure is purely structural — no Obsidian or DOM imports —
 * so unit tests can exercise it directly without `tests/__mocks__/obsidian.ts`.
 */
import type { NodeTreeEntry } from "./PanelBuilder";

export interface DirNode {
	children: Map<string, DirNode>;
	files: NodeTreeEntry[];
}

/**
 * Build a directory tree from a flat list of file entries.
 * Path is split by "/"; the final segment (filename) is dropped and each
 * file is attached to the leaf directory it lives in. Files at the root
 * (paths with no "/") attach to the returned root node directly.
 */
export function buildDirTree(entries: NodeTreeEntry[]): DirNode {
	const root: DirNode = { children: new Map(), files: [] };
	for (const entry of entries) {
		const parts = entry.path.split("/");
		parts.pop();
		let cur = root;
		for (const dir of parts) {
			if (!cur.children.has(dir)) cur.children.set(dir, { children: new Map(), files: [] });
			cur = cur.children.get(dir)!;
		}
		cur.files.push(entry);
	}
	return root;
}

/** Recursive count of files in a directory and all its subdirectories. */
export function countFiles(dir: DirNode): number {
	let count = dir.files.length;
	for (const child of dir.children.values()) count += countFiles(child);
	return count;
}

/** Recursive collection of all file IDs contained anywhere in a directory tree. */
export function collectDirIds(dir: DirNode): string[] {
	const ids: string[] = dir.files.map((f) => f.id);
	for (const child of dir.children.values()) ids.push(...collectDirIds(child));
	return ids;
}

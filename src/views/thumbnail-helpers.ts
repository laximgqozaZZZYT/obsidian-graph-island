import { TFile, type Vault } from "obsidian";

export function extractFrontmatterImage(
	meta: Record<string, unknown> | undefined,
): string | null {
	const imgPath = meta?.image ?? meta?.thumbnail ?? meta?.cover;
	if (!imgPath || typeof imgPath !== "string") return null;
	return imgPath;
}

export function isNodeOnScreen(
	sx: number,
	sy: number,
	vw: number,
	vh: number,
	margin: number,
): boolean {
	return (
		sx >= -margin && sx <= vw + margin && sy >= -margin && sy <= vh + margin
	);
}

export function createThumbnailClone(
	img: HTMLImageElement,
	sx: number,
	sy: number,
	size: number,
): HTMLImageElement {
	const clone = new Image();
	clone.src = img.src;
	clone.className = "gi-node-thumbnail";
	clone.style.width = `${size}px`;
	clone.style.height = `${size}px`;
	clone.style.left = `${sx - size / 2}px`;
	clone.style.top = `${sy - size / 2}px`;
	return clone;
}

export function resolveThumbnailUrl(
	path: string,
	vault: Vault,
): string | null {
	if (path.startsWith("http://") || path.startsWith("https://")) return path;
	const tf = vault.getAbstractFileByPath(path);
	if (tf instanceof TFile) return vault.getResourcePath(tf);
	const cleanPath = path.replace(/^\/+/, "");
	const tf2 = vault.getAbstractFileByPath(cleanPath);
	if (tf2 instanceof TFile) return vault.getResourcePath(tf2);
	return null;
}

import type { DirectionalGravityRule } from "../types";

export { matchesFilter } from "../utils/filter-match";

/**
 * Convert a direction preset or radian value to radians.
 */
export function resolveDirection(dir: DirectionalGravityRule["direction"]): number {
	if (typeof dir === "number") return dir;
	switch (dir) {
		case "top":
			return -Math.PI / 2;
		case "bottom":
			return Math.PI / 2;
		case "left":
			return Math.PI;
		case "right":
			return 0;
	}
}

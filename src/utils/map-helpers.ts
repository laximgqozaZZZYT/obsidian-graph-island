/**
 * Common Map collection helpers to eliminate repetitive get-or-create patterns.
 */

/** Get or create an array entry in a Map, then push a value. */
export function pushToMapArray<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	if (!map.has(key)) map.set(key, []);
	map.get(key)!.push(value);
}

/** Get or create a Set entry in a Map, then add a value. */
export function addToMapSet<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
	if (!map.has(key)) map.set(key, new Set());
	map.get(key)!.add(value);
}

/**
 * Get or create an array entry in a Map (returns the array for chaining).
 */
export function getOrCreateArray<K, V>(map: Map<K, V[]>, key: K): V[] {
	if (!map.has(key)) map.set(key, []);
	return map.get(key)!;
}

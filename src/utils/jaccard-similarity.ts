/**
 * Jaccard similarity coefficient: |A ∩ B| / |A ∪ B|.
 *
 * Returns 0 when both inputs are empty (guards against NaN from 0/0).
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 && b.size === 0) return 0;

	let intersectionSize = 0;
	const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
	for (const value of smaller) {
		if (larger.has(value)) intersectionSize++;
	}

	const unionSize = a.size + b.size - intersectionSize;
	if (unionSize === 0) return 0;

	return intersectionSize / unionSize;
}

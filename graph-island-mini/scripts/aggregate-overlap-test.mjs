// Repro test: aggregate stack badge must NEVER land inside a multi-cell
// card's footprint, even when the badge's centroid falls in the middle of
// that card. Mirrors the view.ts aggregate-snap logic against a synthetic
// laid-out graph.

const SLOT_W = 136;
const SLOT_H = 36.267;

// Big card (scale 5, 5×5 footprint) centred at world (33+2.5, 90+2.5) slot.
const bigCard = {
	id: "guan-yu",
	width: 5 * SLOT_W - 16,
	height: 5 * SLOT_H - 4.267,
	x: (30 + 2.5) * SLOT_W,
	y: (87 + 2.5) * SLOT_H,
};

// 19 trulyAgg warriors scattered AROUND the big card; their centroid
// happens to land near the big card's centre.
const warriors = [];
for (let i = 0; i < 19; i++) {
	const angle = (i / 19) * Math.PI * 2;
	warriors.push({
		id: `warrior-${i}`,
		x: bigCard.x + Math.cos(angle) * 200,
		y: bigCard.y + Math.sin(angle) * 100,
		width: SLOT_W - 16,
		height: SLOT_H - 4.267,
	});
}

// Replicate view.ts occupied-set construction
const occupied = new Set();
const reserve = (n) => {
	const colSpan = Math.max(1, Math.ceil(n.width / SLOT_W));
	const rowSpan = Math.max(1, Math.ceil(n.height / SLOT_H));
	const startCol = Math.round(n.x / SLOT_W - colSpan / 2);
	const startRow = Math.round(n.y / SLOT_H - rowSpan / 2);
	for (let dc = 0; dc < colSpan; dc++) {
		for (let dr = 0; dr < rowSpan; dr++) {
			occupied.add(`${startCol + dc},${startRow + dr}`);
		}
	}
};
reserve(bigCard);
// Warriors are trulyAgg → NOT reserved (per view.ts logic).

// Centroid → cell
const sx = warriors.reduce((s, w) => s + w.x, 0);
const sy = warriors.reduce((s, w) => s + w.y, 0);
const cx = sx / warriors.length;
const cy = sy / warriors.length;
let col = Math.floor(cx / SLOT_W);
let row = Math.floor(cy / SLOT_H);
console.log(`Centroid: x=${cx.toFixed(1)}, y=${cy.toFixed(1)} → initial cell (${col}, ${row})`);

// Spiral
let key = `${col},${row}`;
let radiusFound = 0;
if (occupied.has(key)) {
	outer: for (let radius = 1; radius < 128; radius++) {
		for (let dc = -radius; dc <= radius; dc++) {
			for (let dr = -radius; dr <= radius; dr++) {
				if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
				const k2 = `${col + dc},${row + dr}`;
				if (!occupied.has(k2)) {
					col += dc;
					row += dr;
					key = k2;
					radiusFound = radius;
					break outer;
				}
			}
		}
	}
}
console.log(`Final cell: (${col}, ${row}) [spiral radius=${radiusFound}]`);

// Is it inside bigCard's footprint?
const bigStartCol = Math.round(bigCard.x / SLOT_W - 5 / 2);
const bigEndCol = bigStartCol + 4;
const bigStartRow = Math.round(bigCard.y / SLOT_H - 5 / 2);
const bigEndRow = bigStartRow + 4;
console.log(`bigCard footprint: cols [${bigStartCol}, ${bigEndCol}], rows [${bigStartRow}, ${bigEndRow}]`);
const inside =
	col >= bigStartCol &&
	col <= bigEndCol &&
	row >= bigStartRow &&
	row <= bigEndRow;
if (inside) {
	console.log(`FAIL: badge inside bigCard footprint`);
	process.exit(1);
}
console.log(`OK: badge outside bigCard`);
process.exit(0);

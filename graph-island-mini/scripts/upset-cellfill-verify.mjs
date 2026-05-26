// Verify the BASELINE invariant: a default 1×1 NODE_DISPLAY card fills
// EXACTLY one grid cell (区画) in UpSet — width = cellW, height = cellH,
// slot = cell + channel (隘路). Regression guard for "1×1 node tiny inside
// an over-sized slot". (Mixed 1×1 + size-scaled coexistence is covered by
// upset-mixed-size-verify.mjs.)
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "gim-"));
const bundlePath = join(tmp, "layout.cjs");
await esbuild.build({
	entryPoints: [join(root, "src/layout.ts")],
	bundle: true, platform: "node", format: "cjs", outfile: bundlePath, logLevel: "warning",
});
const { layout } = await import(bundlePath);

const CARD_CELL_W = 120;
const CARD_CELL_H = 32;
const data = { nodes: [], edges: [] };
const sigs = [["a"], ["a", "b"], ["b", "c"]];
let k = 0;
for (const sig of sigs) {
	for (let i = 0; i < 4; i++) {
		data.nodes.push({ id: `n${k++}.md`, label: `n${k}`, memberships: [...sig] });
	}
}
// All default 1×1 (= one canonical cell).
const sized = data.nodes.map((n) => ({ ...n, width: CARD_CELL_W, height: CARD_CELL_H }));

const nodeSpacing = 22;
const laid = layout(data, sized, {
	clusterSpacing: 48, nodeSpacing, cellW: CARD_CELL_W, cellH: CARD_CELL_H, viewMode: "upset",
});

const channel = Math.max(24, Math.floor(nodeSpacing * 1.5));
let fail = 0;
console.log(`slotW=${laid.slotW} slotH=${laid.slotH} channelW=${laid.channelW} channelH=${laid.channelH}`);
if (laid.slotW !== CARD_CELL_W + channel) { console.error(`✗ slotW ${laid.slotW} ≠ ${CARD_CELL_W + channel}`); fail++; }
if (laid.slotH !== CARD_CELL_H + channel) { console.error(`✗ slotH ${laid.slotH} ≠ ${CARD_CELL_H + channel}`); fail++; }
if (laid.channelW !== channel) { console.error(`✗ channelW (隘路) ${laid.channelW} ≠ ${channel}`); fail++; }
if (laid.channelH !== channel) { console.error(`✗ channelH (隘路) ${laid.channelH} ≠ ${channel}`); fail++; }
for (const n of laid.nodes) {
	if (n.width !== CARD_CELL_W) { console.error(`✗ ${n.id}: width ${n.width} ≠ cell ${CARD_CELL_W}`); fail++; }
	if (n.height !== CARD_CELL_H) { console.error(`✗ ${n.id}: height ${n.height} ≠ cell ${CARD_CELL_H}`); fail++; }
}
const kuukakuW = laid.slotW - laid.channelW;
const kuukakuH = laid.slotH - laid.channelH;
if (kuukakuW !== CARD_CELL_W || kuukakuH !== CARD_CELL_H) { console.error(`✗ 区画 ${kuukakuW}×${kuukakuH} ≠ cell`); fail++; }
console.log(`区画 (cell enclosed by 隘路) = ${kuukakuW}×${kuukakuH}; every 1×1 card = ${CARD_CELL_W}×${CARD_CELL_H}`);
if (fail === 0) console.log("✓ PASS — every default 1×1 card fills exactly one grid 区画; 隘路 framing intact");
else { console.error(`✗ ${fail} assertion(s) failed`); process.exit(1); }

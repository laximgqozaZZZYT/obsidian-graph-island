// Verify the grid (cell), 隘路 (channel) AND node all scale proportionally
// with the Min font size setting, in BOTH Euler and UpSet. minFontScale =
// max(1, minFontPx / 12), so 12→1× and 24→2×; below 12 stays flat (the
// native 12px font can't shrink, so the cell mustn't either).
import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tmp = mkdtempSync(join(tmpdir(), "gim-"));
const bundlePath = join(tmp, "layout.cjs");
await esbuild.build({ entryPoints: [join(root, "src/layout.ts")], bundle: true, platform: "node", format: "cjs", outfile: bundlePath, logLevel: "warning" });
const { layout } = await import(bundlePath);

const BASE_W = 120, BASE_H = 32, nodeSpacing = 22;
const minFontScale = (mfp) => (!mfp || mfp <= 12 ? 1 : mfp / 12);

// Build a small graph; sized[] mirrors what cardFor would emit for 1×1 at
// the given font scale (width = cellW*fs).
function run(viewMode, mfp) {
	const fs = minFontScale(mfp);
	const data = { nodes: [], edges: [] };
	for (const sig of [["a"], ["a", "b"], ["b"]])
		for (let i = 0; i < 3; i++) data.nodes.push({ id: `${sig.join("")}_${i}.md`, label: "x", memberships: [...sig] });
	const sized = data.nodes.map((n) => ({ ...n, width: BASE_W * fs, height: BASE_H * fs }));
	const laid = layout(data, sized, {
		clusterSpacing: 48, nodeSpacing,
		cellW: BASE_W * fs, cellH: BASE_H * fs, minFontPx: mfp, viewMode,
	});
	return { fs, slotW: laid.slotW, slotH: laid.slotH, channelW: laid.channelW, channelH: laid.channelH, w: laid.nodes[0].width, h: laid.nodes[0].height };
}

let fail = 0;
const near = (a, b) => Math.abs(a - b) < 1e-6;
for (const viewMode of ["euler", "upset"]) {
	const a = run(viewMode, 12); // fs 1
	const b = run(viewMode, 24); // fs 2
	console.log(`[${viewMode}] mfp12: slot ${a.slotW}×${a.slotH} ch ${a.channelW} card ${a.w}×${a.h}`);
	console.log(`[${viewMode}] mfp24: slot ${b.slotW}×${b.slotH} ch ${b.channelW} card ${b.w}×${b.h}`);
	// Everything must double from 12→24.
	for (const [k, av, bv] of [["slotW", a.slotW, b.slotW], ["slotH", a.slotH, b.slotH], ["channelW", a.channelW, b.channelW], ["channelH", a.channelH, b.channelH], ["cardW", a.w, b.w], ["cardH", a.h, b.h]]) {
		if (!near(bv, av * 2)) { console.error(`✗ [${viewMode}] ${k}: ${av} → ${bv} (expected ×2 = ${av * 2})`); fail++; }
	}
	// channel must actually scale (not stay at the unscaled floor 33).
	if (!near(b.channelW, 33 * 2)) { console.error(`✗ [${viewMode}] channelW ${b.channelW} ≠ 66 (隘路 not scaled)`); fail++; }
	// Below the native font, layout stays flat: mfp 6 == mfp 12.
	const lo = run(viewMode, 6);
	if (!near(lo.slotW, a.slotW)) { console.error(`✗ [${viewMode}] mfp6 slotW ${lo.slotW} ≠ mfp12 ${a.slotW} (should clamp flat)`); fail++; }
}
if (fail === 0) console.log("✓ PASS — cell + 隘路 + node all scale ∝ Min font size (×2 at 24), flat ≤12, Euler & UpSet");
else { console.error(`✗ ${fail} failure(s)`); process.exit(1); }

import esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
const here = dirname(fileURLToPath(import.meta.url));
const root = "/home/ubuntu/obsidian-plugins/obsidian-graph-island/graph-island-mini";
const tmp = mkdtempSync(join(tmpdir(), "gim-mt-"));
const bundlePath = join(tmp, "layout.cjs");
await esbuild.build({
  entryPoints: [join(root, "src/layout.ts")],
  bundle: true, platform: "node", format: "cjs", outfile: bundlePath, logLevel: "warning",
});
const { layout } = await import(bundlePath);

// Simulate user scenario: scene cluster with ~30 members, half scene-only, half multi-tag
const data = { nodes: [], edges: [] };
const tags = ["scene", "talk", "drama", "character", "concept"];
// Scene-only: 15 members
for (let i = 0; i < 15; i++) data.nodes.push({ id: `s/${i}.md`, label: `s${i}`, memberships: ["scene"] });
// scene + each other tag: 4 members each
for (const t of tags.slice(1)) {
  for (let i = 0; i < 4; i++) data.nodes.push({ id: `s${t}/${i}.md`, label: `s${t}${i}`, memberships: ["scene", t] });
}
// Other-tag only: 10 members each (so they have anchors)
for (const t of tags.slice(1)) {
  for (let i = 0; i < 10; i++) data.nodes.push({ id: `${t}/${i}.md`, label: `${t}${i}`, memberships: [t] });
}

const sized = data.nodes.map((n) => ({ ...n, width: 120, height: 32 }));
const laid = layout(data, sized, { clusterSpacing: 80, nodeSpacing: 16, cellW: 120, cellH: 32 });

// Find scene cluster's positioned members and report cell ranges
const scenePositions = laid.nodes.filter((n) => n.memberships.includes("scene"));
const sceneCells = scenePositions.map((n) => ({
  x: n.x, y: n.y,
  col: Math.round(n.x / laid.slotW - 0.5),
  row: Math.round(n.y / laid.slotH - 0.5),
  membs: n.memberships.join("+"),
}));
sceneCells.sort((a, b) => a.col - b.col || a.row - b.row);
const colMin = Math.min(...sceneCells.map(c => c.col));
const colMax = Math.max(...sceneCells.map(c => c.col));
const rowMin = Math.min(...sceneCells.map(c => c.row));
const rowMax = Math.max(...sceneCells.map(c => c.row));
console.log(`scene members: ${scenePositions.length}`);
console.log(`scene bbox: cols [${colMin}, ${colMax}] (${colMax-colMin+1} wide), rows [${rowMin}, ${rowMax}] (${rowMax-rowMin+1} tall)`);
console.log(`Cells/range = ${scenePositions.length}/${(colMax-colMin+1)*(rowMax-rowMin+1)} = ${(100*scenePositions.length/((colMax-colMin+1)*(rowMax-rowMin+1))).toFixed(0)}% density`);
// Print col distribution
const byCol = new Map();
for (const c of sceneCells) {
  const k = `col ${c.col}`;
  byCol.set(k, (byCol.get(k) ?? 0) + 1);
}
console.log(`Column distribution:`);
const keys = [...byCol.keys()].sort();
for (const k of keys) console.log(`  ${k}: ${byCol.get(k)} cards`);

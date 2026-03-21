import esbuild from "esbuild";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const prod = process.argv[2] === "production";
const watch = process.argv[2] === "watch";

// Pre-build TypeScript type check (catches isDark/_ctx-style undefined var bugs)
if (prod) {
  try {
    execFileSync("npx", ["tsc", "--noEmit"], { stdio: "pipe" });
    console.log("✓ TypeScript type check passed");
  } catch (e) {
    console.error("✗ TypeScript errors found:");
    console.error(e.stdout?.toString() || e.stderr?.toString() || "Unknown error");
    process.exit(1);
  }
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view"],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  define: {
    "process.env.PLUGIN_VERSION": JSON.stringify(manifest.version),
  },
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}

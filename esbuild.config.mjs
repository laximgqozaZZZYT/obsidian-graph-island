import esbuild from "esbuild";
import { readFileSync } from "fs";

const prod = process.argv[2] === "production";
const watch = process.argv[2] === "watch";

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

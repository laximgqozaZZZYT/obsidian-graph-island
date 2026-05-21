#!/usr/bin/env python3
"""Enable graph-island-mini, open the view, capture a screenshot via CDP."""

import base64
import json
import sys
import time
import urllib.request
import websocket


CDP = "http://localhost:9222"


def get_main_page():
	with urllib.request.urlopen(f"{CDP}/json") as r:
		pages = json.load(r)
	for p in pages:
		if p.get("type") == "page" and "obsidian" in (p.get("url") or "").lower():
			return p
	for p in pages:
		if p.get("type") == "page":
			return p
	raise RuntimeError("no obsidian page in CDP listing")


class Cdp:
	def __init__(self, ws_url):
		self.ws = websocket.create_connection(ws_url, timeout=15)
		self.id = 0

	def send(self, method, params=None):
		self.id += 1
		msg = {"id": self.id, "method": method, "params": params or {}}
		self.ws.send(json.dumps(msg))
		while True:
			frame = json.loads(self.ws.recv())
			if frame.get("id") == self.id:
				if "error" in frame:
					raise RuntimeError(f"{method}: {frame['error']}")
				return frame.get("result", {})

	def run(self, expr, await_promise=False):
		r = self.send("Runtime.evaluate", {
			"expression": expr,
			"returnByValue": True,
			"awaitPromise": await_promise,
		})
		if "exceptionDetails" in r:
			raise RuntimeError(json.dumps(r["exceptionDetails"]))
		return r.get("result", {}).get("value")


def main():
	page = get_main_page()
	print(f"page: {page['title']}")
	cdp = Cdp(page["webSocketDebuggerUrl"])

	cdp.send("Runtime.enable")
	cdp.send("Page.enable")

	vault = cdp.run("app.vault.adapter.basePath")
	print(f"active vault: {vault}")

	plugins = cdp.run("Object.keys(app.plugins.manifests)")
	print(f"manifest known: graph-island-mini in plugins = {('graph-island-mini' in (plugins or []))}")

	if "graph-island-mini" not in (plugins or []):
		print("loading manifests...")
		cdp.run("(async () => { await app.plugins.loadManifests(); })()", await_promise=True)
		plugins = cdp.run("Object.keys(app.plugins.manifests)")
		print(f"after reload: in plugins = {('graph-island-mini' in (plugins or []))}")

	enabled = cdp.run("!!app.plugins.plugins['graph-island-mini']")
	print(f"enabled (before): {enabled}")

	if not enabled:
		cdp.run("(async () => { await app.plugins.enablePlugin('graph-island-mini'); })()", await_promise=True)
		print("enabled.")
	else:
		cdp.run("(async () => { await app.plugins.disablePlugin('graph-island-mini'); await app.plugins.enablePlugin('graph-island-mini'); })()", await_promise=True)
		print("re-enabled.")

	enabled = cdp.run("!!app.plugins.plugins['graph-island-mini']")
	print(f"enabled (after): {enabled}")
	if not enabled:
		print("FAIL: plugin did not enable")
		sys.exit(1)

	cdp.run(
		"(async () => { const p = app.plugins.plugins['graph-island-mini']; await p.activateView(); })()",
		await_promise=True,
	)
	time.sleep(1.5)

	leaves = cdp.run(
		"app.workspace.getLeavesOfType('graph-island-mini').length",
	)
	print(f"mini leaves: {leaves}")

	r = cdp.send("Page.captureScreenshot", {"format": "png"})
	out = "/tmp/graph-island-mini-verify.png"
	with open(out, "wb") as f:
		f.write(base64.b64decode(r["data"]))
	print(f"screenshot: {out}")


if __name__ == "__main__":
	main()

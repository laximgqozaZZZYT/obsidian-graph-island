// Probe via Node's built-in WebSocket (Node 22+)
const r = await fetch('http://localhost:9222/json');
const targets = await r.json();
const t = targets.find(x => x.url && x.url.includes('app://obsidian.md'));
if (!t) { console.error('No target', targets.map(x => x.url)); process.exit(1); }

const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 1;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

function send(method, params) {
  return new Promise((resolve) => {
    const myId = id++;
    pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

await new Promise(r => ws.addEventListener('open', r, { once: true }));

const code = `(async () => {
  const v = window.app.workspace.getLeavesOfType("graph-view")
    .find(l => "pixiNodes" in l.view)?.view;
  if (!v) return { error: 'no view' };

  const snap = {
    showOrphans: v.panel.showOrphans,
    showAttachments: v.panel.showAttachments,
    existingOnly: v.panel.existingOnly,
    includeTagsInData: v.panel.includeTagsInData,
    showTagNodes: v.panel.showTagNodes,
    tagDisplay: v.panel.tagDisplay,
    groupBy: v.panel.groupBy,
    viewMode: v.panel.viewMode,
    searchQuery: v.panel.searchQuery,
    minDegreeFilter: v.panel.minDegreeFilter,
    maxDegreeFilter: v.panel.maxDegreeFilter,
    subgraphNodeIds_len: v.panel.subgraphNodeIds && v.panel.subgraphNodeIds.length,
    excludeNodes_len: v.panel.excludeNodes && v.panel.excludeNodes.length,
    localGraphCenter: v.panel.localGraphCenter,
    collapsedGroups_size: v.panel.collapsedGroups && v.panel.collapsedGroups.size,
  };

  const vaultMd = window.app.vault.getMarkdownFiles().length;
  const basePath = window.app.vault.adapter.basePath;

  v.panel.showOrphans = true;
  v.rawData = null;
  await v.doRender();
  await new Promise(r => setTimeout(r, 2000));
  const test = v.getGraphData();
  const testCount = { nodes: test ? test.nodes.length : 0, edges: test ? test.edges.length : 0 };

  const rd = v.rawData ? { nodes: v.rawData.nodes.length, edges: v.rawData.edges.length } : null;
  const tagNodes = v.rawData ? v.rawData.nodes.filter(n => n.isTag).length : 0;
  const fileNodes = v.rawData ? v.rawData.nodes.filter(n => !n.isTag).length : 0;

  return { snap, vaultMd, basePath, testCount, rd, tagNodes, fileNodes };
})()`;

const result = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
console.log(JSON.stringify(result.result, null, 2));
ws.close();

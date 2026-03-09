import { chromium } from 'playwright';

// Replicate the exact grouping logic from cluster-force.ts to see
// what groups are produced after pipeline + merge + hierarchy detection.

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!page) { console.log('No page'); process.exit(1); }

  const result = await page.evaluate(() => {
    const leaves = app.workspace.getLeavesOfType('graph-view');
    if (!leaves.length) return { error: 'no leaf' };
    const view = leaves[0].view;
    const data = view.rawData;
    if (!data) return { error: 'no rawData' };

    const nodes = data.nodes || [];
    const edges = view.graphEdges || data.edges || [];

    // Step 1: partitionNodes by tag (first tag)
    const tagGroups = new Map();
    for (const n of nodes) {
      const key = (n.tags && n.tags.length > 0) ? n.tags[0] : '__untagged__';
      if (!tagGroups.has(key)) tagGroups.set(key, []);
      tagGroups.get(key).push(n);
    }

    // Step 2: splitByConnectedComponents
    function splitCC(groups) {
      const result = new Map();
      for (const [key, members] of groups) {
        if (members.length <= 1) { result.set(key, members); continue; }
        const idSet = new Set(members.map(n => n.id));
        const adj = new Map();
        for (const id of idSet) adj.set(id, []);
        for (const e of edges) {
          const sid = typeof e.source === 'string' ? e.source : e.source.id;
          const tid = typeof e.target === 'string' ? e.target : e.target.id;
          if (idSet.has(sid) && idSet.has(tid)) {
            adj.get(sid).push(tid);
            adj.get(tid).push(sid);
          }
        }
        const visited = new Set();
        const nodeMap = new Map(members.map(n => [n.id, n]));
        let compIdx = 0;
        for (const n of members) {
          if (visited.has(n.id)) continue;
          const comp = [];
          const queue = [n.id];
          visited.add(n.id);
          while (queue.length > 0) {
            const cur = queue.shift();
            comp.push(nodeMap.get(cur));
            for (const nb of adj.get(cur) || []) {
              if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
            }
          }
          const subKey = compIdx === 0 ? key : `${key}::${compIdx}`;
          result.set(subKey, comp);
          compIdx++;
        }
      }
      return result;
    }

    // Step 3: Apply rule (tag, recursive=true)
    let groups = new Map([['__all__', [...nodes]]]);
    const subGroups = new Map();
    for (const [parentKey, members] of groups) {
      const partitioned = new Map();
      for (const n of members) {
        const key = (n.tags && n.tags.length > 0) ? n.tags[0] : '__untagged__';
        if (!partitioned.has(key)) partitioned.set(key, []);
        partitioned.get(key).push(n);
      }
      const finalSubs = splitCC(partitioned);
      for (const [subKey, subMembers] of finalSubs) {
        const compositeKey = parentKey === '__all__' ? subKey : `${parentKey}|${subKey}`;
        subGroups.set(compositeKey, subMembers);
      }
    }
    groups = subGroups;

    const beforeMerge = [];
    for (const [key, members] of groups) {
      beforeMerge.push({ key, size: members.length });
    }
    beforeMerge.sort((a, b) => b.size - a.size);

    // Step 4: Merge tiny groups
    const minGroupSize = nodes.length >= 100 ? Math.max(3, Math.ceil(nodes.length * 0.005)) : 2;
    const merged = new Map();
    let otherNodes = [];
    for (const [key, members] of groups) {
      if (members.length < minGroupSize) {
        otherNodes = otherNodes.concat(members);
      } else {
        merged.set(key, members);
      }
    }
    if (otherNodes.length > 0) merged.set('__other__', otherNodes);
    groups = merged;

    const afterMerge = [];
    for (const [key, members] of groups) {
      afterMerge.push({ key, size: members.length });
    }
    afterMerge.sort((a, b) => b.size - a.size);

    // Step 5: Hierarchy detection
    const parentMap = new Map();
    for (const key of groups.keys()) {
      const parent = key.replace(/::.*$/, '');
      if (!parentMap.has(parent)) parentMap.set(parent, []);
      parentMap.get(parent).push(key);
    }
    const hierarchy = [];
    for (const [parent, children] of parentMap) {
      hierarchy.push({ parent, childCount: children.length, children: children.slice(0, 10) });
    }

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      minGroupSize,
      beforeMerge: {
        count: beforeMerge.length,
        top20: beforeMerge.slice(0, 20),
        singletons: beforeMerge.filter(g => g.size === 1).length,
        tinyGroups: beforeMerge.filter(g => g.size < minGroupSize).length,
      },
      afterMerge: {
        count: afterMerge.length,
        all: afterMerge,
      },
      hierarchy,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });

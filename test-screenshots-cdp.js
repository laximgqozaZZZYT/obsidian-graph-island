const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function connectCDP(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();

    ws.on('open', () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const myId = id++;
          pending.set(myId, { res, rej });
          try {
            ws.send(JSON.stringify({ id: myId, method, params }));
          } catch (e) {
            rej(e);
          }
        });
      },
      close() { ws.close(); }
    }));

    ws.on('message', (msg) => {
      try {
        const r = JSON.parse(msg);
        if (r.id && pending.has(r.id)) {
          const { res } = pending.get(r.id);
          pending.delete(r.id);
          res(r);
        }
      } catch (e) {
        console.error('Message parse error:', e);
      }
    });

    ws.on('error', reject);
  });
}

async function main() {
  console.log('Fetching CDP targets...');
  const targets = await getTargets();
  const target = targets.find(t => t.type === 'page') || targets[0];

  if (!target) {
    console.error('No CDP target found');
    process.exit(1);
  }

  console.log('Connecting to:', target.title || target.url);
  const cdp = await connectCDP(target.webSocketDebuggerUrl);

  const outDir = '/home/ubuntu/obsidian-plugins/obsidian-graph-island/debug-screenshots';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Helper: evaluate JS in Obsidian
  async function evaluate(expr, args = undefined) {
    const params = {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    };
    if (args !== undefined) {
      params.expression = `(${expr})(${JSON.stringify(args)})`;
    }
    const r = await cdp.send('Runtime.evaluate', params);
    if (r.exceptionDetails) {
      console.error('Evaluation exception:', r.exceptionDetails.text);
      throw new Error(r.exceptionDetails.text);
    }
    const result = r.result?.result?.value;
    // If result is still an object but doesn't have the expected properties,
    // it might be because returnByValue=true didn't work - return raw object
    if (result === undefined && r.result?.result) {
      return r.result.result;
    }
    return result;
  }

  // Helper: take screenshot
  async function screenshot(name) {
    await new Promise(r => setTimeout(r, 2000)); // Wait for render
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.result.data, 'base64');
    const filePath = path.join(outDir, `${name}.png`);
    fs.writeFileSync(filePath, buf);
    console.log(`Screenshot saved: ${filePath}`);
    return filePath;
  }

  try {
    // Step 1: Open graph view if not open
    console.log('\nStep 1: Opening graph view...');
    await evaluate(`async () => {
      const app = window.app;
      if (!app) throw new Error('app not available');
      const leaves = app.workspace.getLeavesOfType('graph-view');
      if (leaves.length === 0) {
        console.log('Opening graph view...');
        await app.commands.executeCommandById('graph-island:open-graph-view');
        await new Promise(r => setTimeout(r, 4000));
      }
      return 'graph view ready';
    }`);

    // Step 2: Wait for view to be fully initialized
    console.log('Step 2: Waiting for view initialization...');
    let viewReady = false;
    for (let i = 0; i < 10; i++) {
      const result = await evaluate(`() => {
        const leaves = window.app.workspace.getLeavesOfType('graph-view');
        if (leaves.length === 0) return { ready: false, reason: 'no leaf' };
        const view = leaves[0].view;
        if (!view) return { ready: false, reason: 'no view' };
        if (!view.panel) return { ready: false, reason: 'no panel' };
        window.__giView = view;
        return { ready: true, reason: 'ok' };
      }`);
      if (result?.ready) {
        viewReady = true;
        console.log('View is ready');
        break;
      }
      console.log(`  Attempt ${i + 1}/10: ${result?.reason || 'unknown'}`);
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!viewReady) {
      throw new Error('View initialization timeout');
    }

    // Step 3: Load preset files and take screenshots
    const presets = [
      { file: '01-panorama-overview.json', name: 'preset01-grid' },
      { file: '02-dense-cluster.json', name: 'preset02-concentric' },
      { file: '03-character-network.json', name: 'preset03-character' },
      { file: '05-tree-hierarchy.json', name: 'preset05-tree' },
      { file: '09-minimalist.json', name: 'preset09-minimalist' },
    ];

    for (const preset of presets) {
      console.log(`\nApplying preset: ${preset.name} (${preset.file})...`);

      const result = await evaluate(`(presetFile) => {
        const view = window.__giView;
        if (!view) return { error: 'no view' };
        if (!view.plugin) return { error: 'no plugin' };

        const pluginDir = view.plugin.manifest.dir;
        const presetPath = pluginDir + '/samples/' + presetFile;

        return { presetPath };
      }`, preset.file);

      if (result?.error) {
        console.log(`  Warning: ${result.error}, skipping`);
        continue;
      }

      // Load and apply preset
      const applyResult = await evaluate(`(presetFile) => {
        return new Promise(async (resolve) => {
          try {
            const view = window.__giView;
            const pluginDir = view.plugin.manifest.dir;
            const presetPath = pluginDir + '/samples/' + presetFile;
            const adapter = window.app.vault.adapter;

            const exists = await adapter.exists(presetPath);
            if (!exists) {
              return resolve({ error: 'preset not found: ' + presetPath });
            }

            const json = await adapter.read(presetPath);
            const config = JSON.parse(json);

            // Apply preset settings
            if (config.panel) {
              Object.assign(view.panel, config.panel);
              // Handle collapsedGroups specially
              if (config.panel.collapsedGroups) {
                view.panel.collapsedGroups = new Set(config.panel.collapsedGroups || []);
              }
            }

            // Trigger re-render
            view._roadNetworkFinalized = false;
            view.roadNetworkData = null;
            if (view.buildPanel) view.buildPanel();
            if (view.updateForces) view.updateForces(true);

            await new Promise(r => setTimeout(r, 5000));
            resolve({ success: true, config: config.panel });
          } catch(e) {
            resolve({ error: e.message });
          }
        });
      }`, preset.file);

      if (applyResult?.error) {
        console.log(`  Error applying preset: ${applyResult.error}`);
        continue;
      }

      console.log(`  Preset applied, taking screenshot...`);
      await screenshot(preset.name);
    }

    // Also take a screenshot of current state
    console.log('\nTaking final screenshot of current state...');
    await screenshot('final-state');

    console.log('\nDone! Screenshots saved to:', outDir);
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
    console.log(`Total screenshots: ${files.length}`);
    files.forEach(f => console.log(`  - ${f}`));

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    cdp.close();
  }
}

main().catch(console.error);

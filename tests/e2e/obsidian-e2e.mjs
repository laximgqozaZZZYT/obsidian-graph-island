import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const obsPage = ctx.pages().find(p => p.url().includes('obsidian'));
  if (!obsPage) { console.error('No page'); process.exit(1); }
  
  console.log('=== E2E Test: Graph Views Plugin ===\n');
  
  // Step 0: List all tab types to find our plugin's view
  const allTabs = await obsPage.evaluate(() => {
    const tabs = document.querySelectorAll('.workspace-tab-header');
    return Array.from(tabs).map(t => ({
      label: t.getAttribute('aria-label'),
      dataType: t.getAttribute('data-type'),
      active: t.classList.contains('is-active'),
    }));
  });
  console.log('All tabs:', JSON.stringify(allTabs, null, 2));
  
  // Find and click our plugin tab (data-type="graph-view")
  let activated = await obsPage.evaluate(() => {
    const tab = document.querySelector('.workspace-tab-header[data-type="graph-view"]');
    if (tab) { tab.click(); return 'clicked existing tab'; }
    return null;
  });
  
  if (!activated) {
    // Plugin view not open — open it via command palette
    console.log('Graph Views tab not found. Opening via command palette...');
    
    // Trigger command palette with Ctrl+P
    await obsPage.keyboard.press('Control+p');
    await obsPage.waitForTimeout(500);
    
    // Type command to open our view
    await obsPage.keyboard.type('Graph Views', { delay: 50 });
    await obsPage.waitForTimeout(500);
    
    const cmdResult = await obsPage.evaluate(() => {
      const suggestions = document.querySelectorAll('.suggestion-item');
      for (const s of suggestions) {
        const text = s.textContent?.trim();
        if (text?.includes('Graph Views')) {
          s.click();
          return `Clicked: ${text}`;
        }
      }
      return `No match. Suggestions: ${Array.from(suggestions).map(s => s.textContent?.trim()).join(', ')}`;
    });
    console.log('Command palette:', cmdResult);
    await obsPage.waitForTimeout(2000);
    
    // Press Escape in case command palette is still open
    await obsPage.keyboard.press('Escape');
    await obsPage.waitForTimeout(500);
  } else {
    console.log(activated);
    await obsPage.waitForTimeout(2000);
  }
  
  await obsPage.screenshot({ path: 'tests/e2e/screenshots/01-graph-view.png' });
  
  // Step 1: Check if panel is visible (our plugin shows it via settings gear or it's always visible)
  const viewCheck = await obsPage.evaluate(() => {
    // Our plugin's container class
    const container = document.querySelector('.graph-container');
    if (!container) {
      // Check if there's a leaf with our data-type
      const leaf = document.querySelector('[data-type="graph-view"]');
      return { 
        found: false,
        hasLeaf: !!leaf,
        leafHTML: leaf?.innerHTML?.substring(0, 500),
        activeLeaf: document.querySelector('.workspace-leaf.mod-active .workspace-leaf-content')?.getAttribute('data-type'),
      };
    }
    
    const panel = container.querySelector('.graph-controls');
    const sections = container.querySelectorAll('.graph-control-section');
    const status = container.querySelector('.graph-status')?.textContent;
    
    return {
      found: true,
      hasPanel: !!panel,
      panelVisible: panel ? getComputedStyle(panel).display !== 'none' : false,
      sectionCount: sections.length,
      sectionNames: Array.from(sections).map(s => s.querySelector('.tree-item-inner')?.textContent?.trim()),
      status,
    };
  });
  console.log('\nView check:', JSON.stringify(viewCheck, null, 2));
  
  if (!viewCheck.found) {
    console.log('\n❌ Graph Views container not found. Plugin view may not be open.');
    console.log('Active leaf type:', viewCheck.activeLeaf);
    await browser.close();
    process.exit(1);
  }
  
  // If panel sections not visible, try clicking the settings gear icon
  if (viewCheck.sectionCount === 0) {
    console.log('Panel sections not visible. Clicking settings gear...');
    await obsPage.evaluate(() => {
      const container = document.querySelector('.graph-container');
      // Find gear icon
      const icons = container.querySelectorAll('.clickable-icon');
      for (const icon of icons) {
        const label = icon.getAttribute('aria-label') || '';
        if (label.includes('設定') || label.includes('Settings') || icon.querySelector('.lucide-settings')) {
          icon.click();
          return true;
        }
      }
      // Click last icon in toolbar (usually settings)
      const toolbar = container.querySelector('.graph-toolbar');
      const btns = toolbar?.querySelectorAll('.clickable-icon');
      if (btns?.length) btns[btns.length - 1].click();
    });
    await obsPage.waitForTimeout(500);
  }
  
  // Step 2: Full analysis of グループ section
  const groupAnalysis = await obsPage.evaluate(() => {
    const container = document.querySelector('.graph-container');
    if (!container) return { error: 'no container' };
    
    const sections = container.querySelectorAll('.graph-control-section');
    let groupBody = null;
    const sectionNames = [];
    
    for (const s of sections) {
      const name = s.querySelector('.tree-item-inner')?.textContent?.trim();
      sectionNames.push(name);
      if (name === 'グループ') {
        // Make sure section is expanded
        if (s.classList.contains('is-collapsed')) {
          s.querySelector('.tree-item-self')?.click();
        }
        groupBody = s.querySelector('.tree-item-children');
      }
    }
    
    if (!groupBody) return { error: 'no グループ section', sectionNames };
    
    const children = Array.from(groupBody.children);
    const childOrder = children.map((c, i) => {
      const cls = c.className;
      const name = c.querySelector('.setting-item-name')?.textContent?.trim();
      const input = c.querySelector('input');
      const isToggle = cls.includes('mod-toggle');
      return { index: i, name: name || cls?.substring(0, 30), inputValue: input?.value, isToggle };
    });
    
    const cqInput = groupBody.querySelector('.ngp-search');
    
    const groupWrappers = groupBody.querySelectorAll('.ngp-group-wrapper');
    const groups = Array.from(groupWrappers).map(w => {
      return {
        query: w.querySelector('.ngp-group-query')?.value,
        hasExpand: !!w.querySelector('.ngp-group-expand'),
        expandText: w.querySelector('.ngp-group-expand')?.textContent,
        hasRemove: !!w.querySelector('.ngp-group-remove'),
        hasColor: !!w.querySelector('.ngp-group-color'),
      };
    });
    
    return { sectionNames, childOrder, commonQuery: cqInput?.value, groups };
  });
  
  console.log('\n=== グループ section ===');
  console.log(JSON.stringify(groupAnalysis, null, 2));
  
  // Step 2.5: Add a group if none exist, so we can test ▼/× buttons
  if (!groupAnalysis.groups?.length) {
    await obsPage.evaluate(() => {
      const container = document.querySelector('.graph-container');
      const btns = container.querySelectorAll('.ngp-add-group');
      // The "新規グループ" button (not "プリセット保存")
      for (const b of btns) {
        if (b.textContent.includes('グループ')) { b.click(); break; }
      }
    });
    await obsPage.waitForTimeout(500);
    // Re-query groups
    const updated = await obsPage.evaluate(() => {
      const container = document.querySelector('.graph-container');
      const groupBody = Array.from(container.querySelectorAll('.graph-control-section')).find(
        s => s.querySelector('.tree-item-inner')?.textContent?.trim() === 'グループ'
      )?.querySelector('.tree-item-children');
      if (!groupBody) return [];
      return Array.from(groupBody.querySelectorAll('.ngp-group-wrapper')).map(w => ({
        query: w.querySelector('.ngp-group-query')?.value,
        hasExpand: !!w.querySelector('.ngp-group-expand'),
        expandText: w.querySelector('.ngp-group-expand')?.textContent,
        hasRemove: !!w.querySelector('.ngp-group-remove'),
        hasColor: !!w.querySelector('.ngp-group-color'),
      }));
    });
    groupAnalysis.groups = updated;
    console.log('\n=== グループ追加後 ===');
    console.log(JSON.stringify(updated, null, 2));
  }

  // Step 3: Test expand button
  let expandTest = { skipped: true };
  if (groupAnalysis.groups?.length > 0 && groupAnalysis.groups[0].hasExpand) {
    expandTest = await obsPage.evaluate(() => {
      const btn = document.querySelector('.graph-container .ngp-group-expand');
      if (!btn) return { error: 'no btn' };
      btn.click();
      return new Promise(resolve => setTimeout(() => {
        const editor = document.querySelector('.graph-container .ngp-expr-editor');
        if (!editor) { resolve({ clicked: true, editorFound: false }); return; }
        resolve({
          clicked: true,
          editorFound: true,
          opDropdowns: editor.querySelectorAll('.ngp-expr-op').length,
          indentBtns: editor.querySelectorAll('.ngp-expr-btn').length,
          exprRows: editor.querySelectorAll('.ngp-expr-row').length,
          addRowBtn: editor.querySelector('.ngp-add-group')?.textContent,
          removeBtns: editor.querySelectorAll('.ngp-expr-row .ngp-group-remove').length,
        });
      }, 200));
    });
    console.log('\n=== Expression editor ===');
    console.log(JSON.stringify(expandTest, null, 2));
    
    await obsPage.screenshot({ path: 'tests/e2e/screenshots/02-expr-editor.png' });
    
    // Collapse
    await obsPage.evaluate(() => { document.querySelector('.graph-container .ngp-group-expand')?.click(); });
  }
  
  await obsPage.screenshot({ path: 'tests/e2e/screenshots/03-final.png' });
  
  // === Report ===
  console.log('\n========================================');
  console.log('         E2E TEST RESULTS');
  console.log('========================================\n');
  
  const tests = [];
  
  tests.push({ name: 'グラフビュー表示', pass: !groupAnalysis.error, actual: groupAnalysis.error ?? 'OK' });
  
  if (!groupAnalysis.error) {
    const first = groupAnalysis.childOrder?.[0];
    tests.push({ name: '共通クエリが先頭', pass: first?.name === '共通クエリ', actual: first?.name });
    tests.push({ name: '共通クエリ = "tag:*"', pass: groupAnalysis.commonQuery === 'tag:*', actual: groupAnalysis.commonQuery });
    
    const second = groupAnalysis.childOrder?.[1];
    tests.push({ name: '再帰トグルが2番目', pass: !!second?.isToggle && second?.name?.includes('再帰'), actual: second?.name });
    
    tests.push({ name: 'グループに▼あり', pass: groupAnalysis.groups?.some(g => g.hasExpand) ?? false, actual: groupAnalysis.groups?.map(g => g.expandText) });
    tests.push({ name: 'グループに×あり', pass: groupAnalysis.groups?.some(g => g.hasRemove) ?? false, actual: groupAnalysis.groups?.map(g => g.hasRemove) });
    
    if (!expandTest.skipped) {
      tests.push({ name: '行エディタ展開', pass: !!expandTest.editorFound, actual: expandTest.editorFound });
      if (expandTest.editorFound) {
        tests.push({ name: 'インデントボタン', pass: expandTest.indentBtns > 0, actual: expandTest.indentBtns });
        tests.push({ name: '条件追加ボタン', pass: !!expandTest.addRowBtn, actual: expandTest.addRowBtn });
        tests.push({ name: '行削除ボタン', pass: expandTest.removeBtns > 0, actual: expandTest.removeBtns });
      }
    }
  }
  
  let passed = 0, failed = 0;
  for (const t of tests) {
    const icon = t.pass ? '✅' : '❌';
    console.log(`${icon} ${t.name}`);
    if (!t.pass) { console.log(`   → ${JSON.stringify(t.actual)}`); failed++; }
    else passed++;
  }
  console.log(`\n${passed}/${tests.length} passed`);
  
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });

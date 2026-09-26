import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import ts from 'typescript';

// Browser/component acceptance without authentication, a server, or record writes.
// Run separately: node --test tests/mobile/native-back.browser.mjs
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const compile = path => ts.transpileModule(read(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
let browser;
let page;

before(async () => { browser = await chromium.launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => {
  await page?.close();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  await page.route('**/*', route => route.abort());
  await page.setContent('<button id="trigger">Create Estimate</button><main id="root"></main>');
  await page.addScriptTag({ content: read('node_modules/react/umd/react.development.js') });
  await page.addScriptTag({ content: read('node_modules/react-dom/umd/react-dom.development.js') });
  await page.addScriptTag({ content: `{
    const exports = {};
    ${compile('src/mobile/back.ts')}
    window.back = exports.handleNativeBack;
    window.backCalls = { history: 0, minimize: 0 };
    history.back = () => { window.backCalls.history++; };
    window.pressBack = (canGoBack = true) => window.back(canGoBack, () => { window.backCalls.minimize++; });
  }` });
});

async function mountDraft(busy = false) {
  await page.addScriptTag({ content: `{
    const exports = {};
    const require = name => {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return {
        jsx: (type, props, key) => React.createElement(type, { ...props, key }),
        jsxs: (type, props, key) => React.createElement(type, { ...props, key }),
      };
      if (name === 'lucide-react') return { FileText: () => null, X: () => null };
      throw new Error('Unexpected component dependency: ' + name);
    };
    ${compile('src/features/drafts/DurableDraftLaunchConfirmation.tsx')}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    window.draftCalls = { cancel: 0, confirm: 0 };
    const props = { open: true, outputType: 'estimate', title: 'Local acceptance fixture',
      customer: 'Fictional customer', property: '', itemCount: 1, busy: ${JSON.stringify(busy)},
      onCancel: () => { window.draftCalls.cancel++; root.render(null); },
      onConfirm: () => { window.draftCalls.confirm++; },
    };
    document.getElementById('trigger').focus();
    root.render(React.createElement(exports.DurableDraftLaunchConfirmation, props));
  }` });
  await expect(page.getByRole('dialog')).toBeVisible();
  if (!busy) await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
}

test('Android Back cancels the actual Draft confirmation and restores focus without creating work', async () => {
  await mountDraft();
  await page.evaluate(() => window.pressBack());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#trigger')).toBeFocused();
  assert.deepEqual(await page.evaluate(() => window.draftCalls), { cancel: 1, confirm: 0 });
  assert.deepEqual(await page.evaluate(() => window.backCalls), { history: 0, minimize: 0 });
});

test('a busy Draft confirmation consumes Back without cancelling, navigating, or minimizing', async () => {
  await mountDraft(true);
  await page.evaluate(() => { window.pressBack(true); window.pressBack(false); });
  await expect(page.getByRole('dialog')).toBeVisible();
  assert.deepEqual(await page.evaluate(() => window.draftCalls), { cancel: 0, confirm: 0 });
  assert.deepEqual(await page.evaluate(() => window.backCalls), { history: 0, minimize: 0 });
});

test('native PDF cancellation protects active sharing and closes with cleanup when sharing ends', async () => {
  await page.addScriptTag({ content: `{
    const exports = {};
    window.pdfCalls = { deleted: 0 };
    // about:blank has no secure-context UUID API; keep the native cache identity local.
    const crypto = { randomUUID: () => 'local-fixture-pdf' };
    const require = name => name === '@capacitor/filesystem' ? {
      Directory: { Cache: 'CACHE' }, Filesystem: {
        writeFile: async () => ({ uri: 'file:///fictional-demo-cache.pdf' }),
        deleteFile: async () => { window.pdfCalls.deleted++; },
      },
    } : { Share: { share: () => new Promise(resolve => { window.finishShare = resolve; }) } };
    ${compile('src/mobile/pdf.ts')}
    document.getElementById('trigger').focus();
    exports.showNativePdf(new Blob(['local test fixture']), 'Fictional Estimate.pdf');
  }` });
  await page.getByRole('button', { name: 'Open or share PDF', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.finishShare)).toBe('function');
  await page.evaluate(() => window.pressBack());
  await expect(page.getByRole('dialog')).toBeVisible();
  assert.equal(await page.evaluate(() => window.pdfCalls.deleted), 0);
  await page.evaluate(() => window.finishShare({}));
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
  await page.evaluate(() => window.pressBack());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#trigger')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.pdfCalls.deleted)).toBe(1);
  assert.deepEqual(await page.evaluate(() => window.backCalls), { history: 0, minimize: 0 });
});

test('the focused nested modal receives Escape; a visible nondismissable modal still consumes Back', async () => {
  await page.evaluate(() => {
    document.getElementById('root').innerHTML = '<div role="dialog" aria-modal="true" id="outer">Outer<div role="alertdialog" aria-modal="true" id="inner"><button id="inner-focus">Keep editing</button></div></div><div role="dialog" aria-modal="true" hidden>Hidden</div>';
    window.escapeTargets = [];
    for (const id of ['outer', 'inner']) document.getElementById(id).addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); window.escapeTargets.push(id); }
    });
    document.getElementById('inner-focus').focus();
    window.pressBack();
  });
  assert.deepEqual(await page.evaluate(() => window.escapeTargets), ['inner']);
  assert.deepEqual(await page.evaluate(() => window.backCalls), { history: 0, minimize: 0 });
});

test('the native top-layer modal takes precedence over background accessible dialogs', async () => {
  await page.evaluate(() => {
    document.getElementById('root').innerHTML = '<dialog id="native"><button>Native modal</button></dialog><div role="dialog" aria-modal="true" id="background"><button>Background</button></div>';
    window.backgroundEscapes = 0;
    document.getElementById('background').addEventListener('keydown', () => { window.backgroundEscapes++; });
    document.getElementById('native').showModal();
    window.pressBack();
  });
  await expect(page.locator('#native')).not.toBeVisible();
  assert.equal(await page.evaluate(() => window.backgroundEscapes), 0);
  assert.deepEqual(await page.evaluate(() => window.backCalls), { history: 0, minimize: 0 });
});

test('hidden dialogs do not prevent ordinary history navigation and root minimize', async () => {
  await page.evaluate(() => {
    document.getElementById('root').innerHTML = '<dialog>Closed</dialog><div role="dialog" aria-modal="true" hidden>Hidden</div><div aria-hidden="true"><div role="dialog" aria-modal="true">Hidden from assistive navigation</div></div>';
    window.pressBack(true);
    window.pressBack(false);
  });
  assert.deepEqual(await page.evaluate(() => window.backCalls), { history: 1, minimize: 1 });
});

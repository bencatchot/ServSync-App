import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the production adapter with a minimal DOM and native-plugin boundary.
// This establishes adapter behavior, not a device share-sheet acceptance pass.
function fixture({ writeFails = false } = {}) {
  const writes = [], deletes = [];
  let finishShare, failShare, activeDialog, restored = false, shares = 0;
  class Element extends EventTarget {
    style = {}; children = []; disabled = false; isConnected = true;
    append(...children) { this.children.push(...children); }
    setAttribute() {}
    focus() {}
    remove() { this.isConnected = false; }
    showModal() { activeDialog = this; }
    close() { this.dispatchEvent(new Event('close')); }
  }
  const source = readFileSync(new URL('../../src/mobile/pdf.ts', import.meta.url), 'utf8');
  const script = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(script, {
    exports, Event, Promise,
    crypto: { randomUUID: () => 'test-only-uuid' },
    FileReader: class {
      readAsDataURL() { this.result = 'data:application/pdf;base64,JVBERi0='; this.onload(); }
    },
    document: {
      activeElement: { isConnected: true, focus: () => { restored = true; } },
      createElement: () => new Element(), body: new Element(),
    },
    require: name => name === '@capacitor/filesystem' ? {
      Directory: { Cache: 'CACHE' }, Filesystem: {
        writeFile: async args => { writes.push(args); if (writeFails) throw new Error('disk unavailable'); return { uri: 'file:///demo-cache.pdf' }; },
        deleteFile: async args => { deletes.push(args); },
      },
    } : { Share: { share: () => { shares++; return new Promise((resolve, reject) => { finishShare = resolve; failShare = reject; }); } } },
  });
  exports.showNativePdf({}, '../Demo invoice.pdf');
  const [title, status, share, close] = activeDialog.children;
  return { dialog: activeDialog, title, status, share, close, writes, deletes,
    finish: () => finishShare({}), cancel: () => failShare(new Error('cancelled')),
    get shares() { return shares; }, get restored() { return restored; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('PDF retry reuses the temporary path, rejects duplicate share clicks, and cleans up on close', async () => {
  const f = fixture();
  f.share.onclick(); f.share.onclick();
  await settle();
  assert.equal(f.shares, 1);
  assert.equal(f.share.disabled, true);
  const cancel = new Event('cancel', { cancelable: true });
  assert.equal(f.dialog.dispatchEvent(cancel), false, 'dialog stays open while native share is active');
  assert.equal(f.deletes.length, 0);
  f.finish(); await settle();
  assert.equal(f.close.disabled, false);
  assert.match(f.status.textContent, /share sheet closed/i);
  f.share.onclick(); await settle();
  assert.equal(f.writes[0].path, f.writes[1].path);
  assert.match(f.writes[0].path, /^servsync-pdf\/test-only-uuid\/[^/]+\.pdf$/);
  f.cancel(); await settle();
  assert.match(f.status.textContent, /cancelled or unavailable/i);
  f.close.onclick(); await settle();
  assert.equal(f.deletes.length, 1);
  assert.equal(f.deletes[0].path, f.writes[0].path);
  assert.equal(f.deletes[0].directory, 'CACHE');
  assert.equal(f.dialog.isConnected, false);
  assert.equal(f.restored, true);
});

test('PDF preparation failure leaves a recoverable dialog without opening a share sheet', async () => {
  const f = fixture({ writeFails: true });
  f.share.onclick(); await settle();
  assert.equal(f.shares, 0);
  assert.equal(f.share.disabled, false);
  assert.equal(f.close.disabled, false);
  assert.match(f.status.textContent, /try again/i);
  f.close.onclick(); await settle();
  assert.equal(f.dialog.isConnected, false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const signedUrl = 'https://storage.example.test/report.pdf?token=fixture-only';
const pdfBytes = '%PDF-1.7\nfictional local test document';
const compile = path => ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ native = true, status = 200, bytes = pdfBytes, failure = null, respond } = {}) {
  const requests = [], opened = [], anchors = [];
  const nativeExports = {};
  vm.runInNewContext(compile('src/utils/nativePdfAction.ts'), { exports: nativeExports });
  if (native) nativeExports.registerNativePdfAction((blob, fileName) => opened.push({ blob, fileName }));
  const exports = {};
  vm.runInNewContext(compile('src/utils/storedDocumentDownload.ts'), {
    exports,
    require: name => {
      assert.equal(name, './nativePdfAction');
      return nativeExports;
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (respond) return respond(requests.length);
      if (failure) throw new Error(failure);
      return new Response(bytes, { status, headers: { 'Content-Type': 'application/pdf' } });
    },
    document: { createElement: tag => {
      assert.equal(tag, 'a');
      const anchor = { href: '', download: '', clicks: 0, click() { this.clicks++; } };
      anchors.push(anchor);
      return anchor;
    } },
  });
  return { download: exports.downloadStoredDocument, requests, opened, anchors };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('concurrent native downloads keep one request through response and body loading, then permit another', async () => {
  const response = deferred(), body = deferred();
  const f = fixture({ respond: attempt => attempt === 1 ? response.promise : new Response(pdfBytes) });
  const first = f.download(signedUrl, 'First report.pdf', 'application/pdf');
  const second = f.download(signedUrl + '&renewed=true', 'Second report.pdf', 'application/pdf');
  assert.equal(f.requests.length, 1, 'a pending response blocks duplicate taps, including renewed URLs');
  let bodyStarted = false;
  response.resolve({ ok: true, blob: () => { bodyStarted = true; return body.promise; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(bodyStarted, true);
  const third = f.download(signedUrl, 'Third report.pdf', 'application/pdf');
  assert.equal(f.requests.length, 1, 'body loading is part of the pending download');
  body.resolve(new Blob([pdfBytes], { type: 'application/pdf' }));
  await Promise.all([first, second, third]);
  assert.equal(f.opened.length, 1);
  assert.equal(f.opened[0].fileName, 'First report.pdf');
  await f.download(signedUrl, 'Later report.pdf', 'application/pdf');
  assert.equal(f.requests.length, 2);
  assert.equal(f.opened.length, 2, 'completed transport releases the pending guard');
});

test('failed pending native downloads release the guard so a fresh retry can succeed', async () => {
  for (const failure of ['transport', 'expired', 'empty']) {
    const response = deferred();
    const f = fixture({ respond: attempt => attempt === 1 ? response.promise : new Response(pdfBytes) });
    const first = f.download(signedUrl, 'Job report.pdf', 'application/pdf');
    const rejected = assert.rejects(first, /Unable to download the PDF|stored PDF is empty/);
    const duplicate = f.download(signedUrl, 'Job report.pdf', 'application/pdf');
    assert.equal(f.requests.length, 1);
    if (failure === 'transport') response.reject(new Error('Network unavailable'));
    else response.resolve(new Response('', { status: failure === 'expired' ? 403 : 200 }));
    await rejected;
    await duplicate;
    assert.equal(f.opened.length, 0);
    await f.download(signedUrl, 'Job report.pdf', 'application/pdf');
    assert.equal(f.requests.length, 2);
    assert.equal(f.opened.length, 1, `${failure} must not block the next attempt`);
    assert.equal(f.anchors.length, 0);
  }
});

test('native stored PDFs retain the exact signed URL and open the fetched bytes through the registered adapter', async () => {
  const f = fixture();
  await f.download(signedUrl, 'Job report.pdf', 'application/pdf');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, signedUrl);
  assert.equal(f.requests[0].options.credentials, 'omit');
  assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(f.requests[0].options.headers, undefined, 'signed authorization needs no new auth headers');
  assert.equal(f.opened.length, 1);
  assert.equal(f.opened[0].fileName, 'Job report.pdf');
  assert.equal(await f.opened[0].blob.text(), pdfBytes);
  assert.equal(f.anchors.length, 0, 'native PDF opening must not hand off to the browser');
});

test('web PDFs retain anchor downloading without fetching or installing native behavior', async () => {
  const f = fixture({ native: false });
  await f.download(signedUrl, 'Job report.pdf', 'application/pdf');
  assert.equal(f.requests.length, 0);
  assert.equal(f.opened.length, 0);
  assert.equal(f.anchors.length, 1);
  assert.equal(f.anchors[0].href, signedUrl);
  assert.equal(f.anchors[0].download, 'Job report.pdf');
  assert.equal(f.anchors[0].clicks, 1);
});

test('native non-PDF documents retain the existing anchor even when the filename ends in PDF', async () => {
  const f = fixture();
  await f.download(signedUrl, 'Photo.pdf', 'image/png');
  await f.download(signedUrl, 'Warranty.jpg', 'image/jpeg');
  assert.equal(f.requests.length, 0);
  assert.equal(f.opened.length, 0);
  assert.equal(f.anchors.length, 2);
  assert.ok(f.anchors.every(anchor => anchor.clicks === 1));
});

test('PDF metadata and legacy PDF filenames both reach the native adapter', async () => {
  const f = fixture();
  await f.download(signedUrl, 'Stored report', 'Application/PDF; charset=binary');
  await f.download(signedUrl, 'Legacy.PDF');
  await f.download(signedUrl, 'Legacy.pdf', 'application/octet-stream');
  assert.equal(f.opened.length, 3);
  assert.equal(f.anchors.length, 0);
});

test('expired signed URLs, transport failures, and empty PDFs do not open another app or a native dialog', async () => {
  for (const options of [{ status: 403 }, { failure: `Network failed for ${signedUrl}` }, { bytes: '' }]) {
    const f = fixture(options);
    await assert.rejects(f.download(signedUrl, 'Job report.pdf', 'application/pdf'), error => {
      assert.match(error.message, /Unable to download the PDF|stored PDF is empty/);
      assert.ok(!error.message.includes(signedUrl), 'screen errors must not disclose signed tokens');
      return true;
    });
    assert.equal(f.opened.length, 0);
    assert.equal(f.anchors.length, 0);
  }
});

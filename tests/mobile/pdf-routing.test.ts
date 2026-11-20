import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerNativePdfActions } from '../../src/utils/nativePdfAction';
import { downloadPdfBlob, previewPdfBlob } from '../../src/utils/pdfDocuments';

test('native preview and download get the original document through separate actions', async () => {
  const blob = new Blob(['%PDF-fixture'], { type: 'application/pdf' });
  const calls: string[] = [];
  registerNativePdfActions({
    preview: (received, name) => { assert.equal(received, blob); calls.push('preview ' + name); },
    download: (received, name) => { assert.equal(received, blob); calls.push('download ' + name); },
  });
  await previewPdfBlob(blob, 'Invoice.pdf');
  assert.deepEqual(calls, ['preview Invoice.pdf']);
  await downloadPdfBlob(blob, 'Invoice.pdf');
  assert.deepEqual(calls, ['preview Invoice.pdf', 'download Invoice.pdf']);
});

test('native preview failure reaches the caller without starting a download', async () => {
  registerNativePdfActions({
    preview: async () => { throw new Error('Unable to open this PDF'); },
    download: () => assert.fail('Unexpected download'),
  });
  await assert.rejects(previewPdfBlob(new Blob(), 'Invoice.pdf'), /Unable to open this PDF/);
});

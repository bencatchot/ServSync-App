import { registerPlugin } from '@capacitor/core';
import { pdfBlobBase64 } from './pdf';

const viewer = registerPlugin<{
  open(options: { data: string; fileName: string }): Promise<void>;
}>('ServSyncPdfPreview');

export async function previewIosPdf(blob: Blob, fileName: string) {
  await viewer.open({ data: await pdfBlobBase64(blob), fileName });
}

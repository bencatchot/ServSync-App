import { handleNativePdf, hasNativePdfAction } from './nativePdfAction';

/** Keep the authorized stored-file URL; native PDFs use the existing share lifecycle. */
export async function downloadStoredDocument(signedUrl: string, fileName: string, contentType = '') {
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  const isPdf = mediaType && mediaType !== 'application/octet-stream'
    ? mediaType === 'application/pdf'
    : /\.pdf$/i.test(fileName);

  if (isPdf && hasNativePdfAction()) {
    let blob: Blob;
    try {
      const response = await fetch(signedUrl, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) throw new Error('Download failed');
      blob = await response.blob();
    } catch {
      // Never expose the private signed URL in a transport error.
      throw new Error('Unable to download the PDF. Check your connection and try again.');
    }
    if (blob.size === 0) throw new Error('The stored PDF is empty and cannot be opened.');
    handleNativePdf(blob, fileName);
    return;
  }

  const link = document.createElement('a');
  link.href = signedUrl;
  link.download = fileName;
  link.click();
}

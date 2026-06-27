export function formatMoney(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not used yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPhoneNumber(value?: string | null) {
  const original = (value || '').trim();
  if (!original) return '';
  const digits = original.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return original;
}

export function formatPhoneInputValue(value: string) {
  const original = value;
  const digits = original.replace(/\D/g, '');
  const allowedFormattingOnly = /^[\d\s()+.-]*$/.test(original);
  if (!allowedFormattingOnly) return original;
  if (digits.length === 0) return '';
  if (digits.length > 11) return original;
  const localDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const prefix = digits.length === 11 && digits.startsWith('1') ? '+1 ' : '';
  if (localDigits.length <= 3) return `${prefix}${localDigits}`;
  if (localDigits.length <= 6) return `${prefix}(${localDigits.slice(0, 3)}) ${localDigits.slice(3)}`;
  return `${prefix}(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6)}`;
}

export function supportAttachmentSizeLabel(bytes: number | null | undefined) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function storageSizeLabel(bytes: number | null | undefined) {
  if (!bytes) return '0 MB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function buttonClass(kind: 'primary' | 'secondary' | 'danger' = 'primary') {
  if (kind === 'secondary') {
    return 'inline-flex items-center justify-center gap-2 rounded-xl border border-[#E1E3E7] bg-white px-4 py-2 text-sm font-semibold text-[#223D67] shadow-sm transition hover:border-[#1B85FB] hover:bg-[#F7F9FC] hover:text-[#0078FF]';
  }
  if (kind === 'danger') {
    return 'inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700';
  }
  return 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005FD6]';
}


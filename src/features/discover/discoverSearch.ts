import type { ContractorProfile } from "../../types";

export function matchesContractorLocation(
  contractor: ContractorProfile,
  location: string,
) {
  const query = location.trim().toLowerCase();
  if (!query) return true;
  // ZIP searches use complete ZIP codes, never a silent radius expansion.
  if (/^\d/.test(query))
    return (
      /^\d{5}$/.test(query) &&
      [contractor.zip_code, ...(contractor.service_zip_codes ?? [])].includes(
        query,
      )
    );
  return [contractor.city, `${contractor.city}, ${contractor.state}`].some(
    (value) => value?.trim().toLowerCase() === query,
  );
}

export function matchesContractorTrade(
  contractor: ContractorProfile,
  category: string,
) {
  return (
    !category.trim() ||
    contractor.service_categories.some(
      (value) => value.toLowerCase() === category.trim().toLowerCase(),
    )
  );
}

export function safePublicUrl(value: string | null | undefined) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

import type { ContractorPriceBookItem } from '../../types';
import type { PriceBookImportPreviewRow, PriceBookNormalizedValues } from './priceBookCsvReconciliation';

export type PriceBookDuplicateCandidateItem = Pick<
  ContractorPriceBookItem,
  | 'id'
  | 'title'
  | 'customer_description'
  | 'trade'
  | 'category'
  | 'subcategory'
  | 'line_type'
  | 'unit'
  | 'default_unit_price_cents'
  | 'sku'
  | 'active'
>;

export type PriceBookPossibleDuplicate = {
  item: Pick<PriceBookDuplicateCandidateItem, 'id' | 'title' | 'default_unit_price_cents' | 'active'>;
  reasons: string[];
  additionalMatchCount: number;
};

export type PriceBookImportReviewCounts = {
  new: number;
  changed: number;
  current: number;
  possibleDuplicates: number;
  attention: number;
};

const GENERIC_TITLES = new Set([
  'diagnostic',
  'fee',
  'labor',
  'maintenance',
  'material',
  'miscellaneous',
  'other',
  'part',
  'repair',
  'service',
  'service call',
  'trip charge',
]);

export function normalizePriceBookDuplicateText(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleTokens(value: string) {
  return Array.from(new Set(normalizePriceBookDuplicateText(value).split(' ').filter(Boolean)));
}

export function priceBookTitleSimilarity(left: string, right: string) {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter(token => rightSet.has(token)).length;
  return (2 * overlap) / (leftTokens.length + rightTokens.length);
}

function normalizedEqual(left: unknown, right: unknown) {
  const normalizedLeft = normalizePriceBookDuplicateText(left);
  const normalizedRight = normalizePriceBookDuplicateText(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function samePrice(incoming: PriceBookNormalizedValues, existing: PriceBookDuplicateCandidateItem) {
  return incoming.default_unit_price_cents !== null
    && incoming.default_unit_price_cents !== undefined
    && existing.default_unit_price_cents !== null
    && incoming.default_unit_price_cents === existing.default_unit_price_cents;
}

function candidateFor(
  incoming: PriceBookNormalizedValues,
  existing: PriceBookDuplicateCandidateItem,
): (PriceBookPossibleDuplicate & { rank: number }) | null {
  if (!incoming.title) return null;
  const normalizedIncomingTitle = normalizePriceBookDuplicateText(incoming.title);
  const normalizedExistingTitle = normalizePriceBookDuplicateText(existing.title);
  const exactTitle = normalizedIncomingTitle === normalizedExistingTitle;
  const titleSimilarity = priceBookTitleSimilarity(incoming.title, existing.title);
  if (!exactTitle && titleSimilarity < 0.8) return null;

  const categoryComparable = Boolean(incoming.category && existing.category);
  const categoryMatches = normalizedEqual(incoming.category, existing.category);
  if (categoryComparable && !categoryMatches) return null;

  const evidence = {
    category: categoryMatches,
    subcategory: normalizedEqual(incoming.subcategory, existing.subcategory),
    trade: normalizedEqual(incoming.trade, existing.trade),
    lineType: Boolean(incoming.line_type && incoming.line_type === existing.line_type),
    unit: normalizedEqual(incoming.unit, existing.unit),
    price: samePrice(incoming, existing),
    description: normalizedEqual(incoming.customer_description, existing.customer_description),
  };
  const supportingCount = Object.values(evidence).filter(Boolean).length;
  const genericTitle = GENERIC_TITLES.has(normalizedIncomingTitle) || titleTokens(normalizedIncomingTitle).length < 2;

  if (genericTitle) {
    if (!exactTitle || supportingCount < 3 || (!evidence.category && !evidence.trade)) return null;
  } else if (exactTitle) {
    if (supportingCount < 2 || (!evidence.category && !evidence.trade && !evidence.lineType)) return null;
  } else if (supportingCount < 3 || !evidence.category || !evidence.lineType) {
    return null;
  }

  const reasons = [exactTitle ? 'same normalized title' : 'closely matching title'];
  if (evidence.category) reasons.push('same category');
  if (evidence.subcategory) reasons.push('same subcategory');
  if (evidence.trade) reasons.push('same trade');
  if (evidence.lineType) reasons.push('same item type');
  if (evidence.unit) reasons.push('same unit');
  if (evidence.price) reasons.push('same price');
  if (evidence.description) reasons.push('same customer description');

  return {
    item: {
      id: existing.id,
      title: existing.title,
      default_unit_price_cents: existing.default_unit_price_cents,
      active: existing.active,
    },
    reasons,
    additionalMatchCount: 0,
    rank: (exactTitle ? 100 : Math.round(titleSimilarity * 80)) + supportingCount * 5,
  };
}

export function findPriceBookPossibleDuplicate(
  row: PriceBookImportPreviewRow,
  existingItems: PriceBookDuplicateCandidateItem[],
): PriceBookPossibleDuplicate | null {
  if (row.match_type !== 'none' || row.reconciliation_status !== 'new' || row.errors.length > 0) return null;
  const candidates = existingItems
    .map(item => candidateFor(row.incoming_values, item))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => right.rank - left.rank || left.item.id.localeCompare(right.item.id));
  if (candidates.length === 0) return null;
  const topRankCount = candidates.filter(candidate => candidate.rank === candidates[0].rank).length;
  return {
    item: candidates[0].item,
    reasons: topRankCount > 1 ? [...candidates[0].reasons, 'multiple similar existing items'] : candidates[0].reasons,
    additionalMatchCount: topRankCount - 1,
  };
}

export function applyPriceBookPossibleDuplicateReview(
  previewRows: PriceBookImportPreviewRow[],
  existingItems: PriceBookDuplicateCandidateItem[],
) {
  const candidates = new Map<number, PriceBookPossibleDuplicate>();
  const actions: Record<string, 'add' | 'update' | 'skip'> = {};
  previewRows.forEach(row => {
    const candidate = findPriceBookPossibleDuplicate(row, existingItems);
    if (candidate) candidates.set(row.row_number, candidate);
    actions[String(row.row_number)] = candidate ? 'skip' : row.recommended_action;
  });
  return { candidates, actions };
}

export function summarizePriceBookImportReview(
  previewRows: PriceBookImportPreviewRow[],
  possibleDuplicates: Map<number, PriceBookPossibleDuplicate>,
): PriceBookImportReviewCounts {
  return previewRows.reduce<PriceBookImportReviewCounts>((counts, row) => {
    if (row.errors.length > 0 || row.reconciliation_status === 'invalid' || row.reconciliation_status === 'ambiguous') counts.attention += 1;
    else if (possibleDuplicates.has(row.row_number)) counts.possibleDuplicates += 1;
    else if (row.reconciliation_status === 'new') counts.new += 1;
    else if (row.reconciliation_status === 'changed') counts.changed += 1;
    else if (row.reconciliation_status === 'unchanged') counts.current += 1;
    return counts;
  }, { new: 0, changed: 0, current: 0, possibleDuplicates: 0, attention: 0 });
}

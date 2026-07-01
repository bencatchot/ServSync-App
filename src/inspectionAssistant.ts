import type { FindingStatus } from './types';

const URGENT_PHRASES = [
  'urgent',
  'immediately',
  'hazardous',
  'dangerous',
  'unsafe',
  'critical',
  'severe',
  'emergency',
  'active leak',
  'actively leaking',
  'active water intrusion',
  'water intrusion',
  'electrical hazard',
  'gas odor',
  'sewage backup',
  'structural danger',
  'immediate damage risk',
];

const NEEDS_REPAIR_PHRASES = [
  'recommend replacing',
  'recommend replacement',
  'recommended replacing',
  'recommended replacement',
  'recommend repair',
  'recommended repair',
  'needs repair',
  'requires repair',
  'should be repaired',
  'not working',
  'not functioning',
  'does not work',
  'won t work',
  'wont work',
  'failed',
  'failure',
  'broken',
  'damaged',
  'defect',
  'defective',
  'faulty',
  'inoperable',
  'malfunction',
  'malfunctioning',
  'leaking',
  'leak',
  'dripping',
  'drip',
  'running',
  'runs continuously',
  'keeps running',
  'loose',
  'clogged',
  'clog',
  'blocked',
  'backed up',
  'replace',
  'replacing',
  'replacement',
  'repair',
  'ball valve',
  'fill valve',
  'flapper',
];

const MONITOR_PHRASES = [
  'monitor',
  'watch',
  'minor',
  'slight',
  'beginning',
  'early',
  'developing',
  'potential',
  'possible',
  'wear',
  'worn',
  'aging',
  'age',
  'squeak',
  'squeaks',
  'squeaking',
  'noisy',
  'noise',
  'hum',
  'humming',
  'rattle',
  'rattles',
  'rattling',
  'wobble',
  'wobbles',
  'wobbling',
  'sticks',
  'sticking',
  'sticky',
  'slow',
  'weak',
  'hairline',
  'small stain',
  'moisture stain',
  'water stain',
  'staining',
  'cosmetic',
  'early wear',
  'not normal',
  'abnormal',
];

const COMPLETED_WORK_PHRASES = [
  'fixed',
  'repaired',
  'replaced',
  'corrected',
  'resolved',
  'addressed',
  'adjusted',
  'tightened',
  'secured',
  'sealed',
  'cleared',
  'cleaned',
  'reset',
  'restored',
  'tested good',
  'tested ok',
  'no longer',
  'stopped leaking',
  'stopped leak',
  'squeak gone',
  'noise gone',
  'rattle gone',
  'weight added',
  'balanced',
  'rebalanced',
];

const UNRESOLVED_WORK_PHRASES = [
  'recommend',
  'recommended',
  'will create',
  'will provide',
  'will send',
  'estimate',
  'quote',
  'not fixed',
  'not repaired',
  'unable to repair',
  'could not repair',
  'still leaking',
  'still leaks',
  'not working',
  'not functioning',
  'does not work',
  'won t work',
  'wont work',
  'failed',
  'failure',
  'continues to leak',
  'continued leak',
  'needs repair',
  'requires repair',
  'recommend repair',
  'should be repaired',
  'have repaired',
  'to be repaired',
  'repair by',
];

const CLEAR_CONDITION_PHRASES = [
  'no leak',
  'no leaks',
  'no active leak',
  'no active leaks',
  'no longer leaks',
  'no longer leaking',
  'no damage',
  'no visible damage',
  'no concern',
  'no concerns',
  'no issue',
  'no issues',
  'good condition',
  'normal operation',
  'operating normally',
  'operates normally',
  'functioning',
  'functional',
  'worked',
  'working',
  'working properly',
  'working as expected',
  'operational',
  'pass',
  'looks good',
  'acceptable condition',
  'passed',
];

const BLOCKING_FAILURE_PHRASES = [
  'urgent',
  'hazardous',
  'dangerous',
  'unsafe',
  'critical',
  'active leak',
  'actively leaking',
  'active water intrusion',
  'electrical hazard',
  'gas odor',
  'sewage backup',
  'structural danger',
  'immediate damage risk',
  'not working',
  'not functioning',
  'does not work',
  'won t work',
  'wont work',
  'failed',
  'failure',
  'broken',
  'damaged',
  'defect',
  'defective',
  'faulty',
  'inoperable',
  'malfunction',
  'malfunctioning',
  'dripping',
  'drip',
  'running',
  'runs continuously',
  'keeps running',
  'loose',
  'clogged',
  'clog',
  'blocked',
  'backed up',
];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stemToken(value: string) {
  return value
    .replace(/ing$/, '')
    .replace(/age$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

function hasPhrase(haystack: string, phrase: string) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  if (` ${haystack} `.includes(` ${normalizedPhrase} `)) return true;
  const phraseTokens = normalizedPhrase.split(' ');
  if (phraseTokens.length === 1) {
    const target = stemToken(phraseTokens[0]);
    if (target.length <= 2) return haystack.split(' ').some(token => token === target);
    return haystack.split(' ').some(token => {
      const stemmed = stemToken(token);
      if (target.length <= 4) return stemmed === target;
      return stemmed === target || (stemmed.length > 4 && token.startsWith(target));
    });
  }
  return false;
}

function hasAny(lower: string, phrases: string[]) {
  return phrases.some(phrase => hasPhrase(lower, phrase));
}

function normalizeRoomTerms(value: string) {
  return value
    .replace(/\bmaster bath\b/gi, 'primary bathroom')
    .replace(/\bmaster bathroom\b/gi, 'primary bathroom')
    .replace(/\bmaster bedroom\b/gi, 'primary bedroom');
}

function restoreTradeTerms(value: string) {
  return value
    .replace(/\bgfci\b/gi, 'GFCI')
    .replace(/\bac\b/gi, 'AC')
    .replace(/\bhvac\b/gi, 'HVAC');
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

function punctuate(value: string) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function sentenceCase(value: string) {
  const normalized = restoreTradeTerms(normalizeRoomTerms(normalizeWhitespace(value)));
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function professionalizeFragment(value: string) {
  const normalized = restoreTradeTerms(normalizeRoomTerms(normalizeWhitespace(value)));
  if (!normalized) return '';
  const withRecommendationSplit = normalized.replace(/\s*,?\s+(recommend(?:ed)?(?:\s+\w+)?)/i, '. $1');
  return withRecommendationSplit
    .split(/(?<=[.!?])\s+/)
    .map(part => punctuate(sentenceCase(part)))
    .join(' ');
}

export function localDraftFromNote(note: string): FindingStatus {
  const lower = normalizeText(note);
  const completedOnSite = hasAny(lower, COMPLETED_WORK_PHRASES) && !hasAny(lower, UNRESOLVED_WORK_PHRASES);
  const clearlyOk = hasAny(lower, CLEAR_CONDITION_PHRASES) && !hasAny(lower, UNRESOLVED_WORK_PHRASES);
  const hasUrgent = hasAny(lower, URGENT_PHRASES);
  const hasBlockingFailure = hasAny(lower, BLOCKING_FAILURE_PHRASES);
  const hasNeedsRepair = hasAny(lower, NEEDS_REPAIR_PHRASES);
  const hasMonitor = hasAny(lower, MONITOR_PHRASES);

  if (completedOnSite) return 'Fixed On Site';
  if (hasUrgent) return 'Urgent';
  if (hasBlockingFailure) return 'Needs Repair';
  if (hasNeedsRepair && !clearlyOk) return 'Needs Repair';
  if (hasMonitor) return 'Monitor';
  if (clearlyOk) return 'Pass';
  if (hasNeedsRepair) return 'Needs Repair';
  return 'Pass';
}

export function cleanInspectionNoteText(note: string, status: FindingStatus = localDraftFromNote(note)): string {
  const lower = normalizeText(note);
  if (!lower) return '';

  if (hasPhrase(lower, 'toilet') && (hasPhrase(lower, 'running') || hasPhrase(lower, 'ball valve') || hasPhrase(lower, 'fill valve'))) {
    const room = hasPhrase(lower, 'master bath') || hasPhrase(lower, 'master bathroom') || hasPhrase(lower, 'primary bathroom')
      ? ' in the primary bathroom'
      : '';
    const recommendation = hasPhrase(lower, 'ball valve') || hasPhrase(lower, 'fill valve') || hasPhrase(lower, 'recommend')
      ? ' Recommend replacing the fill valve or ball valve as needed.'
      : '';
    return `The toilet${room} is running.${recommendation}`;
  }

  if ((hasPhrase(lower, 'gfci') || hasPhrase(lower, 'outlet') || hasPhrase(lower, 'receptacle')) && hasAny(lower, ['not working', 'does not work', 'failed', 'failure'])) {
    const device = hasPhrase(lower, 'gfci') ? 'GFCI outlet' : hasPhrase(lower, 'receptacle') ? 'receptacle' : 'outlet';
    return `The ${device} is not working. Recommend repair or replacement by a qualified electrician.`;
  }

  if (hasPhrase(lower, 'water heater') && hasAny(lower, CLEAR_CONDITION_PHRASES)) {
    return 'The water heater appears to be in good condition. No issues were observed.';
  }

  if (hasPhrase(lower, 'active leak') && hasPhrase(lower, 'bathroom sink')) {
    return 'There is an active leak under the bathroom sink. Recommend addressing this immediately to prevent further water damage.';
  }

  if ((hasPhrase(lower, 'ac filter') || (hasPhrase(lower, 'filter') && hasPhrase(lower, 'ac'))) && (hasPhrase(lower, 'dirty') || hasPhrase(lower, 'replace') || hasPhrase(lower, 'replacing'))) {
    return 'The AC filter is dirty. Recommend replacing the filter.';
  }

  if (hasPhrase(lower, 'ceiling fan') && (hasPhrase(lower, 'squeak') || hasPhrase(lower, 'squeaking') || hasPhrase(lower, 'noise'))) {
    return 'The ceiling fan is squeaking. Monitor the fan noise and inspect the mounting or blades if it worsens.';
  }

  if (hasPhrase(lower, 'gutter') && hasPhrase(lower, 'cleaned') && (hasPhrase(lower, 'clog') || hasPhrase(lower, 'clogged'))) {
    return 'The clogged gutter was cleaned onsite. Monitor during the next rain for proper drainage.';
  }

  if (status === 'Pass' && hasAny(lower, CLEAR_CONDITION_PHRASES)) {
    return professionalizeFragment(note)
      .replace(/\bLooks good no issues\b/i, 'Appears to be in good condition. No issues were observed');
  }

  return professionalizeFragment(note);
}

export function cleanInspectionActionText(action: string): string {
  if (!action.trim()) return '';
  return professionalizeFragment(action);
}

export function localSuggestedActionFromNote(note: string, status: FindingStatus): string {
  const lower = normalizeText(note);
  if (status === 'Pass') return '';
  if (status === 'Urgent') return 'Address promptly and restrict use if safety is a concern.';

  if (hasPhrase(lower, 'toilet') && (hasPhrase(lower, 'running') || hasPhrase(lower, 'ball valve') || hasPhrase(lower, 'fill valve'))) {
    return status === 'Fixed On Site'
      ? 'Document completed toilet repair and verify normal operation.'
      : 'Repair the running toilet and replace the fill valve or ball valve as needed.';
  }
  if (hasPhrase(lower, 'outlet') || hasPhrase(lower, 'receptacle') || hasPhrase(lower, 'switch')) {
    return hasAny(lower, ['not working', 'does not work', 'failed', 'failure']) || hasPhrase(lower, 'gfci')
      ? 'Recommend repair or replacement by a qualified electrician.'
      : 'Secure or replace the loose electrical device.';
  }
  if ((hasPhrase(lower, 'ac filter') || (hasPhrase(lower, 'filter') && hasPhrase(lower, 'ac'))) && (hasPhrase(lower, 'dirty') || hasPhrase(lower, 'replace') || hasPhrase(lower, 'replacing'))) {
    return 'Replace the AC filter.';
  }
  if (hasPhrase(lower, 'leak') || hasPhrase(lower, 'leaking') || hasPhrase(lower, 'drip')) {
    return status === 'Fixed On Site'
      ? 'Document completed leak repair and monitor for recurrence.'
      : status === 'Needs Repair'
      ? 'Repair the leak and verify the area is dry after repair.'
      : 'Monitor for active moisture and repair if leaking returns.';
  }
  if (hasPhrase(lower, 'fan') && (hasPhrase(lower, 'squeak') || hasPhrase(lower, 'noise') || hasPhrase(lower, 'wobble'))) {
    return status === 'Fixed On Site'
      ? 'Document fan adjustment or repair and monitor during normal use.'
      : status === 'Needs Repair'
      ? 'Inspect fan mounting and blades before continued use.'
      : 'Monitor fan noise and inspect mounting or blades if it worsens.';
  }
  if (hasPhrase(lower, 'door') && (hasPhrase(lower, 'stick') || hasPhrase(lower, 'sticking') || hasPhrase(lower, 'latch'))) {
    return status === 'Fixed On Site'
      ? 'Document door adjustment and monitor during normal use.'
      : 'Monitor door operation and adjust hinges or latch if it worsens.';
  }
  if (hasPhrase(lower, 'drain') || hasPhrase(lower, 'clog')) {
    return status === 'Fixed On Site'
      ? 'Document cleared drainage and monitor for repeat blockage.'
      : 'Monitor drainage and clear or inspect if it slows further.';
  }
  if (hasPhrase(lower, 'gutter') || hasPhrase(lower, 'downspout')) {
    return status === 'Fixed On Site'
      ? 'Document cleared gutter or downspout and monitor during routine maintenance.'
      : 'Clean or monitor gutter flow during the next rain.';
  }
  if (hasPhrase(lower, 'stain') || hasPhrase(lower, 'moisture')) {
    return status === 'Needs Repair'
      ? 'Investigate moisture source and repair as needed.'
      : 'Monitor stain for change and investigate if moisture returns or grows.';
  }

  return status === 'Needs Repair'
    ? 'Repair or evaluate the concern and document completion.'
    : status === 'Fixed On Site'
      ? 'Document completed work and monitor during normal maintenance.'
      : 'Monitor condition and follow up if it worsens.';
}

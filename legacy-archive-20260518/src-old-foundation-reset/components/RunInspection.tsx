import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Camera, Upload, X, AlertCircle, Sparkles, Mic, Wand2, CheckCircle, ClipboardList } from 'lucide-react';
import { Customer, Finding, FindingStatus, Photo, Priority } from '../types';
import { supabase, supabaseConfigured } from '../supabaseClient';
import { COMMON_ROOMS } from '../data';

interface RunInspectionProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onUploadPhotos: (customerId: string, room: string, files: FileList | null) => Promise<void>;
  onDeletePhoto: (customerId: string, room: string, photoId: string) => Promise<void>;
  onCreateFinding: (customerId: string, roomName: string, itemKey: string, status: FindingStatus) => Promise<Finding | null>;
  onUpdateFinding: (customerId: string, findingId: string, updates: Partial<Finding>) => Promise<void>;
  onAddUploadedPhotos: (customerId: string, room: string, photos: Photo[]) => void;
  onUpdateCustomer: (customer: Customer) => Promise<void> | void;
  isInspectionLocked?: boolean;
}

const STATUS_CONFIG: Record<FindingStatus, { label: string; activeBg: string; activeText: string; borderColor: string; badgeStyle: React.CSSProperties }> = {
  Pass: { label: 'Pass', activeBg: '#dcfce7', activeText: '#16a34a', borderColor: '#16a34a', badgeStyle: { backgroundColor: '#dcfce7', color: '#16a34a' } },
  Monitor: { label: 'Monitor', activeBg: '#dbeafe', activeText: '#2563eb', borderColor: '#2563eb', badgeStyle: { backgroundColor: '#dbeafe', color: '#2563eb' } },
  'Fixed On Site': { label: 'Fixed On Site', activeBg: '#ccfbf1', activeText: '#0f766e', borderColor: '#0f766e', badgeStyle: { backgroundColor: '#ccfbf1', color: '#0f766e' } },
  'Needs Repair': { label: 'Needs Repair', activeBg: '#fef3c7', activeText: '#d97706', borderColor: '#d97706', badgeStyle: { backgroundColor: '#fef3c7', color: '#d97706' } },
  Urgent: { label: 'Urgent', activeBg: '#fee2e2', activeText: '#dc2626', borderColor: '#dc2626', badgeStyle: { backgroundColor: '#fee2e2', color: '#dc2626' } },
};

const ASSISTANT_DRAFT_STORAGE_PREFIX = 'servsync-inspection-assistant-draft';

function priorityFromStatus(status: FindingStatus): Finding['priority'] {
  if (status === 'Urgent') return 'Urgent';
  if (status === 'Needs Repair') return 'High';
  if (status === 'Fixed On Site') return 'Low';
  if (status === 'Monitor') return 'Medium';
  return 'Low';
}

type AiFieldDraft = {
  checklistItem: string;
  newChecklistItem?: string;
  matchedExistingItem?: boolean;
  status: FindingStatus;
  priority: Priority;
  description: string;
  action: string;
  due: string;
  confidence?: number;
};

type WalkthroughSuggestion = AiFieldDraft & {
  id: string;
  needsNewChecklistItem?: boolean;
  needsNewRoom?: boolean;
  room: string;
  sourceNote: string;
  approved: boolean;
};

type LocalDraftRule = {
  label: string;
  words: string[];
  status: FindingStatus;
  action: string;
  detail: (room: string, note: string) => string;
};

const LOCAL_DRAFT_RULES: LocalDraftRule[] = [
  {
    label: 'Fixed on site',
    words: ['fixed', 'repaired', 'tightened', 'adjusted', 'cleared', 'cleaned', 'reset', 'corrected', 'removed', 'unclogged', 'replaced', 'resecured', 'lubricated', 'completed on site', 'no leak now', 'not leaking now', 'working now', 'stopped leaking', 'fork was removed', 'obstruction removed'],
    status: 'Fixed On Site',
    action: 'Corrected during this visit. Monitor during the next maintenance visit.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Active/safety concern',
    words: ['urgent', 'active leak', 'hazard', 'unsafe', 'sparking', 'burning smell', 'gas smell', 'smell gas', 'standing water'],
    status: 'Urgent',
    action: 'Address promptly to prevent damage or safety risk.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Leak or moisture',
    words: ['leak', 'drip', 'dripping', 'water stain', 'staining', 'wet', 'moisture', 'damp', 'p-trap', 'supply line'],
    status: 'Needs Repair',
    action: 'Repair the source of moisture/leakage and confirm the area is dry after repair.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Drainage issue',
    words: ['slow drain', 'clog', 'backup', 'not draining', 'standing water', 'pooling'],
    status: 'Needs Repair',
    action: 'Clear or repair the drain line and confirm proper drainage.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Sealant/caulk',
    words: ['caulk', 'sealant', 'grout', 'separation', 'gap', 'cracked caulk'],
    status: 'Monitor',
    action: 'Reseal the affected area if separation continues or moisture exposure is likely.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Loose/damaged component',
    words: ['loose', 'damaged', 'broken', 'crack', 'cracked', 'failed', 'missing', 'deteriorated', 'rot', 'soft spot'],
    status: 'Needs Repair',
    action: 'Repair or replace the affected component.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Electrical/GFCI',
    words: ['gfci', 'outlet', 'switch', 'breaker', 'panel', 'electrical', 'light not working', 'reverse polarity'],
    status: 'Needs Repair',
    action: 'Repair or evaluate the electrical concern with a qualified professional if needed.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'HVAC/filter',
    words: ['hvac', 'hvac filter', 'air filter', 'return filter', 'furnace filter', 'thermostat', 'furnace', 'condenser', 'air handler', 'condensate'],
    status: 'Monitor',
    action: 'Service or monitor this HVAC item during the next maintenance visit.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Pest activity',
    words: ['pest', 'droppings', 'rodent', 'termite', 'ants', 'nest', 'burrow', 'insects'],
    status: 'Needs Repair',
    action: 'Coordinate pest treatment or exclusion as needed.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Monitor/minor',
    words: ['monitor', 'minor', 'early', 'starting', 'beginning', 'slight', 'small'],
    status: 'Monitor',
    action: 'Monitor this condition at the next service visit.',
    detail: (room, note) => `${note}`,
  },
  {
    label: 'Pass/normal',
    words: ['looks good', 'no issue', 'no issues', 'normal', 'working properly', 'functioning', 'all good'],
    status: 'Pass',
    action: '',
    detail: (room, note) => `${note}`,
  },
];

function titleCaseRoom(room: string) {
  return room || 'this area';
}

const ITEM_MATCH_SYNONYMS: Record<string, string[]> = {
  sink: ['sink', 'sinks', 'faucet', 'faucets', 'under-sink', 'under sink', 'cabinet under sink', 'basin', 'vanity'],
  faucet: ['faucet', 'water pressure', 'spray', 'fixture'],
  toilet: ['toilet', 'toilets', 'tank', 'bowl', 'flange', 'seat', 'flush', 'flushing'],
  shower: ['shower', 'tub', 'bathtub', 'pan', 'shower door', 'enclosure'],
  drain: ['drain', 'drains', 'draining', 'drainage', 'waste', 'p-trap', 'p trap', 'trap', 'slow drain', 'slow draining', 'clog'],
  caulk: ['caulk', 'caulking', 'sealant', 'grout'],
  dishwasher: ['dishwasher'],
  disposal: ['disposal', 'garbage disposal', 'garburator'],
  refrigerator: ['refrigerator', 'fridge', 'refrigerator filter', 'fridge filter', 'water filter'],
  range: ['oven', 'range', 'stove', 'stovetop', 'burner'],
  vent: ['vent', 'exhaust', 'fan', 'range hood'],
  gfci: ['gfci', 'outlet', 'receptacle'],
  window: ['window', 'sill', 'glass'],
  door: ['door', 'threshold', 'lock', 'hardware'],
  gutter: ['gutter', 'downspout'],
  roof: ['roof', 'shingle', 'flashing'],
  hvac: ['hvac', 'hvac filter', 'air filter', 'return filter', 'furnace filter', 'thermostat', 'furnace', 'condenser', 'air handler'],
  wall: ['wall', 'walls', 'sheetrock', 'drywall', 'hole', 'paint', 'ceiling'],
};

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
    return haystack.split(' ').some(token => stemToken(token) === target || token.startsWith(target) || target.startsWith(stemToken(token)));
  }
  return false;
}

function isRefrigeratorFilterNote(lower: string) {
  return (hasPhrase(lower, 'refrigerator') || hasPhrase(lower, 'fridge')) && hasPhrase(lower, 'filter');
}

function isHvacFilterNote(lower: string) {
  return ['hvac filter', 'air filter', 'return filter', 'furnace filter'].some(phrase => hasPhrase(lower, phrase)) ||
    (hasPhrase(lower, 'filter') && ['hvac', 'furnace', 'air handler', 'return'].some(phrase => hasPhrase(lower, phrase)));
}

function isDryerVentNote(lower: string) {
  return hasPhrase(lower, 'dryer') || hasPhrase(lower, 'dryer vent') || hasPhrase(lower, 'lint trap');
}

function professionalizeObservation(note: string, room: string, ruleLabel: string) {
  const clean = note.trim().replace(/\s+/g, ' ');
  const lower = normalizeText(clean);
  const location = room || 'the inspected area';

  const has = (phrase: string) => hasPhrase(lower, phrase);
  const fixture = has('toilet') ? 'toilet' :
    has('shower') ? 'shower' :
    has('tub') || has('bathtub') ? 'bathtub' :
    has('faucet') ? 'faucet' :
    has('sink') || has('vanity') ? 'sink' :
    has('p trap') || has('trap') ? 'P-trap' :
    has('drain') ? 'drain' :
    has('gfci') ? 'GFCI outlet' :
    has('outlet') ? 'outlet' :
    has('gutter') ? 'gutter' :
    has('door') ? 'door' :
    has('window') ? 'window' :
    has('wall') || has('sheetrock') || has('drywall') ? 'wall/sheetrock' :
    isRefrigeratorFilterNote(lower) ? 'refrigerator water filter' :
    has('dishwasher') && has('filter') ? 'dishwasher filter' :
    isHvacFilterNote(lower) ? 'HVAC filter' :
    has('hvac') || has('thermostat') || has('furnace') || has('condenser') || has('air handler') ? 'HVAC component' :
    isDryerVentNote(lower) ? 'dryer vent' :
    'component';

  if (ruleLabel === 'Fixed on site') {
    if (has('disposal') || has('garbage disposal')) {
      const obstruction = has('fork') ? 'a fork' : has('utensil') ? 'a utensil' : has('object') ? 'an obstruction' : 'an obstruction';
      return `The garbage disposal was jammed by ${obstruction}. The obstruction was removed during the visit.`;
    }
    if (has('drain') || has('clog') || has('slow drain')) {
      return `The drain issue in the ${location} was cleared during the visit.`;
    }
    if (has('gfci') || has('outlet') || has('reset')) {
      return `The ${fixture} in the ${location} was reset or corrected during the visit.`;
    }
    if (isRefrigeratorFilterNote(lower)) {
      return `The refrigerator water filter in the ${location} was serviced or replaced during the visit.`;
    }
    if (has('dishwasher') && has('filter')) {
      return `The dishwasher filter in the ${location} was serviced or checked during the visit.`;
    }
    if (isHvacFilterNote(lower) || has('replaced')) {
      return `The ${fixture} in the ${location} was serviced or replaced during the visit.`;
    }
    return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
  }
  if (ruleLabel === 'Leak or moisture') {
    const staining = has('stain') || has('staining') || has('water stain') ? ' Minor staining was also noted.' : '';
    return `A leak/moisture concern was observed at the ${fixture} in the ${location}.${staining}`;
  }
  if (ruleLabel === 'Drainage issue') {
    return `Drainage at the ${fixture} in the ${location} appears slow or restricted.`;
  }
  if (ruleLabel === 'Sealant/caulk') {
    return `Caulking/sealant in the ${location} is showing separation or deterioration.`;
  }
  if (ruleLabel === 'Loose/damaged component') {
    return `The ${fixture} in the ${location} appears loose, damaged, deteriorated, or not functioning as intended.`;
  }
  if (ruleLabel === 'Electrical/GFCI') {
    return `An electrical concern was observed at the ${fixture} in the ${location}.`;
  }
  if (ruleLabel === 'HVAC/filter') {
    if (isHvacFilterNote(lower)) return `An HVAC filter maintenance item was observed in the ${location}.`;
    return `An HVAC maintenance item was observed in the ${location}.`;
  }
  if (ruleLabel === 'Pest activity') {
    return `Evidence of possible pest activity was observed in the ${location}.`;
  }
  if (ruleLabel === 'Active/safety concern') {
    return `An urgent condition was observed in the ${location} that should be addressed promptly.`;
  }
  if (ruleLabel === 'Pass/normal') {
    return `The inspected item in the ${location} appeared to be functioning normally at the time of inspection.`;
  }

  // If the note is already detailed, preserve it but clean capitalization.
  return clean.length > 25 ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : `A maintenance observation was made in the ${location}: ${clean}.`;
}

function suggestedChecklistItemFromNote(note: string, room: string) {
  const lower = normalizeText(note);
  if (isRefrigeratorFilterNote(lower)) {
    return 'Refrigerator water filter';
  }
  if (hasPhrase(lower, 'dishwasher') && hasPhrase(lower, 'filter')) {
    return 'Dishwasher filter, seal, and drain area';
  }
  if (isDryerVentNote(lower)) {
    return 'Dryer lint trap and vent airflow';
  }
  if (isHvacFilterNote(lower)) {
    return 'HVAC filter condition and replacement date';
  }
  if (['wall', 'sheetrock', 'drywall', 'hole', 'paint', 'ceiling'].some(word => hasPhrase(lower, word))) {
    return 'Walls, ceilings, paint, and drywall condition';
  }
  if (['floor', 'flooring', 'tile', 'carpet', 'laminate', 'hardwood'].some(word => hasPhrase(lower, word))) {
    return 'Flooring condition and visible damage';
  }
  if (['baseboard', 'trim', 'molding', 'moulding'].some(word => hasPhrase(lower, word))) {
    return 'Trim, baseboards, and molding condition';
  }
  if (['cabinet', 'drawer', 'countertop'].some(word => hasPhrase(lower, word))) {
    return 'Cabinets, drawers, and countertop condition';
  }
  if (['door', 'hinge', 'lock', 'handle'].some(word => hasPhrase(lower, word))) {
    return 'Doors, hinges, locks, and hardware';
  }
  if (['window', 'screen', 'lock'].some(word => hasPhrase(lower, word))) {
    return 'Windows, locks, and screens';
  }
  return `${titleCaseRoom(room)} general maintenance observation`;
}

function checklistMatchConfidence(note: string, item: string) {
  const lower = normalizeText(note);
  const itemLower = normalizeText(item);
  if (!itemLower) return 0;
  let score = 0;
  for (const [concept, phrases] of Object.entries(ITEM_MATCH_SYNONYMS)) {
    const noteHasConcept = phrases.some(phrase => hasPhrase(lower, phrase));
    const itemHasConcept = phrases.some(phrase => hasPhrase(itemLower, phrase)) || hasPhrase(itemLower, concept);
    if (noteHasConcept && itemHasConcept) score += 2;
  }
  const itemWords = itemLower.split(' ').filter(word => word.length > 4);
  for (const word of itemWords) if (hasPhrase(lower, word)) score += 1;
  return score;
}

function findBestChecklistItem(note: string, items: string[]) {
  if (items.length === 0) return 'General observation';
  const lower = normalizeText(note);
  const noteHasRefrigeratorFilter = isRefrigeratorFilterNote(lower);
  const noteHasHvacFilter = isHvacFilterNote(lower);
  const noteHasDryerVent = isDryerVentNote(lower);
  const noteHasSink = ['sink', 'sinks', 'vanity', 'faucet', 'faucets'].some(word => hasPhrase(lower, word));
  const noteHasDrain = ['drain', 'drains', 'draining', 'drainage', 'slow drain', 'slow draining', 'p trap', 'p-trap'].some(word => hasPhrase(lower, word));
  const noteHasToilet = ['toilet', 'toilets'].some(word => hasPhrase(lower, word));
  const noteHasDisposal = ['disposal', 'garbage disposal', 'garburator'].some(word => hasPhrase(lower, word));

  if (noteHasRefrigeratorFilter) {
    const refrigeratorItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['refrigerator', 'fridge', 'water filter'].some(word => hasPhrase(itemLower, word));
    });
    if (refrigeratorItem) return refrigeratorItem;
  }

  if (noteHasDryerVent) {
    const dryerItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['dryer', 'lint trap', 'dryer vent', 'exhaust duct'].some(word => hasPhrase(itemLower, word));
    });
    if (dryerItem) return dryerItem;
  }

  if (noteHasHvacFilter && !noteHasRefrigeratorFilter) {
    const hvacItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['hvac filter', 'air filter', 'return filter', 'furnace filter', 'filter condition'].some(word => hasPhrase(itemLower, word));
    });
    if (hvacItem) return hvacItem;
  }

  if (noteHasDisposal) {
    const disposalItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['disposal', 'garbage disposal', 'garburator'].some(word => hasPhrase(itemLower, word));
    });
    if (disposalItem) return disposalItem;
  }

  if (noteHasSink && noteHasDrain) {
    const sinkDrainItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['sink', 'sinks', 'faucet', 'vanity', 'under sink'].some(word => hasPhrase(itemLower, word)) &&
        ['drain', 'drains', 'drainage', 'waste', 'p trap', 'p-trap'].some(word => hasPhrase(itemLower, word));
    });
    if (sinkDrainItem) return sinkDrainItem;
    const sinkItem = items.find(item => ['sink', 'sinks', 'faucet', 'vanity', 'under sink'].some(word => hasPhrase(normalizeText(item), word)));
    if (sinkItem) return sinkItem;
  }

  const noteHasLeak = ['leak', 'leaks', 'leaking', 'drip', 'drips', 'dripping', 'water leak', 'water leaks'].some(word => hasPhrase(lower, word));

  if (noteHasSink && noteHasLeak && !noteHasToilet) {
    const sinkLeakItem = items.find(item => {
      const itemLower = normalizeText(item);
      const sinkRelated = ['sink', 'sinks', 'under sink', 'vanity', 'shut off', 'shutoff', 'supply line'].some(word => hasPhrase(itemLower, word));
      const leakRelated = ['leak', 'leaks', 'water leak', 'water leaks'].some(word => hasPhrase(itemLower, word));
      return sinkRelated && leakRelated;
    });
    if (sinkLeakItem) return sinkLeakItem;
  }

  if (noteHasSink && !noteHasToilet) {
    const underSinkItem = items.find(item => {
      const itemLower = normalizeText(item);
      return ['under sink', 'under-sink', 'shut off', 'shutoff', 'supply line'].some(word => hasPhrase(itemLower, word));
    });
    if (underSinkItem) return underSinkItem;
    const sinkItem = items.find(item => ['sink', 'sinks', 'faucet', 'vanity'].some(word => hasPhrase(normalizeText(item), word)));
    if (sinkItem) return sinkItem;
  }

  const scored = items.map(item => {
    const itemLower = normalizeText(item);
    let score = 0;

    for (const [concept, phrases] of Object.entries(ITEM_MATCH_SYNONYMS)) {
      const noteHasConcept = phrases.some(phrase => hasPhrase(lower, phrase));
      const itemHasConcept = phrases.some(phrase => hasPhrase(itemLower, phrase)) || hasPhrase(itemLower, concept);
      if (noteHasConcept && itemHasConcept) score += 12;
      if (noteHasConcept && !itemHasConcept) score -= 2;
    }

    const itemWords = itemLower.split(' ').filter(w => w.length > 3);
    for (const word of itemWords) {
      if (hasPhrase(lower, word)) score += 2;
    }

    if (noteHasDisposal && (hasPhrase(itemLower, 'disposal') || hasPhrase(itemLower, 'garbage disposal'))) score += 30;
    if (noteHasDisposal && (hasPhrase(itemLower, 'drain') || hasPhrase(itemLower, 'drains')) && !hasPhrase(itemLower, 'disposal')) score -= 10;
    if (noteHasRefrigeratorFilter && (hasPhrase(itemLower, 'hvac') || hasPhrase(itemLower, 'air filter') || hasPhrase(itemLower, 'furnace filter'))) score -= 30;
    if (noteHasHvacFilter && (hasPhrase(itemLower, 'refrigerator') || hasPhrase(itemLower, 'fridge') || hasPhrase(itemLower, 'dishwasher'))) score -= 30;
    if (noteHasDryerVent && (hasPhrase(itemLower, 'exterior') || hasPhrase(itemLower, 'range hood') || hasPhrase(itemLower, 'bathroom'))) score -= 20;
    if (noteHasSink && noteHasLeak && (hasPhrase(itemLower, 'leak') || hasPhrase(itemLower, 'leaks')) && (hasPhrase(itemLower, 'sink') || hasPhrase(itemLower, 'under sink') || hasPhrase(itemLower, 'shut off'))) score += 25;
    if (noteHasSink && noteHasLeak && (hasPhrase(itemLower, 'operation') || hasPhrase(itemLower, 'water pressure'))) score -= 8;

    // Strongly avoid wrong fixture matches in bathrooms/kitchens.
    if (noteHasSink && hasPhrase(itemLower, 'toilet')) score -= 20;
    if (noteHasToilet && (hasPhrase(itemLower, 'sink') || hasPhrase(itemLower, 'faucet'))) score -= 20;
    if ((hasPhrase(lower, 'shower') || hasPhrase(lower, 'tub')) && hasPhrase(itemLower, 'toilet')) score -= 8;

    return { item, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].item : items[0];
}

function localDraftFromNote(note: string, room: string, items: string[]): AiFieldDraft {
  const cleanNote = note.trim().replace(/\s+/g, ' ');
  const lower = normalizeText(cleanNote);
  const lowerRaw = cleanNote.toLowerCase();
  const applianceFilterNote = isRefrigeratorFilterNote(lower) || (hasPhrase(lower, 'dishwasher') && hasPhrase(lower, 'filter'));
  const cleanDryerVentNote = isDryerVentNote(lower) && ['clean', 'clear', 'no blockage', 'not blocked', 'looks good', 'no issue', 'no issues'].some(phrase => hasPhrase(lower, phrase));
  const matchedRule = applianceFilterNote
    ? {
      label: 'Fixed on site',
      words: [],
      status: 'Fixed On Site' as FindingStatus,
      action: 'Completed during this visit. Monitor during the next maintenance visit.',
      detail: (roomName: string, noteText: string) => `${noteText}`,
    }
    : cleanDryerVentNote
      ? {
        label: 'Pass/normal',
        words: [],
        status: 'Pass' as FindingStatus,
        action: '',
        detail: (roomName: string, noteText: string) => `${noteText}`,
      }
      : LOCAL_DRAFT_RULES.find(entry => entry.words.some(word => lowerRaw.includes(word))) || {
    label: 'General observation',
    words: [],
    status: 'Monitor' as FindingStatus,
    action: 'Review condition and determine appropriate follow-up.',
    detail: (roomName: string, noteText: string) => `${noteText}`,
  };
  const roomLabel = titleCaseRoom(room);
  const status = matchedRule.status;
  const checklistItem = findBestChecklistItem(cleanNote, items);
  const matchConfidence = items.includes(checklistItem) ? checklistMatchConfidence(cleanNote, checklistItem) : 0;
  const matchedExistingItem = items.length > 0 && matchConfidence > 0;
  const newChecklistItem = matchedExistingItem ? undefined : suggestedChecklistItemFromNote(cleanNote, roomLabel);
  return {
    checklistItem: matchedExistingItem ? checklistItem : newChecklistItem,
    newChecklistItem,
    matchedExistingItem,
    status,
    priority: priorityFromStatus(status),
    description: professionalizeObservation(cleanNote, roomLabel, matchedRule.label),
    action: matchedRule.action,
    due: status === 'Urgent' ? 'ASAP' : status === 'Needs Repair' ? 'Next service visit' : status === 'Fixed On Site' ? 'Monitor next visit' : status === 'Monitor' ? 'Monitor next visit' : '',
    confidence: matchedExistingItem ? 0.65 : 0.35,
  };
}

function roomKeywords(room: string) {
  const lower = normalizeText(room);
  const words = lower.split(' ').filter(word => word.length > 2);
  const keywords = new Set<string>([lower, ...words]);
  if (lower.includes('kitchen')) ['kitchen', 'sink', 'dishwasher', 'refrigerator', 'range', 'stove', 'disposal'].forEach(k => keywords.add(k));
  if (lower.includes('bath') || lower.includes('powder')) ['bathroom', 'bath', 'toilet', 'shower', 'tub', 'vanity'].forEach(k => keywords.add(k));
  if (lower.includes('garage')) ['garage', 'garage door'].forEach(k => keywords.add(k));
  if (lower.includes('laundry')) ['laundry', 'washer', 'dryer'].forEach(k => keywords.add(k));
  if (lower.includes('attic')) ['attic', 'insulation', 'roof leak'].forEach(k => keywords.add(k));
  if (lower.includes('basement') || lower.includes('crawl')) ['basement', 'crawl', 'foundation', 'sump'].forEach(k => keywords.add(k));
  if (lower.includes('exterior') || lower.includes('yard')) ['exterior', 'outside', 'yard', 'gutter', 'downspout', 'siding', 'hose bib', 'driveway'].forEach(k => keywords.add(k));
  if (lower.includes('bedroom')) ['bedroom', 'closet'].forEach(k => keywords.add(k));
  if (lower.includes('living') || lower.includes('family')) ['living room', 'family room', 'fireplace'].forEach(k => keywords.add(k));
  if (lower.includes('hall') || lower.includes('entry')) ['hallway', 'entry', 'stairs', 'handrail'].forEach(k => keywords.add(k));
  if (lower.includes('whole') || lower.includes('system')) ['hvac', 'thermostat', 'water heater', 'electrical panel', 'smoke detector', 'carbon monoxide'].forEach(k => keywords.add(k));
  return Array.from(keywords).filter(Boolean);
}

function detectRoomFromNote(note: string, rooms: string[], fallbackRoom: string | null) {
  const lower = normalizeText(note);
  if (isDryerVentNote(lower)) {
    const laundryRoom = rooms.find(room => normalizeText(room).includes('laundry'));
    if (laundryRoom) return laundryRoom;
  }
  if (isRefrigeratorFilterNote(lower) || hasPhrase(lower, 'dishwasher')) {
    const kitchenRoom = rooms.find(room => normalizeText(room).includes('kitchen'));
    if (kitchenRoom) return kitchenRoom;
  }
  if (isHvacFilterNote(lower)) {
    const hvacRoom = rooms.find(room => {
      const normalizedRoom = normalizeText(room);
      return ['hvac', 'mechanical', 'utility', 'whole house', 'system'].some(keyword => normalizedRoom.includes(keyword));
    });
    if (hvacRoom) return hvacRoom;
  }
  const scored = rooms.map(room => {
    let score = 0;
    for (const keyword of roomKeywords(room)) {
      if (keyword.length > 2 && hasPhrase(lower, keyword)) score += keyword.includes(' ') ? 8 : 4;
    }
    return { room, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].room : (fallbackRoom || rooms[0] || 'General');
}

function findExistingRoomByNames(rooms: string[], names: string[]) {
  return rooms.find(room => {
    const normalizedRoom = normalizeText(room);
    return names.some(name => {
      const normalizedName = normalizeText(name);
      return normalizedRoom === normalizedName ||
        normalizedRoom.includes(normalizedName) ||
        normalizedName.includes(normalizedRoom);
    });
  });
}

function roomTargetsForNote(note: string) {
  const lower = normalizeText(note);
  if (isDryerVentNote(lower) || hasPhrase(lower, 'washer')) return ['Laundry Room'];
  if (
    isRefrigeratorFilterNote(lower) ||
    hasPhrase(lower, 'dishwasher') ||
    hasPhrase(lower, 'garbage disposal') ||
    hasPhrase(lower, 'disposal') ||
    hasPhrase(lower, 'range hood') ||
    hasPhrase(lower, 'oven') ||
    hasPhrase(lower, 'stove')
  ) return ['Kitchen'];
  if (isHvacFilterNote(lower) || hasPhrase(lower, 'thermostat') || hasPhrase(lower, 'air handler') || hasPhrase(lower, 'furnace')) {
    return ['Whole-House Systems', 'Mechanical Room', 'Utility Room', 'HVAC'];
  }
  if (hasPhrase(lower, 'water heater')) return ['Whole-House Systems', 'Mechanical Room', 'Utility Room'];
  if (hasPhrase(lower, 'electrical panel') || hasPhrase(lower, 'breaker panel')) return ['Whole-House Systems', 'Electrical Panel', 'Garage'];
  if (hasPhrase(lower, 'attic')) return ['Attic'];
  if (hasPhrase(lower, 'crawlspace') || hasPhrase(lower, 'crawl space')) return ['Crawlspace'];
  if (hasPhrase(lower, 'garage door')) return ['Garage'];
  if (hasPhrase(lower, 'gutter') || hasPhrase(lower, 'downspout') || hasPhrase(lower, 'siding') || hasPhrase(lower, 'hose bib')) return ['Exterior / Yard'];
  return [];
}

function detectRoomSuggestionFromNote(note: string, existingRooms: string[], roomsWithChecklist: string[], fallbackRoom: string | null) {
  const roomTargets = roomTargetsForNote(note);
  const existingTarget = findExistingRoomByNames(existingRooms, roomTargets);
  if (existingTarget) {
    return {
      room: existingTarget,
      needsNewRoom: false,
    };
  }

  const commonTarget = roomTargets.find(target =>
    COMMON_ROOMS.some(room => normalizeText(room) === normalizeText(target))
  );
  if (commonTarget) {
    return {
      room: commonTarget,
      needsNewRoom: !existingRooms.some(room => normalizeText(room) === normalizeText(commonTarget)),
    };
  }

  const availableRooms = existingRooms.length > 0 ? existingRooms : roomsWithChecklist;
  const detectedRoom = detectRoomFromNote(note, availableRooms, fallbackRoom);
  return {
    room: detectedRoom,
    needsNewRoom: !existingRooms.some(room => normalizeText(room) === normalizeText(detectedRoom)),
  };
}

function splitWalkthroughNotes(note: string) {
  return note
    .replace(/\b(and then|then|next)\b/gi, '.')
    .split(/[.\n;]+/)
    .map(part => part.trim().replace(/^[-•]\s*/, ''))
    .filter(part => part.length > 4);
}

function SpeechRecognitionCtor(): (new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]) as T;
}

type StoredAssistantDraft = {
  assistantMode?: 'walkthrough' | 'single';
  aiNote?: string;
  aiDraft?: AiFieldDraft | null;
  walkthroughNote?: string;
  walkthroughSuggestions?: WalkthroughSuggestion[];
};

export default function RunInspection({
  customers,
  selectedCustomerId,
  onUploadPhotos,
  onDeletePhoto,
  onCreateFinding,
  onUpdateFinding,
  onAddUploadedPhotos,
  onUpdateCustomer,
  isInspectionLocked = false,
}: RunInspectionProps) {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [findingIdsByItem, setFindingIdsByItem] = useState<Record<string, string>>({});
  const [localFields, setLocalFields] = useState<Record<string, { description: string; action: string; due: string }>>({});
  const [itemPhotos, setItemPhotos] = useState<Record<string, Photo[]>>({});
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState('');
  const [aiDraft, setAiDraft] = useState<AiFieldDraft | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiListening, setAiListening] = useState(false);
  const [draftMode, setDraftMode] = useState<'free' | 'premium'>(() => (localStorage.getItem('fieldDraftMode') === 'premium' ? 'premium' : 'free'));
  const [assistantMode, setAssistantMode] = useState<'walkthrough' | 'single'>('walkthrough');
  const [walkthroughNote, setWalkthroughNote] = useState('');
  const [walkthroughSuggestions, setWalkthroughSuggestions] = useState<WalkthroughSuggestion[]>([]);
  const [walkthroughListening, setWalkthroughListening] = useState(false);
  const [walkthroughApplying, setWalkthroughApplying] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const itemCameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemUploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const walkthroughRecognitionRef = useRef<{ stop: () => void } | null>(null);
  const loadedAssistantDraftFor = useRef<string | null>(null);
  const skipNextAssistantDraftSave = useRef(false);

  const customer = customers.find(c => c.id === selectedCustomerId) || customers[0];
  const findings = useMemo(() => customer?.findings || {}, [customer]);

  const roomsWithChecklist = useMemo(() => {
    if (!customer) return [];
    return customer.rooms.filter(room => (customer.checklist[room] || []).length > 0);
  }, [customer]);

  useEffect(() => {
    const next: Record<string, string> = {};
    Object.entries(findings).forEach(([roomName, roomFindingList]) => {
      roomFindingList.forEach(f => {
        next[`${roomName}::${f.itemKey}`] = f.id;
      });
    });
    setFindingIdsByItem(next);
  }, [findings]);

  useEffect(() => {
    const next: Record<string, { description: string; action: string; due: string }> = {};
    Object.entries(findings).forEach(([roomName, roomFindingList]) => {
      roomFindingList.forEach(f => {
        next[`${roomName}::${f.itemKey}`] = {
          description: f.description || '',
          action: f.action || '',
          due: f.due || '',
        };
      });
    });
    setLocalFields(next);
  }, [findings]);

  useEffect(() => {
    if (!customer) return;
    const next: Record<string, Photo[]> = {};
    Object.entries(customer.photos).forEach(([roomName, roomPhotos]) => {
      roomPhotos.forEach(photo => {
        if (photo.caption.startsWith('__item__')) {
          const itemName = photo.caption.replace('__item__', '');
          const key = `${roomName}::${itemName}`;
          if (!next[key]) next[key] = [];
          next[key].push(photo);
        }
      });
    });
    setItemPhotos(next);
  }, [customer]);

  useEffect(() => {
    if (!customer) return;
    const storageKey = `${ASSISTANT_DRAFT_STORAGE_PREFIX}:${customer.id}`;
    skipNextAssistantDraftSave.current = true;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        setAiNote('');
        setAiDraft(null);
        setWalkthroughNote('');
        setWalkthroughSuggestions([]);
        loadedAssistantDraftFor.current = customer.id;
        return;
      }
      const parsed = JSON.parse(stored) as StoredAssistantDraft;
      setAssistantMode(parsed.assistantMode === 'single' ? 'single' : 'walkthrough');
      setAiNote(parsed.aiNote || '');
      setAiDraft(parsed.aiDraft || null);
      setWalkthroughNote(parsed.walkthroughNote || '');
      setWalkthroughSuggestions(parsed.walkthroughSuggestions || []);
    } catch {
      setAiNote('');
      setAiDraft(null);
      setWalkthroughNote('');
      setWalkthroughSuggestions([]);
    } finally {
      loadedAssistantDraftFor.current = customer.id;
    }
  }, [customer?.id]);

  useEffect(() => {
    if (!customer || loadedAssistantDraftFor.current !== customer.id) return;
    if (skipNextAssistantDraftSave.current) {
      skipNextAssistantDraftSave.current = false;
      return;
    }
    const storageKey = `${ASSISTANT_DRAFT_STORAGE_PREFIX}:${customer.id}`;
    const hasDraft =
      aiNote.trim() ||
      aiDraft ||
      walkthroughNote.trim() ||
      walkthroughSuggestions.length > 0;

    if (!hasDraft) {
      localStorage.removeItem(storageKey);
      return;
    }

    const draft: StoredAssistantDraft = {
      assistantMode,
      aiNote,
      aiDraft,
      walkthroughNote,
      walkthroughSuggestions,
    };
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [aiDraft, aiNote, assistantMode, customer?.id, walkthroughNote, walkthroughSuggestions]);

  if (!customer) return <div className="p-6 text-slate-400">No customer selected.</div>;

  const currentRoom = activeRoom && roomsWithChecklist.includes(activeRoom)
    ? activeRoom
    : roomsWithChecklist[0] || null;

  const photos = customer.photos;
  const roomItems = currentRoom ? (customer.checklist[currentRoom] || []) : [];
  const roomFindings = currentRoom ? (findings[currentRoom] || []) : [];
  const roomPhotos = currentRoom ? (photos[currentRoom] || []).filter(photo => !photo.caption.startsWith('__item__')) : [];

  const lockedMessage = 'This inspection is closed for review. Reopen it from the Report tab before making edits.';
  const warnLocked = () => {
    alert(lockedMessage);
  };

  const saveAssistantDraftNow = (updates: Partial<StoredAssistantDraft> = {}) => {
    if (!customer) return;
    const draft: StoredAssistantDraft = {
      assistantMode,
      aiNote,
      aiDraft,
      walkthroughNote,
      walkthroughSuggestions,
      ...updates,
    };
    const hasDraft =
      (draft.aiNote || '').trim() ||
      draft.aiDraft ||
      (draft.walkthroughNote || '').trim() ||
      (draft.walkthroughSuggestions || []).length > 0;
    const storageKey = `${ASSISTANT_DRAFT_STORAGE_PREFIX}:${customer.id}`;
    if (!hasDraft) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(draft));
  };

  const getItemFinding = (item: string) =>
    roomFindings.find(f => f.itemKey === item) || null;

  const setStatus = async (item: string, status: FindingStatus) => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!currentRoom) return;
    const existing = getItemFinding(item);
    if (existing) {
      await onUpdateFinding(customer.id, existing.id, { status, priority: priorityFromStatus(status) });
      return;
    }
    const created = await onCreateFinding(customer.id, currentRoom, item, status);
    if (created) {
      setFindingIdsByItem(prev => ({ ...prev, [`${currentRoom}::${item}`]: created.id }));
      setLocalFields(prev => ({
        ...prev,
        [`${currentRoom}::${item}`]: { description: '', action: '', due: '' },
      }));
    }
  };

  const debouncedUpdate = useDebounce(
    async (customerId: string, findingId: string, field: string, value: string) => {
      await onUpdateFinding(customerId, findingId, { [field]: value });
    },
    600
  );

  const setField = (item: string, field: 'description' | 'action' | 'due', value: string) => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!currentRoom) return;
    const key = `${currentRoom}::${item}`;
    setLocalFields(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { description: '', action: '', due: '' }), [field]: value },
    }));
    const findingId = findingIdsByItem[key];
    if (!findingId) return;
    debouncedUpdate(customer.id, findingId, field, value);
  };

  const issueCount = (room: string) =>
    (findings[room] || []).filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;

  const handlePhotoFiles = async (files: FileList | null) => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!files || !currentRoom) return;
    await onUploadPhotos(customer.id, currentRoom, files);
  };

  const deletePhoto = async (photoId: string) => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!currentRoom) return;
    await onDeletePhoto(customer.id, currentRoom, photoId);
  };

  const handleItemPhotoFiles = async (item: string, files: FileList | null) => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!files || !currentRoom || !customer) return;
    setUploadingItem(item);
    try {
      const uploaded: Photo[] = [];
      if (!supabaseConfigured || !supabase) {
        Array.from(files).forEach(file => {
          uploaded.push({
            id: crypto.randomUUID(),
            url: URL.createObjectURL(file),
            caption: `__item__${item}`,
          });
        });
        if (uploaded.length > 0) {
          const key = `${currentRoom}::${item}`;
          setItemPhotos(prev => ({
            ...prev,
            [key]: [...(prev[key] || []), ...uploaded],
          }));
          onAddUploadedPhotos(customer.id, currentRoom, uploaded);
        }
        return;
      }

      const roomRes = await supabase
        .from('rooms')
        .select('id')
        .eq('property_id', customer.id)
        .eq('name', currentRoom)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!roomRes.data?.id) throw new Error('Room not found');
      const roomId = roomRes.data.id;
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop() || 'jpg';
        const objectPath = `${customer.id}/${currentRoom}/${crypto.randomUUID()}.${ext}`;
        const uploadRes = await supabase.storage.from('photos').upload(objectPath, file, { upsert: false });
        if (uploadRes.error) throw uploadRes.error;
        const { data: publicData } = supabase.storage.from('photos').getPublicUrl(objectPath);
        const newPhotoId = crypto.randomUUID();
        const insertRes = await supabase.from('photos').insert({
          id: newPhotoId,
          property_id: customer.id,
          room_id: roomId,
          url: publicData.publicUrl,
          caption: `__item__${item}`,
        });
        if (insertRes.error) throw insertRes.error;

        uploaded.push({ id: newPhotoId, url: publicData.publicUrl, caption: `__item__${item}` });
      }
      if (uploaded.length > 0) {
        const key = `${currentRoom}::${item}`;
        setItemPhotos(prev => ({
          ...prev,
          [key]: [...(prev[key] || []), ...uploaded],
        }));
        onAddUploadedPhotos(customer.id, currentRoom, uploaded);
      }
    } catch (err) {
      console.error('Item photo upload failed:', err);
    } finally {
      setUploadingItem(null);
    }
  };

  const deleteItemPhoto = async (item: string, photoId: string) => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!currentRoom) return;
    await onDeletePhoto(customer.id, currentRoom, photoId);
    const key = `${currentRoom}::${item}`;
    setItemPhotos(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(p => p.id !== photoId),
    }));
  };

  const createWalkthroughSuggestions = () => {
    if (isInspectionLocked) { warnLocked(); return; }
    const parts = splitWalkthroughNotes(walkthroughNote);
    if (parts.length === 0) return;
    const suggestions = parts.map(part => {
      const roomSuggestion = detectRoomSuggestionFromNote(part, customer.rooms, roomsWithChecklist, currentRoom);
      const room = roomSuggestion.room;
      const draft = localDraftFromNote(part, room, customer.checklist[room] || []);
      return {
        ...draft,
        id: crypto.randomUUID(),
        room,
        sourceNote: part,
        needsNewRoom: roomSuggestion.needsNewRoom,
        needsNewChecklistItem: !draft.matchedExistingItem,
        approved: true,
      };
    });
    setWalkthroughSuggestions(suggestions);
    saveAssistantDraftNow({ walkthroughSuggestions: suggestions });
  };

  const updateWalkthroughSuggestion = (id: string, updates: Partial<WalkthroughSuggestion>) => {
    setWalkthroughSuggestions(prev => {
      const next = prev.map(suggestion => suggestion.id === id ? { ...suggestion, ...updates } : suggestion);
      saveAssistantDraftNow({ walkthroughSuggestions: next });
      return next;
    });
  };

  const applyWalkthroughSuggestion = async (suggestion: WalkthroughSuggestion) => {
    if (isInspectionLocked) { warnLocked(); return; }
    const room = suggestion.room;
    const existingItems = customer.checklist[room] || [];
    const item = suggestion.checklistItem || suggestion.newChecklistItem || `${room} general maintenance observation`;
    if (!room || !item) return;
    const roomExists = customer.rooms.some(existingRoom => normalizeText(existingRoom) === normalizeText(room));
    if (!roomExists || !existingItems.includes(item)) {
      await Promise.resolve(onUpdateCustomer({
        ...customer,
        rooms: roomExists ? customer.rooms : [...customer.rooms, room],
        checklist: { ...customer.checklist, [room]: [...existingItems, item] },
      }));
    }
    const existing = (findings[room] || []).find(f => f.itemKey === item) || null;
    const updates: Partial<Finding> = {
      status: suggestion.status,
      priority: suggestion.priority || priorityFromStatus(suggestion.status),
      description: suggestion.description,
      action: suggestion.action,
      due: suggestion.due,
    };
    if (existing) {
      await onUpdateFinding(customer.id, existing.id, updates);
    } else {
      const created = await onCreateFinding(customer.id, room, item, suggestion.status);
      if (!created) return;
      await onUpdateFinding(customer.id, created.id, updates);
      setFindingIdsByItem(prev => ({ ...prev, [`${room}::${item}`]: created.id }));
    }
    setLocalFields(prev => ({
      ...prev,
      [`${room}::${item}`]: {
        description: suggestion.description,
        action: suggestion.action,
        due: suggestion.due,
      },
    }));
    updateWalkthroughSuggestion(suggestion.id, { approved: false });
  };

  const applyApprovedWalkthroughSuggestions = async () => {
    if (isInspectionLocked) { warnLocked(); return; }
    const approved = walkthroughSuggestions.filter(suggestion => suggestion.approved);
    if (approved.length === 0) return;
    setWalkthroughApplying(true);
    try {
      for (const suggestion of approved) {
        await applyWalkthroughSuggestion(suggestion);
      }
      setWalkthroughSuggestions(prev => prev.map(suggestion => ({ ...suggestion, approved: false })));
    } finally {
      setWalkthroughApplying(false);
    }
  };

  const startWalkthroughDictation = () => {
    if (isInspectionLocked) { warnLocked(); return; }
    const Recognition = SpeechRecognitionCtor();
    if (!Recognition) {
      setAiError('Voice dictation is not supported in this browser. You can still type the walkthrough notes.');
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ');
      setWalkthroughNote(prev => `${prev}${prev ? ' ' : ''}${transcript}`.trim());
    };
    recognition.onend = () => {
      setWalkthroughListening(false);
      walkthroughRecognitionRef.current = null;
    };
    recognition.onerror = () => {
      setWalkthroughListening(false);
      walkthroughRecognitionRef.current = null;
      setAiError('Voice dictation stopped. You can try again or type the walkthrough notes.');
    };
    setAiError('');
    setWalkthroughListening(true);
    walkthroughRecognitionRef.current = recognition;
    recognition.start();
  };

  const stopWalkthroughDictation = () => {
    walkthroughRecognitionRef.current?.stop();
    walkthroughRecognitionRef.current = null;
    setWalkthroughListening(false);
  };

  const generateAiDraft = async () => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!currentRoom || !aiNote.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiDraft(null);
    if (draftMode === 'free') {
      setAiDraft(localDraftFromNote(aiNote, currentRoom, roomItems));
      setAiLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke<AiFieldDraft>('ai-field-note', {
        body: {
          note: aiNote,
          room: currentRoom,
          customer: {
            name: customer.name,
            yearBuilt: customer.home.yearBuilt,
            roofAge: customer.home.roofAge,
            hvacAge: customer.home.hvacAge,
            plan: customer.plan,
          },
          availableChecklistItems: roomItems,
        },
      });
      if (error) throw error;
      if (!data?.description) throw new Error('AI did not return a usable draft.');
      setAiDraft({
        ...data,
        checklistItem: roomItems.includes(data.checklistItem) ? data.checklistItem : (roomItems[0] || data.checklistItem),
        priority: data.priority || priorityFromStatus(data.status),
      });
    } catch (error) {
      console.warn('AI field assistant fallback used:', error);
      setAiError('Premium AI is unavailable right now, so I made a free template draft instead.');
      setAiDraft(localDraftFromNote(aiNote, currentRoom, roomItems));
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiDraft = async () => {
    if (isInspectionLocked) { warnLocked(); return; }
    if (!currentRoom || !aiDraft) return;
    const item = roomItems.includes(aiDraft.checklistItem) ? aiDraft.checklistItem : roomItems[0];
    if (!item) return;
    const existing = getItemFinding(item);
    const updates: Partial<Finding> = {
      status: aiDraft.status,
      priority: aiDraft.priority || priorityFromStatus(aiDraft.status),
      description: aiDraft.description,
      action: aiDraft.action,
      due: aiDraft.due,
    };
    let findingId = existing?.id || null;
    if (existing) {
      await onUpdateFinding(customer.id, existing.id, updates);
    } else {
      const created = await onCreateFinding(customer.id, currentRoom, item, aiDraft.status);
      if (!created) return;
      findingId = created.id;
      await onUpdateFinding(customer.id, created.id, updates);
      setFindingIdsByItem(prev => ({ ...prev, [`${currentRoom}::${item}`]: created.id }));
    }
    setLocalFields(prev => ({
      ...prev,
      [`${currentRoom}::${item}`]: {
        description: aiDraft.description,
        action: aiDraft.action,
        due: aiDraft.due,
      },
    }));
    if (findingId) setAiDraft(null);
    setAiNote('');
  };

  const startVoiceNote = () => {
    if (isInspectionLocked) { warnLocked(); return; }
    const Recognition = SpeechRecognitionCtor();
    if (!Recognition) {
      setAiError('Voice dictation is not supported in this browser. You can still type the field note.');
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join(' ');
      setAiNote(prev => `${prev}${prev ? ' ' : ''}${transcript}`.trim());
    };
    recognition.onend = () => setAiListening(false);
    recognition.onerror = () => {
      setAiListening(false);
      setAiError('Voice dictation stopped. You can try again or type the note.');
    };
    setAiError('');
    setAiListening(true);
    recognition.start();
  };

  const nonPassFindings = roomFindings.filter(f => f.status !== 'Pass');
  const isAutoChecklistItem = (item: string) => item.startsWith('Auto Follow-up:') || item.startsWith('Seasonal:');

  if (roomsWithChecklist.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-slate-600 font-semibold text-lg">No checklists built yet</p>
        <p className="text-slate-400 text-sm mt-2">Go to Build Checklist to add items to your rooms first.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="font-semibold text-slate-800 text-base">{customer.name} — Inspection</h1>
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {roomsWithChecklist.map(room => {
            const count = issueCount(room);
            const isActive = room === currentRoom;
            return (
              <button
                key={room}
                onClick={() => setActiveRoom(room)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {room}
                {count > 0 && (
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white text-blue-600' : 'bg-red-100 text-red-600'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {isInspectionLocked && (
        <div className="mx-6 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-bold">Inspection closed for review</p>
          <p className="text-xs text-emerald-700 mt-0.5">Editing is locked. Go to the Report tab and click Reopen Inspection if you need to make changes.</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {roomItems.map(item => {
            const finding = getItemFinding(item);
            const status = finding?.status || null;
            const config = status ? STATUS_CONFIG[status] : null;
            const key = `${currentRoom}::${item}`;
            const local = localFields[key] || { description: '', action: '', due: '' };
            const key2 = `${currentRoom}::${item}`;
            const itemPhotoList = itemPhotos[key2] || [];
            const isAutoItem = isAutoChecklistItem(item);

            return (
              <div
                key={item}
                className={`rounded-2xl border transition-colors overflow-hidden ${isAutoItem ? 'bg-amber-50/60' : 'bg-white'}`}
                style={{
                  borderColor: config ? config.borderColor : isAutoItem ? '#f59e0b' : '#e2e8f0',
                  borderWidth: config && status !== 'Pass' ? '2px' : '1px',
                }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-semibold text-slate-800 text-sm">{item}</p>
                    {isAutoItem && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">Auto</span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(Object.keys(STATUS_CONFIG) as FindingStatus[]).map(s => {
                      const cfg = STATUS_CONFIG[s];
                      const isActive = status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => { void setStatus(item, s); }}
                          disabled={isInspectionLocked}
                          className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                          style={
                            isActive
                              ? { backgroundColor: cfg.activeBg, color: cfg.activeText, borderColor: cfg.borderColor }
                              : { backgroundColor: 'white', color: '#94a3b8', borderColor: '#e2e8f0' }
                          }
                        >
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                  {/* Always-visible comment box */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Comments / Observations
                    </label>
                    <textarea
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none bg-white"
                      placeholder="Add notes, observations, or comments..."
                      value={local.description}
                      disabled={isInspectionLocked}
                      onChange={e => setField(item, 'description', e.target.value)}
                    />
                  </div>

                  {/* Action + date only when not Pass */}
                  {status && status !== 'Pass' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">{status === 'Fixed On Site' ? 'Action Taken' : 'Recommended Action'}</label>
                        <input
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                          placeholder={status === 'Fixed On Site' ? 'e.g. Tightened fitting, cleared drain...' : 'e.g. Replace, repair, monitor...'}
                          value={local.action}
                          disabled={isInspectionLocked}
                          onChange={e => setField(item, 'action', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">{status === 'Fixed On Site' ? 'Follow-up' : 'Follow-up Date'}</label>
                        <input
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                          placeholder="e.g. May 30, 2026"
                          value={local.due}
                          disabled={isInspectionLocked}
                          onChange={e => setField(item, 'due', e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Per-item photos */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2">Photos</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => itemCameraRefs.current[item]?.click()}
                        disabled={isInspectionLocked}
                        className="flex items-center gap-1.5 border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-slate-100 transition-colors bg-white"
                      >
                        <Camera size={12} /> Camera
                      </button>
                      <button
                        onClick={() => itemUploadRefs.current[item]?.click()}
                        disabled={isInspectionLocked}
                        className="flex items-center gap-1.5 border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-slate-100 transition-colors bg-white"
                      >
                        <Upload size={12} /> Upload
                      </button>
                      {uploadingItem === item && (
                        <span className="text-xs text-slate-400 self-center">Uploading...</span>
                      )}
                    </div>
                    <input
                      ref={el => { itemCameraRefs.current[item] = el; }}
                      type="file" accept="image/*" capture="environment"
                      className="hidden" multiple
                      onChange={e => { void handleItemPhotoFiles(item, e.target.files); }}
                    />
                    <input
                      ref={el => { itemUploadRefs.current[item] = el; }}
                      type="file" accept="image/*"
                      className="hidden" multiple
                      onChange={e => { void handleItemPhotoFiles(item, e.target.files); }}
                    />
                    {itemPhotoList.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        {itemPhotoList.map(photo => (
                          <div key={photo.id} className="relative rounded-lg overflow-hidden group">
                            <img src={photo.url} alt={photo.caption} className="w-full h-20 object-cover" />
                            <button
                              disabled={isInspectionLocked}
                              onClick={() => { void deleteItemPhoto(item, photo.id); }}
                              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                            <p className="text-xs text-slate-400 truncate mt-0.5 px-0.5">{photo.caption}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto p-4 space-y-4">
          <div className="border border-blue-200 rounded-2xl overflow-hidden bg-blue-50/40">
            <div className="px-4 py-3 border-b border-blue-100 bg-blue-50 flex items-center gap-2">
              <Sparkles size={14} className="text-blue-600" />
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Inspection Assistant</p>
            </div>
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-2 gap-1 bg-white border border-blue-100 rounded-xl p-1">
                {(['walkthrough', 'single'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAssistantMode(mode)}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${assistantMode === mode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-blue-50'}`}
                  >
                    {mode === 'walkthrough' ? 'Walkthrough' : 'Single Item'}
                  </button>
                ))}
              </div>

              {assistantMode === 'walkthrough' ? (
                <div className="space-y-3">
                  <textarea
                    rows={6}
                    className="w-full border border-blue-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none bg-white"
                    placeholder="Talk through the house: Kitchen sink dripping under cabinet, tightened fitting and leak stopped. Hall smoke detector passed. Garage GFCI will not reset, needs repair..."
                    value={walkthroughNote}
                    disabled={isInspectionLocked}
                    onChange={e => setWalkthroughNote(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={walkthroughListening ? stopWalkthroughDictation : startWalkthroughDictation}
                      disabled={isInspectionLocked}
                      className={`flex items-center justify-center gap-1.5 border rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${walkthroughListening ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-blue-100 text-blue-700 hover:bg-blue-50'}`}
                    >
                      <Mic size={13} /> {walkthroughListening ? 'Listening...' : 'Dictate'}
                    </button>
                    <button
                      onClick={createWalkthroughSuggestions}
                      disabled={!walkthroughNote.trim() || isInspectionLocked}
                      className="flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <ClipboardList size={13} /> Suggestions
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setWalkthroughNote(''); setWalkthroughSuggestions([]); }}
                      disabled={isInspectionLocked || (!walkthroughNote && walkthroughSuggestions.length === 0)}
                      className="flex-1 border border-slate-200 text-slate-600 bg-white rounded-lg py-2 text-xs font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => { void applyApprovedWalkthroughSuggestions(); }}
                      disabled={walkthroughApplying || isInspectionLocked || walkthroughSuggestions.filter(s => s.approved).length === 0}
                      className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {walkthroughApplying ? 'Applying...' : 'Apply Approved'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Free mode uses built-in matching rules. Review each suggestion before applying so the report stays accurate.
                  </p>

                  {aiError && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">{aiError}</p>}

                  {walkthroughSuggestions.length > 0 && (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {walkthroughSuggestions.map(suggestion => (
                        <div key={suggestion.id} className={`bg-white border rounded-xl p-3 space-y-2 ${suggestion.approved ? 'border-blue-100' : 'border-slate-200 opacity-70'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={suggestion.approved}
                                onChange={e => updateWalkthroughSuggestion(suggestion.id, { approved: e.target.checked })}
                              />
                              Approve
                            </label>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={STATUS_CONFIG[suggestion.status].badgeStyle}>{suggestion.status}</span>
                          </div>
                          <select
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                            value={suggestion.room}
                            onChange={e => {
                              const room = e.target.value;
                              const draft = localDraftFromNote(suggestion.sourceNote, room, customer.checklist[room] || []);
                              const needsNewRoom = !customer.rooms.some(existingRoom => normalizeText(existingRoom) === normalizeText(room));
                              updateWalkthroughSuggestion(suggestion.id, { ...draft, room, needsNewRoom, needsNewChecklistItem: !draft.matchedExistingItem });
                            }}
                          >
                            {Array.from(new Set([
                              suggestion.room,
                              ...customer.rooms,
                              ...roomsWithChecklist,
                              ...COMMON_ROOMS.filter(room => !customer.rooms.some(existingRoom => normalizeText(existingRoom) === normalizeText(room))),
                            ])).filter(Boolean).map(room => (
                              <option key={room} value={room}>
                                {customer.rooms.some(existingRoom => normalizeText(existingRoom) === normalizeText(room)) ? room : `Create room: ${room}`}
                              </option>
                            ))}
                          </select>
                          {suggestion.needsNewRoom && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 text-[11px] text-blue-800">
                              This note appears to belong under a room that is not on this customer yet. Applying it will create {suggestion.room}.
                            </div>
                          )}
                          {suggestion.needsNewChecklistItem && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 text-[11px] text-amber-800">
                              No clear checklist match found. This will create a new checklist item unless you choose an existing one.
                            </div>
                          )}
                          <select
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                            value={suggestion.checklistItem}
                            onChange={e => updateWalkthroughSuggestion(suggestion.id, {
                              checklistItem: e.target.value,
                              newChecklistItem: (customer.checklist[suggestion.room] || []).includes(e.target.value) ? undefined : e.target.value,
                              matchedExistingItem: (customer.checklist[suggestion.room] || []).includes(e.target.value),
                              needsNewChecklistItem: !(customer.checklist[suggestion.room] || []).includes(e.target.value),
                            })}
                          >
                            {!(customer.checklist[suggestion.room] || []).includes(suggestion.checklistItem) && <option value={suggestion.checklistItem}>Create: {suggestion.checklistItem}</option>}
                            {(customer.checklist[suggestion.room] || []).map(item => <option key={item} value={item}>{item}</option>)}
                          </select>
                          <select
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                            value={suggestion.status}
                            onChange={e => updateWalkthroughSuggestion(suggestion.id, { status: e.target.value as FindingStatus, priority: priorityFromStatus(e.target.value as FindingStatus) })}
                          >
                            {(Object.keys(STATUS_CONFIG) as FindingStatus[]).map(status => <option key={status} value={status}>{status}</option>)}
                          </select>
                          <textarea
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500 resize-none"
                            value={suggestion.description}
                            onChange={e => updateWalkthroughSuggestion(suggestion.id, { description: e.target.value })}
                          />
                          <input
                            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                            value={suggestion.action}
                            placeholder="Action/recommendation"
                            onChange={e => updateWalkthroughSuggestion(suggestion.id, { action: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <input
                              className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                              value={suggestion.due}
                              placeholder="Follow-up"
                              onChange={e => updateWalkthroughSuggestion(suggestion.id, { due: e.target.value })}
                            />
                            <button
                              onClick={() => { void applyWalkthroughSuggestion(suggestion); }}
                              disabled={isInspectionLocked || !suggestion.approved}
                              className="flex items-center gap-1 bg-blue-600 text-white rounded-lg px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                            >
                              <CheckCircle size={12} /> Apply
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 italic">From: {suggestion.sourceNote}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1 bg-white border border-blue-100 rounded-xl p-1">
                    {(['free', 'premium'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setDraftMode(mode);
                          localStorage.setItem('fieldDraftMode', mode);
                          setAiError('');
                          setAiDraft(null);
                        }}
                        className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${draftMode === mode ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-blue-50'}`}
                      >
                        {mode === 'free' ? 'Free Templates' : 'Premium AI'}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={4}
                    className="w-full border border-blue-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none bg-white"
                    placeholder="One item note: kitchen sink slow drip at P-trap, minor staining, recommend repair next visit..."
                    value={aiNote}
                    disabled={isInspectionLocked}
                    onChange={e => setAiNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={startVoiceNote}
                      disabled={isInspectionLocked}
                      className={`flex items-center justify-center gap-1.5 border rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${aiListening ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-blue-100 text-blue-700 hover:bg-blue-50'}`}
                    >
                      <Mic size={13} /> {aiListening ? 'Listening...' : 'Dictate'}
                    </button>
                    <button
                      onClick={() => { void generateAiDraft(); }}
                      disabled={!aiNote.trim() || aiLoading || !currentRoom || isInspectionLocked}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Wand2 size={13} /> {aiLoading ? 'Drafting...' : draftMode === 'free' ? 'Make Draft' : 'Generate AI Draft'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {draftMode === 'free'
                      ? 'Single item free mode uses built-in templates and does not call a paid AI service.'
                      : 'Premium mode uses the configured AI backend for cleaner wording and better item matching.'}
                  </p>
                  {aiError && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">{aiError}</p>}
                  {aiDraft && (
                    <div className="bg-white border border-blue-100 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-700">Suggested finding</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={STATUS_CONFIG[aiDraft.status].badgeStyle}>{aiDraft.status}</span>
                      </div>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                        value={aiDraft.checklistItem}
                        onChange={e => setAiDraft(d => d ? { ...d, checklistItem: e.target.value } : d)}
                      >
                        {roomItems.map(item => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <p className="text-xs text-slate-600 leading-relaxed">{aiDraft.description}</p>
                      {aiDraft.action && <p className="text-xs text-blue-700 font-medium">Action: {aiDraft.action}</p>}
                      {aiDraft.due && <p className="text-xs text-slate-500">Due: {aiDraft.due}</p>}
                      <button disabled={isInspectionLocked} onClick={() => { void applyAiDraft(); }} className="w-full bg-blue-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-blue-700 transition-colors">
                        Apply to Inspection
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Room Photos</p>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => cameraRef.current?.click()}
                  disabled={isInspectionLocked}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 rounded-lg py-2 text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  <Camera size={13} /> Camera
                </button>
                <button
                  onClick={() => uploadRef.current?.click()}
                  disabled={isInspectionLocked}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 rounded-lg py-2 text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  <Upload size={13} /> Upload
                </button>
              </div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" multiple onChange={e => { void handlePhotoFiles(e.target.files); }} />
              <input ref={uploadRef} type="file" accept="image/*" className="hidden" multiple onChange={e => { void handlePhotoFiles(e.target.files); }} />
              {roomPhotos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {roomPhotos.map(photo => (
                    <div key={photo.id} className="relative rounded-lg overflow-hidden group">
                      <img src={photo.url} alt={photo.caption} className="w-full h-20 object-cover" />
                      <button disabled={isInspectionLocked} onClick={() => { void deletePhoto(photo.id); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={11} /></button>
                      <p className="text-xs text-slate-400 truncate mt-1 px-0.5">{photo.caption}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-2">No room photos yet</p>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <AlertCircle size={13} className="text-slate-500" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Findings & Actions</p>
              {nonPassFindings.length > 0 && (
                <span className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{nonPassFindings.length}</span>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {nonPassFindings.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No findings for this room</p>
              ) : (
                nonPassFindings.map(f => {
                  const cfg = STATUS_CONFIG[f.status];
                  return (
                    <div key={f.id} className="px-3 py-3 border-l-4" style={{ borderLeftColor: cfg.borderColor }}>
                      <p className="text-xs font-semibold text-slate-800 leading-tight">{f.title}</p>
                      {f.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{f.description}</p>}
                      {f.action && <p className="text-xs text-blue-600 mt-0.5 font-medium">{f.action}</p>}
                      <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded-full mt-1" style={cfg.badgeStyle}>{f.status}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

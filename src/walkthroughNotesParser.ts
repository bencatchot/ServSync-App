export function normalizeWalkthroughText(value: string) {
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
  const normalizedPhrase = normalizeWalkthroughText(phrase);
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

const ROOM_CONTEXTS: Array<{ label: string; phrases: string[] }> = [
  { label: 'Primary bathroom', phrases: ['primary bathroom', 'primary bath', 'master bathroom', 'master bath'] },
  { label: 'Hall bathroom', phrases: ['hall bathroom', 'hall bath'] },
  { label: 'Bathroom', phrases: ['bathroom', 'bath', 'powder room'] },
  { label: 'Kitchen', phrases: ['kitchen'] },
  { label: 'Laundry', phrases: ['laundry', 'utility room'] },
  { label: 'Living room', phrases: ['living room', 'family room', 'den'] },
  { label: 'Upstairs hallway', phrases: ['upstairs hallway', 'upstairs hall'] },
  { label: 'Bedroom', phrases: ['bedroom'] },
  { label: 'Entry', phrases: ['front door', 'entry', 'foyer'] },
  { label: 'Exterior', phrases: ['exterior', 'outside', 'gutter', 'downspout'] },
];

const COMPONENT_PHRASES = [
  'sink',
  'faucet',
  'garbage disposal',
  'disposal',
  'gfci',
  'outlet',
  'receptacle',
  'switch',
  'light switch',
  'toilet',
  'drain',
  'dryer vent',
  'water heater',
  'expansion tank',
  'ceiling fan',
  'fan',
  'door',
  'front door',
  'smoke detector',
  'window lock',
  'window',
  'dishwasher drain hose',
  'dishwasher',
  'shutoff valve',
  'shut off valve',
  'valve',
  'gutter',
  'downspout',
  'downspout extension',
  'fill valve',
  'ball valve',
];

const CONDITION_PHRASES = [
  'leaking',
  'leak',
  'dripping',
  'drips',
  'drip',
  'jammed',
  'not working',
  'does not work',
  'does not trip',
  'failed',
  'failure',
  'running',
  'slow',
  'squeaks',
  'squeaking',
  'sticks',
  'sticking',
  'clogged',
  'clog',
  'looks good',
  'good condition',
  'missing',
  'broken',
  'loose',
  'corroded',
  'cleaned',
  'fixed',
  'repaired',
  'replaced',
  'tightened',
  'secured',
  'monitor',
  'recommend',
  'needs repair',
  'urgent',
];

const CONTINUATION_STARTS = [
  'recommend',
  'recommended',
  'cleaned',
  'fixed',
  'repaired',
  'replaced',
  'tightened',
  'secured',
  'adjusted',
  'while onsite',
  'while on site',
  'while i was onsite',
  'while i was on site',
  'as needed',
  'to prevent',
  'verify',
  'document',
];

function normalizeConnectorText(value: string) {
  return value
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function inferRoomContext(text: string): string | null {
  const lower = normalizeWalkthroughText(text);
  for (const context of ROOM_CONTEXTS) {
    if (context.phrases.some(phrase => hasPhrase(lower, phrase))) return context.label;
  }
  return null;
}

function hasRoomContext(text: string) {
  return inferRoomContext(text) !== null;
}

function hasComponent(text: string) {
  const lower = normalizeWalkthroughText(text);
  return hasAny(lower, COMPONENT_PHRASES);
}

function hasCondition(text: string) {
  const lower = normalizeWalkthroughText(text);
  return hasAny(lower, CONDITION_PHRASES);
}

function isContextOnly(text: string) {
  const lower = normalizeWalkthroughText(text);
  if (!lower) return false;
  const withoutLeadIn = lower.replace(/^(in|inside|at|around|near|for)\s+(the\s+)?/, '');
  return ROOM_CONTEXTS.some(context => context.phrases.some(phrase => normalizeWalkthroughText(phrase) === withoutLeadIn))
    && !hasComponent(text)
    && !hasCondition(text);
}

function isContinuation(text: string) {
  const lower = normalizeWalkthroughText(text);
  return CONTINUATION_STARTS.some(phrase => lower.startsWith(normalizeWalkthroughText(phrase)));
}

function startsNewCandidate(text: string) {
  if (!text.trim() || isContinuation(text)) return false;
  return hasComponent(text) && hasCondition(text);
}

function prefixRoomContext(text: string, context: string | null) {
  if (!context || hasRoomContext(text)) return text.trim();
  return `${context} ${text.trim()}`;
}

function splitOnConnectors(text: string): string[] {
  const parts = normalizeConnectorText(text).split(/\b(and|also|plus|but|while i'?m here)\b/i);
  if (parts.length <= 1) return [text.trim()];

  const results: string[] = [];
  let current = parts[0]?.trim() ?? '';

  for (let index = 1; index < parts.length; index += 2) {
    const connector = parts[index] ?? '';
    const next = parts[index + 1]?.trim() ?? '';
    if (!next) continue;

    const shouldSplit = startsNewCandidate(next)
      && (normalizeWalkthroughText(connector) !== 'and' || hasCondition(current));

    if (shouldSplit) {
      if (current.trim()) results.push(current.trim());
      current = next;
    } else {
      current = `${current} ${connector} ${next}`.trim();
    }
  }

  if (current.trim()) results.push(current.trim());
  return results;
}

function splitOnCommas(text: string): string[] {
  const parts = text.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length <= 1) return [text.trim()];

  const results: string[] = [];
  let current = '';
  let context: string | null = null;

  for (const part of parts) {
    if (isContextOnly(part)) {
      context = inferRoomContext(part) ?? context;
      continue;
    }

    const candidate = prefixRoomContext(part, context);
    if (!current) {
      current = candidate;
    } else if (startsNewCandidate(part)) {
      results.push(current.trim());
      current = candidate;
    } else {
      current = `${current}, ${part}`.trim();
    }

    context = inferRoomContext(candidate) ?? context;
  }

  if (current.trim()) results.push(current.trim());
  return results;
}

export function splitWalkthroughNotes(text: string): string[] {
  const majorSegments = normalizeConnectorText(text)
    .replace(/\b(and then|then|next)\b/gi, '.')
    .split(/[.\n;•]+|-\s+|\d+\.\s+/)
    .map(segment => segment.replace(/^\s*[-•]\s*/, '').trim())
    .filter(segment => segment.length > 4);

  const results: string[] = [];
  let context: string | null = null;

  for (const segment of majorSegments) {
    const connectorParts = splitOnConnectors(segment);
    for (const connectorPart of connectorParts) {
      const commaParts = splitOnCommas(connectorPart);
      for (const part of commaParts) {
        if (isContinuation(part) && results.length > 0) {
          const previous = results[results.length - 1].replace(/[,\s]+$/, '');
          const continuation = part.replace(/[,\s]+$/, '');
          results[results.length - 1] = normalizeConnectorText(`${previous}, ${continuation}`);
          context = inferRoomContext(results[results.length - 1]) ?? context;
          continue;
        }
        const candidate = prefixRoomContext(part, context);
        if (candidate.length > 4) results.push(candidate);
        context = inferRoomContext(candidate) ?? context;
      }
    }
  }

  return results;
}

function roomKeywords(room: string) {
  const lower = normalizeWalkthroughText(room);
  const words = lower.split(' ').filter(word => word.length > 2);
  const keywords = new Set<string>([lower, ...words]);
  if (lower.includes('kitchen')) ['kitchen', 'sink', 'dishwasher', 'refrigerator', 'range', 'stove', 'disposal', 'gfci', 'outlet'].forEach(k => keywords.add(k));
  if (lower.includes('bath') || lower.includes('powder')) ['bathroom', 'bath', 'half bath', 'powder room', 'toilet', 'shower', 'tub', 'vanity', 'sink', 'faucet', 'gfci', 'outlet'].forEach(k => keywords.add(k));
  if ((lower.includes('master') || lower.includes('primary')) && lower.includes('bath')) ['master bath', 'master bathroom', 'primary bath', 'primary bathroom'].forEach(k => keywords.add(k));
  if (lower.includes('garage') || lower.includes('shop') || lower.includes('shed') || lower.includes('carport')) ['garage', 'garage door', 'shop', 'shed', 'carport'].forEach(k => keywords.add(k));
  if (lower.includes('laundry') || lower.includes('utility')) ['laundry', 'utility', 'utility room', 'washer', 'dryer', 'dryer vent'].forEach(k => keywords.add(k));
  if (lower.includes('attic')) ['attic', 'insulation', 'roof leak'].forEach(k => keywords.add(k));
  if (lower.includes('basement') || lower.includes('crawl')) ['basement', 'crawl', 'foundation', 'sump'].forEach(k => keywords.add(k));
  if (lower.includes('exterior') || lower.includes('yard') || lower.includes('porch') || lower.includes('deck') || lower.includes('patio')) ['exterior', 'outside', 'yard', 'porch', 'deck', 'patio', 'gutter', 'downspout', 'siding', 'hose bib', 'driveway'].forEach(k => keywords.add(k));
  if (lower.includes('bedroom')) ['bedroom', 'closet', 'window', 'window lock'].forEach(k => keywords.add(k));
  if (lower.includes('living') || lower.includes('family') || lower.includes('den') || lower.includes('great')) ['living room', 'family room', 'den', 'great room', 'fireplace', 'ceiling fan'].forEach(k => keywords.add(k));
  if ((lower.includes('hall') && !lower.includes('bath')) || lower.includes('entry') || lower.includes('foyer')) ['hallway', 'entry', 'foyer', 'front door', 'door', 'floor', 'light', 'switch', 'smoke detector'].forEach(k => keywords.add(k));
  if (lower.includes('whole') || lower.includes('system') || lower.includes('mechanical')) ['hvac', 'thermostat', 'water heater', 'electrical panel', 'smoke detector', 'carbon monoxide', 'expansion tank'].forEach(k => keywords.add(k));
  return Array.from(keywords).filter(Boolean);
}

export function detectRoomFromNote(note: string, rooms: string[], fallbackRoom: string | null = null): string | null {
  const lower = normalizeWalkthroughText(note);
  const scored = rooms.map(room => {
    let score = 0;
    for (const keyword of roomKeywords(room)) {
      if (keyword.length > 2 && hasPhrase(lower, keyword)) score += keyword.includes(' ') ? 8 : 4;
    }
    return { room, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].room : fallbackRoom;
}

const ITEM_MATCH_SYNONYMS: Record<string, string[]> = {
  sink: ['sink', 'sinks', 'faucet', 'faucets', 'under-sink', 'under sink', 'cabinet under sink', 'basin', 'vanity'],
  faucet: ['faucet', 'water pressure', 'spray', 'fixture'],
  toilet: ['toilet', 'toilets', 'tank', 'bowl', 'flange', 'seat', 'flush', 'flushing'],
  shower: ['shower', 'tub', 'bathtub', 'pan', 'shower door', 'enclosure'],
  drain: ['drain', 'drains', 'draining', 'drainage', 'waste', 'p-trap', 'p trap', 'trap', 'slow drain', 'slow draining', 'clog'],
  leak: ['leak', 'leaks', 'leaking', 'drip', 'drips', 'dripping', 'water leak', 'moisture', 'wet', 'damp'],
  moisture: ['moisture', 'water stain', 'stain', 'staining', 'soft spot', 'damp', 'wet', 'mold', 'mildew'],
  caulk: ['caulk', 'caulking', 'sealant', 'grout'],
  dishwasher: ['dishwasher', 'dishwasher drain hose'],
  disposal: ['disposal', 'garbage disposal', 'garburator'],
  refrigerator: ['refrigerator', 'fridge'],
  range: ['oven', 'range', 'stove', 'stovetop', 'burner'],
  vent: ['vent', 'exhaust', 'fan', 'range hood', 'dryer vent'],
  gfci: ['gfci', 'outlet', 'receptacle', 'plug', 'does not trip'],
  switch: ['switch', 'light switch', 'dimmer'],
  electrical: ['electrical', 'breaker', 'panel', 'wire', 'wiring', 'spark', 'sparking', 'flicker', 'flickering', 'smoke detector'],
  window: ['window', 'windows', 'window lock', 'sill', 'glass', 'screen', 'sash', 'won t open', 'wont open', 'stuck window'],
  door: ['door', 'doors', 'front door', 'threshold', 'lock', 'hardware', 'hinge', 'sticks', 'sticking', 'stuck door', 'won t latch', 'wont latch'],
  gutter: ['gutter', 'gutters', 'downspout', 'downspouts', 'downspout extension', 'clogged gutter', 'gutter clogged', 'blocked downspout', 'overflowing'],
  roof: ['roof', 'shingle', 'flashing'],
  hvac: ['hvac', 'filter', 'dirty filter', 'thermostat', 'furnace', 'condenser', 'ac', 'a c', 'air conditioner', 'not cooling', 'weak air', 'airflow', 'air flow', 'register'],
  water_heater: ['water heater', 'expansion tank'],
  wall: ['wall', 'walls', 'sheetrock', 'drywall', 'hole', 'paint', 'ceiling'],
  cabinet: ['cabinet', 'cabinets', 'drawer', 'drawers', 'hinge', 'cabinet maker'],
  fan: ['fan', 'ceiling fan', 'fan blade', 'blade', 'squeak', 'squeaking', 'noise', 'balance', 'out of balance'],
  pest: ['pest', 'pests', 'wasp', 'wasps', 'nest', 'ants', 'ant', 'termite', 'termite tubes', 'droppings', 'rodent', 'mice'],
  valve: ['shutoff valve', 'shut off valve', 'supply valve', 'valve'],
};

export function checklistMatchConfidence(note: string, item: string) {
  const lower = normalizeWalkthroughText(note);
  const itemLower = normalizeWalkthroughText(item);
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

export function suggestedChecklistItemFromNote(note: string, room: string) {
  const lower = normalizeWalkthroughText(note);
  if (['disposal', 'garbage disposal', 'jammed'].some(word => hasPhrase(lower, word))) return 'Garbage disposal concern';
  if (['dishwasher drain hose', 'dishwasher'].some(word => hasPhrase(lower, word))) return 'Dishwasher drain hose';
  if (['shutoff valve', 'shut off valve', 'valve', 'corroded'].some(word => hasPhrase(lower, word))) return 'Under-sink shutoff valve';
  if (['leak', 'leaking', 'drip', 'drips', 'moisture', 'wet', 'water', 'supply line', 'p trap', 'p-trap'].some(word => hasPhrase(lower, word))) {
    if (['sink', 'faucet', 'vanity', 'basin', 'cabinet'].some(word => hasPhrase(lower, word))) {
      return hasPhrase(normalizeWalkthroughText(room), 'bath') ? 'Bathroom sink leak' : 'Kitchen sink leak';
    }
    if (['ceiling', 'stain', 'water stain'].some(word => hasPhrase(lower, word))) return 'Moisture stain';
    return 'Plumbing leak';
  }
  if (['toilet', 'running', 'fill valve', 'ball valve'].some(word => hasPhrase(lower, word))) return 'Toilet operation';
  if (['slow drain', 'clog', 'backup', 'not draining', 'drain'].some(word => hasPhrase(lower, word))) return 'Slow drain or clog';
  if (['dryer vent'].some(word => hasPhrase(lower, word))) return 'Dryer vent';
  if (['water heater'].some(word => hasPhrase(lower, word))) return 'Water heater';
  if (['expansion tank'].some(word => hasPhrase(lower, word))) return 'Expansion tank';
  if (['gutter', 'gutters'].some(word => hasPhrase(lower, word))) return 'Gutter blockage';
  if (['downspout', 'downspouts'].some(word => hasPhrase(lower, word))) return 'Downspout extension';
  if (['ac', 'a c', 'air conditioner', 'hvac', 'not cooling', 'weak air', 'airflow', 'air flow', 'dirty filter', 'filter'].some(word => hasPhrase(lower, word))) return 'HVAC airflow or filter concern';
  if (['gfci', 'outlet', 'receptacle', 'plug'].some(word => hasPhrase(lower, word))) return 'GFCI outlet';
  if (['switch', 'light switch'].some(word => hasPhrase(lower, word))) return 'Loose outlet or switch';
  if (['smoke detector'].some(word => hasPhrase(lower, word))) return 'Smoke detector';
  if (['wall', 'sheetrock', 'drywall', 'hole', 'paint', 'ceiling'].some(word => hasPhrase(lower, word))) return 'Wall or ceiling damage';
  if (['fan', 'ceiling fan', 'fan blade', 'squeak', 'squeaking', 'out of balance', 'wobble', 'wobbling'].some(word => hasPhrase(lower, word))) return 'Ceiling fan noise';
  if (['floor', 'flooring', 'tile', 'carpet', 'laminate', 'hardwood', 'soft spot'].some(word => hasPhrase(lower, word))) return 'Flooring concern';
  if (['cabinet', 'drawer', 'countertop'].some(word => hasPhrase(lower, word))) return 'Cabinet or counter issue';
  if (['door', 'hinge', 'lock', 'handle', 'sticks', 'sticking'].some(word => hasPhrase(lower, word))) return 'Door operation issue';
  if (['window', 'window lock', 'screen', 'sash', 'won t open', 'wont open'].some(word => hasPhrase(lower, word))) return 'Window operation issue';
  if (['wasp', 'wasps', 'ants', 'ant', 'termite', 'termite tubes', 'droppings', 'rodent', 'pest'].some(word => hasPhrase(lower, word))) return 'Pest concern';
  const roomLabel = room && room !== 'General' ? room.replace(/\s*\/\s*/g, ' ') : 'General';
  return `${roomLabel} observation`;
}

export function findBestChecklistItem(note: string, items: string[]) {
  if (items.length === 0) return 'General observation';
  const lower = normalizeWalkthroughText(note);
  const noteHasSink = ['sink', 'sinks', 'vanity', 'faucet', 'faucets'].some(word => hasPhrase(lower, word));
  const noteHasDrain = ['drain', 'drains', 'draining', 'drainage', 'slow drain', 'slow draining', 'p trap', 'p-trap'].some(word => hasPhrase(lower, word));
  const noteHasToilet = ['toilet', 'toilets'].some(word => hasPhrase(lower, word));
  const noteHasDisposal = ['disposal', 'garbage disposal', 'garburator'].some(word => hasPhrase(lower, word));
  const noteHasLeak = ['leak', 'leaks', 'leaking', 'drip', 'drips', 'dripping', 'water leak', 'water leaks', 'moisture', 'wet'].some(word => hasPhrase(lower, word));
  const noteHasCabinet = ['cabinet', 'cabinets', 'drawer', 'drawers', 'cabinet maker'].some(word => hasPhrase(lower, word));
  const noteHasWallSurface = ['sheetrock', 'drywall', 'wall', 'walls', 'ceiling', 'paint'].some(word => hasPhrase(lower, word));
  const noteHasFan = ['fan', 'ceiling fan', 'fan blade', 'squeak', 'squeaking', 'balance', 'out of balance'].some(word => hasPhrase(lower, word));
  const noteHasGutter = ['gutter', 'gutters', 'downspout', 'downspouts', 'gutter clogged', 'clogged gutter', 'blocked downspout', 'overflowing'].some(word => hasPhrase(lower, word));
  const noteHasHvac = ['hvac', 'ac', 'a c', 'air conditioner', 'not cooling', 'weak air', 'airflow', 'air flow', 'filter', 'dirty filter', 'thermostat'].some(word => hasPhrase(lower, word));
  const noteHasElectrical = ['outlet', 'receptacle', 'plug', 'switch', 'light switch', 'gfci', 'breaker', 'electrical', 'panel', 'smoke detector'].some(word => hasPhrase(lower, word));
  const noteHasDoor = ['door', 'doors', 'hinge', 'lock', 'handle', 'sticks', 'sticking', 'won t latch', 'wont latch'].some(word => hasPhrase(lower, word));
  const noteHasWindow = ['window', 'windows', 'window lock', 'screen', 'sash', 'won t open', 'wont open', 'stuck window'].some(word => hasPhrase(lower, word));
  const noteHasMoisture = ['moisture', 'water stain', 'stain', 'staining', 'soft spot', 'mold', 'mildew'].some(word => hasPhrase(lower, word));
  const noteHasPest = ['pest', 'wasp', 'wasps', 'ants', 'ant', 'termite', 'termite tubes', 'droppings', 'rodent'].some(word => hasPhrase(lower, word));
  const noteHasWaterHeater = ['water heater', 'expansion tank'].some(word => hasPhrase(lower, word));
  const noteHasValve = ['shutoff valve', 'shut off valve', 'supply valve'].some(word => hasPhrase(lower, word));
  const noteHasDishwasher = ['dishwasher', 'dishwasher drain hose'].some(word => hasPhrase(lower, word));

  if (noteHasGutter) {
    if (hasPhrase(lower, 'downspout')) {
      const downspoutItem = items.find(item => hasPhrase(normalizeWalkthroughText(item), 'downspout'));
      if (downspoutItem) return downspoutItem;
    }
    const gutterItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['gutter', 'gutters', 'downspout', 'downspouts'].some(word => hasPhrase(itemLower, word));
    });
    if (gutterItem) return gutterItem;
  }

  if (noteHasWaterHeater) {
    const waterHeaterItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return hasPhrase(lower, 'expansion tank')
        ? hasPhrase(itemLower, 'expansion tank')
        : hasPhrase(itemLower, 'water heater');
    });
    if (waterHeaterItem) return waterHeaterItem;
  }

  if (noteHasDishwasher) {
    const dishwasherItem = items.find(item => hasPhrase(normalizeWalkthroughText(item), 'dishwasher'));
    if (dishwasherItem) return dishwasherItem;
  }

  if (noteHasValve) {
    const valveItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['shutoff', 'shut off', 'valve'].some(word => hasPhrase(itemLower, word));
    });
    if (valveItem) return valveItem;
  }

  if (noteHasHvac) {
    const hvacItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      if (hasPhrase(lower, 'filter') || hasPhrase(lower, 'dirty filter')) return hasPhrase(itemLower, 'filter');
      if (hasPhrase(lower, 'thermostat')) return hasPhrase(itemLower, 'thermostat');
      return ['hvac', 'airflow', 'air flow', 'register', 'outdoor unit', 'condenser', 'visible airflow'].some(word => hasPhrase(itemLower, word));
    });
    if (hvacItem) return hvacItem;
  }

  if (noteHasElectrical) {
    const electricalItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      if (hasPhrase(lower, 'smoke detector')) return hasPhrase(itemLower, 'smoke detector');
      if (hasPhrase(lower, 'outlet') || hasPhrase(lower, 'receptacle') || hasPhrase(lower, 'plug')) {
        return ['outlet', 'outlets', 'receptacle', 'receptacles', 'gfci'].some(word => hasPhrase(itemLower, word));
      }
      if (hasPhrase(lower, 'switch')) return ['switch', 'switches', 'light fixture'].some(word => hasPhrase(itemLower, word));
      return ['electrical', 'panel', 'breaker', 'gfci'].some(word => hasPhrase(itemLower, word));
    });
    if (electricalItem) return electricalItem;
  }

  if (noteHasDoor || noteHasWindow) {
    const doorWindowItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return noteHasDoor
        ? ['door', 'doors', 'lock', 'hardware', 'hinge'].some(word => hasPhrase(itemLower, word))
        : ['window', 'windows', 'screen', 'screens', 'lock'].some(word => hasPhrase(itemLower, word));
    });
    if (doorWindowItem) return doorWindowItem;
  }

  if (noteHasPest) {
    const pestItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['pest', 'pests', 'termite', 'ants', 'wasp', 'droppings'].some(word => hasPhrase(itemLower, word));
    });
    if (pestItem) return pestItem;
  }

  if (noteHasMoisture && !noteHasSink && !noteHasDrain) {
    const moistureItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['moisture', 'staining', 'stain', 'leak', 'water', 'soft spot', 'visible damage'].some(word => hasPhrase(itemLower, word));
    });
    if (moistureItem) return moistureItem;
  }

  if (noteHasFan) {
    const fanItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['ceiling fan', 'fan', 'light fixture', 'fixtures'].some(word => hasPhrase(itemLower, word));
    });
    if (fanItem) return fanItem;
  }

  if (noteHasCabinet) {
    const cabinetItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['cabinet', 'cabinets', 'drawer', 'drawers'].some(word => hasPhrase(itemLower, word));
    });
    if (cabinetItem) return cabinetItem;
  }

  if (noteHasWallSurface) {
    const wallItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['wall', 'walls', 'ceiling', 'sheetrock', 'drywall', 'paint'].some(word => hasPhrase(itemLower, word));
    });
    if (wallItem) return wallItem;
  }

  if (noteHasDisposal) {
    const disposalItem = items.find(item => ['disposal', 'garbage disposal', 'garburator'].some(word => hasPhrase(normalizeWalkthroughText(item), word)));
    if (disposalItem) return disposalItem;
  }

  if (noteHasSink && noteHasDrain) {
    const sinkDrainItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['sink', 'sinks', 'faucet', 'vanity', 'under sink'].some(word => hasPhrase(itemLower, word)) &&
        ['drain', 'drains', 'drainage', 'waste', 'p trap', 'p-trap'].some(word => hasPhrase(itemLower, word));
    });
    if (sinkDrainItem) return sinkDrainItem;
    const sinkItem = items.find(item => ['sink', 'sinks', 'faucet', 'vanity', 'under sink'].some(word => hasPhrase(normalizeWalkthroughText(item), word)));
    if (sinkItem) return sinkItem;
  }

  if ((noteHasSink || noteHasLeak) && noteHasLeak && !noteHasToilet) {
    const sinkLeakItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      const sinkRelated = ['sink', 'sinks', 'under sink', 'vanity', 'shut off', 'shutoff', 'supply line', 'plumbing'].some(word => hasPhrase(itemLower, word));
      const leakRelated = ['leak', 'leaks', 'water leak', 'water leaks', 'moisture'].some(word => hasPhrase(itemLower, word));
      return sinkRelated && leakRelated;
    });
    if (sinkLeakItem) return sinkLeakItem;
  }

  if (noteHasSink && !noteHasToilet) {
    const underSinkItem = items.find(item => {
      const itemLower = normalizeWalkthroughText(item);
      return ['under sink', 'under-sink', 'shut off', 'shutoff', 'supply line'].some(word => hasPhrase(itemLower, word));
    });
    if (underSinkItem) return underSinkItem;
    const sinkItem = items.find(item => ['sink', 'sinks', 'faucet', 'vanity'].some(word => hasPhrase(normalizeWalkthroughText(item), word)));
    if (sinkItem) return sinkItem;
  }

  const scored = items.map(item => {
    const itemLower = normalizeWalkthroughText(item);
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
    if (noteHasSink && noteHasLeak && (hasPhrase(itemLower, 'leak') || hasPhrase(itemLower, 'leaks')) && (hasPhrase(itemLower, 'sink') || hasPhrase(itemLower, 'under sink') || hasPhrase(itemLower, 'shut off'))) score += 25;
    if (noteHasSink && noteHasLeak && (hasPhrase(itemLower, 'operation') || hasPhrase(itemLower, 'water pressure'))) score -= 8;
    if (noteHasSink && hasPhrase(itemLower, 'toilet')) score -= 20;
    if (noteHasToilet && (hasPhrase(itemLower, 'sink') || hasPhrase(itemLower, 'faucet'))) score -= 20;
    if ((hasPhrase(lower, 'shower') || hasPhrase(lower, 'tub')) && hasPhrase(itemLower, 'toilet')) score -= 8;
    if (noteHasFan && hasPhrase(itemLower, 'outlet')) score -= 25;
    if (noteHasCabinet && (hasPhrase(itemLower, 'under sink') || hasPhrase(itemLower, 'plumbing'))) score -= 16;
    if (noteHasWallSurface && hasPhrase(itemLower, 'flooring')) score -= 18;
    if (noteHasGutter && (hasPhrase(itemLower, 'gutter') || hasPhrase(itemLower, 'downspout'))) score += 28;
    if (noteHasHvac && (hasPhrase(itemLower, 'hvac') || hasPhrase(itemLower, 'filter') || hasPhrase(itemLower, 'airflow') || hasPhrase(itemLower, 'thermostat'))) score += 22;
    if (noteHasElectrical && (hasPhrase(itemLower, 'outlet') || hasPhrase(itemLower, 'switch') || hasPhrase(itemLower, 'gfci') || hasPhrase(itemLower, 'panel') || hasPhrase(itemLower, 'smoke detector'))) score += 22;
    if (noteHasDoor && hasPhrase(itemLower, 'door')) score += 20;
    if (noteHasWindow && hasPhrase(itemLower, 'window')) score += 20;
    if (noteHasPest && hasPhrase(itemLower, 'pest')) score += 20;
    if (noteHasMoisture && (hasPhrase(itemLower, 'moisture') || hasPhrase(itemLower, 'staining') || hasPhrase(itemLower, 'water'))) score += 16;
    if (noteHasWaterHeater && (hasPhrase(itemLower, 'water heater') || hasPhrase(itemLower, 'expansion tank'))) score += 22;
    if (noteHasValve && (hasPhrase(itemLower, 'valve') || hasPhrase(itemLower, 'shutoff') || hasPhrase(itemLower, 'shut off'))) score += 22;
    if (noteHasDishwasher && hasPhrase(itemLower, 'dishwasher')) score += 22;

    return { item, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].item : items[0];
}

export function detectItemFromNote(note: string, items: string[]): string | null {
  if (items.length === 0) return null;
  const item = findBestChecklistItem(note, items);
  return checklistMatchConfidence(note, item) > 0 ? item : null;
}

export function uniqueWalkthroughChecklistItemLabel(baseItem: string, existingItems: string[]) {
  const normalizedExisting = new Set(existingItems.map(item => normalizeWalkthroughText(item)));
  if (!normalizedExisting.has(normalizeWalkthroughText(baseItem))) return baseItem;

  let index = 2;
  let candidate = `${baseItem} (${index})`;
  while (normalizedExisting.has(normalizeWalkthroughText(candidate))) {
    index += 1;
    candidate = `${baseItem} (${index})`;
  }
  return candidate;
}

export type ServiceCategorySuggestion = {
  category: string;
  score: number;
  reasons: string[];
};

export type ClassificationResult = {
  rankedServiceTypes: ServiceCategorySuggestion[];
  ambiguous: boolean;
  suggestedCleanedText: string;
};

const DEFAULT_SERVICE_CATEGORIES = [
  'HVAC',
  'Plumbing',
  'Electrical',
  'Roofing',
  'Gutters',
  'Concrete',
  'Masonry',
  'Foundation Repair',
  'Framing',
  'Carpentry',
  'Cabinets',
  'Countertops',
  'Flooring',
  'Tile',
  'Drywall',
  'Painting',
  'Siding',
  'Windows',
  'Doors',
  'Garage Doors',
  'Decks',
  'Fencing',
  'Landscaping',
  'Lawn Care',
  'Tree Service',
  'Irrigation',
  'Pest Control',
  'Septic',
  'Well Service',
  'Insulation',
  'Chimney',
  'Appliance Repair',
  'Locksmith',
  'Cleaning Service',
  'Pressure Washing',
  'Pool Service',
  'Moving Service',
  'Handyman',
  'General Maintenance',
  'Other',
];

const GENERIC_OR_LOCATION_TERMS = new Set([
  'issue',
  'problem',
  'broken',
  'repair',
  'fix',
  'look',
  'check',
  'noise',
  'smell',
  'water',
  'leak',
  'wet',
  'raised',
  'loose',
  'attic',
  'garage',
  'wall',
  'ceiling',
  'outside',
  'room',
  'house',
  'home',
  'floor',
]);

type CategoryRule = {
  category: string;
  phrases: string[];
  score: number;
  reason: string;
};

const PHRASE_RULES: CategoryRule[] = [
  {
    category: 'Roofing',
    score: 12,
    reason: 'roof shingle condition',
    phrases: [
      'shingles raised',
      'raised shingles',
      'lifted shingles',
      'loose shingles',
      'shingles loose',
      'curling shingles',
      'shingles curling',
      'buckling shingles',
      'shingles buckling',
      'missing shingles',
      'shingles missing',
      'shingles coming up',
      'roof shingles coming up',
    ],
  },
  {
    category: 'Roofing',
    score: 11,
    reason: 'roof exterior condition',
    phrases: ['flashing loose', 'flashing damaged', 'fascia rotting', 'soffit damaged', 'storm damage roof', 'drip from roof'],
  },
  {
    category: 'Roofing',
    score: 11,
    reason: 'roof leak or rain source',
    phrases: ['roof leak', 'leaking roof', 'leak in attic', 'attic leak after rain', 'water stain on ceiling after rain'],
  },
  { category: 'Plumbing', score: 10, reason: 'possible plumbing source', phrases: ['leak in attic'] },
  { category: 'HVAC', score: 7, reason: 'possible HVAC condensation or attic unit leak', phrases: ['leak in attic'] },
  {
    category: 'Plumbing',
    score: 11,
    reason: 'plumbing fixture or pipe symptom',
    phrases: [
      'water under sink',
      'pipe leaking',
      'leaking pipe',
      'sink leaking',
      'faucet dripping',
      'toilet running',
      'toilet clogged',
      'drain clogged',
      'shower not draining',
      'tub not draining',
      'garbage disposal leaking',
      'water heater leaking',
      'low water pressure',
    ],
  },
  { category: 'Septic', score: 10, reason: 'septic symptom', phrases: ['septic backup', 'septic tank', 'drain field'] },
  { category: 'Plumbing', score: 8, reason: 'sewer or drain odor', phrases: ['sewer smell'] },
  {
    category: 'HVAC',
    score: 11,
    reason: 'heating or cooling symptom',
    phrases: [
      'ac not cooling',
      'a c not cooling',
      'air conditioner not cooling',
      'ac making noise',
      'air conditioner making noise',
      'heater not working',
      'furnace not turning on',
      'thermostat not working',
      'condenser not running',
      'air handler leaking',
      'attic ac unit leaking',
      'attic a c unit leaking',
      'condensation near ac',
      'vent dripping',
      'weak airflow',
      'unit frozen',
      'warm air from vents',
    ],
  },
  { category: 'HVAC', score: 9, reason: 'possible air or duct noise', phrases: ['noise in wall'] },
  {
    category: 'Electrical',
    score: 11,
    reason: 'electrical symptom',
    phrases: [
      'outlet not working',
      'no power to outlet',
      'breaker tripping',
      'breaker keeps tripping',
      'lights flickering',
      'sparks',
      'switch not working',
      'gfci wont reset',
      'gfci won t reset',
      'ceiling fan not working',
      'no power in room',
      'electrical panel issue',
    ],
  },
  {
    category: 'Pest Control',
    score: 11,
    reason: 'pest evidence',
    phrases: [
      'pest activity',
      'bugs',
      'roaches',
      'ants',
      'termites',
      'bees',
      'wasps',
      'rats',
      'mice',
      'rodents',
      'droppings',
      'scratching in wall',
      'scratching in attic',
      'nest',
      'infestation',
      'animal in attic',
      'critters',
    ],
  },
  {
    category: 'Garage Doors',
    score: 11,
    reason: 'garage door symptom',
    phrases: [
      'garage door',
      'garage door wont open',
      'garage door won t open',
      'garage door stuck',
      'garage door off track',
      'broken garage spring',
      'garage door spring',
      'opener not working',
      'garage remote not working',
      'garage door cable',
    ],
  },
  {
    category: 'Appliance Repair',
    score: 11,
    reason: 'appliance symptom',
    phrases: [
      'dishwasher not draining',
      'dishwasher leaking',
      'refrigerator not cooling',
      'freezer not freezing',
      'washer leaking',
      'washer not spinning',
      'dryer not heating',
      'oven not heating',
      'microwave not working',
      'stove burner not working',
    ],
  },
  {
    category: 'Gutters',
    score: 10,
    reason: 'gutter or drainage symptom',
    phrases: [
      'gutter overflowing',
      'downspout clogged',
      'water pooling outside',
      'standing water near house',
      'drainage issue',
      'erosion near foundation',
      'water outside near foundation',
    ],
  },
  { category: 'Windows', score: 9, reason: 'window symptom', phrases: ['window leaking', 'window wont open', 'broken window', 'draft around window'] },
  { category: 'Doors', score: 9, reason: 'door symptom', phrases: ['door sticks', 'door wont latch', 'draft around door', 'exterior door leaking'] },
  { category: 'Drywall', score: 9, reason: 'drywall or wall symptom', phrases: ['drywall hole', 'hole in wall', 'wall crack', 'ceiling crack', 'water stain on drywall', 'texture repair'] },
  { category: 'Painting', score: 9, reason: 'paint symptom', phrases: ['paint peeling', 'paint bubbling'] },
  { category: 'Tile', score: 9, reason: 'tile symptom', phrases: ['cracked tile', 'loose tile', 'grout cracked'] },
  { category: 'Flooring', score: 9, reason: 'flooring symptom', phrases: ['floor soft spot', 'flooring buckling', 'hardwood buckling', 'carpet damaged'] },
  {
    category: 'Handyman',
    score: 8,
    reason: 'small repair symptom',
    phrases: ['loose handrail', 'cabinet loose', 'small repair', 'trim damaged', 'minor home repair', 'door hinge squeaks', 'caulking', 'small fix'],
  },
  { category: 'General Maintenance', score: 8, reason: 'general maintenance request', phrases: ['general maintenance'] },
  { category: 'Landscaping', score: 8, reason: 'landscaping symptom', phrases: ['yard drainage', 'grading', 'water in yard'] },
  { category: 'Lawn Care', score: 8, reason: 'lawn care symptom', phrases: ['mowing', 'lawn', 'grass', 'sod'] },
  { category: 'Tree Service', score: 8, reason: 'tree service symptom', phrases: ['tree limb', 'tree branch', 'tree removal', 'stump'] },
  { category: 'Irrigation', score: 8, reason: 'irrigation symptom', phrases: ['sprinkler', 'irrigation', 'sprinkler head'] },
  { category: 'Pool Service', score: 8, reason: 'pool service symptom', phrases: ['pool pump', 'pool filter', 'pool heater', 'pool water'] },
  { category: 'Well Service', score: 8, reason: 'well service symptom', phrases: ['well pump', 'pressure tank', 'no water'] },
  { category: 'Foundation Repair', score: 8, reason: 'foundation symptom', phrases: ['foundation crack', 'settling', 'stair step crack', 'crawlspace support'] },
  { category: 'Masonry', score: 8, reason: 'masonry symptom', phrases: ['brick', 'mortar', 'stone', 'chimney brick', 'block wall'] },
  { category: 'Concrete', score: 8, reason: 'concrete symptom', phrases: ['driveway crack', 'sidewalk crack', 'concrete', 'trip hazard'] },
  { category: 'Siding', score: 8, reason: 'siding symptom', phrases: ['siding', 'vinyl siding', 'siding damage'] },
  { category: 'Insulation', score: 8, reason: 'insulation symptom', phrases: ['attic insulation', 'drafty', 'air sealing', 'insulation'] },
  { category: 'Chimney', score: 8, reason: 'chimney symptom', phrases: ['chimney', 'fireplace', 'flue', 'chimney cap'] },
  { category: 'Cleaning Service', score: 8, reason: 'cleaning request', phrases: ['deep clean', 'move out clean', 'house clean', 'odor cleaning'] },
  { category: 'Pressure Washing', score: 8, reason: 'pressure washing request', phrases: ['pressure wash', 'power wash', 'soft wash'] },
  { category: 'Locksmith', score: 8, reason: 'locksmith symptom', phrases: ['lock', 'locked out', 'rekey', 'deadbolt', 'smart lock'] },
];

const TRADE_SPECIFIC_SINGLE_TERMS: Record<string, string[]> = {
  Roofing: ['shingles', 'shingle', 'roof', 'flashing', 'soffit', 'fascia'],
  Electrical: ['outlet', 'breaker', 'gfci', 'switch'],
  HVAC: ['thermostat', 'furnace', 'ac', 'condenser'],
  Plumbing: ['toilet', 'sink', 'drain', 'pipe', 'faucet'],
  'Pest Control': ['termites', 'termite', 'bees', 'wasps', 'rats', 'mice', 'rodents', 'roaches', 'ants', 'droppings'],
  'Appliance Repair': ['dishwasher', 'refrigerator', 'freezer', 'washer', 'dryer', 'oven'],
  Gutters: ['gutter', 'gutters', 'downspout'],
  Drywall: ['drywall'],
  Painting: ['paint'],
  Tile: ['tile'],
  Flooring: ['flooring'],
  Locksmith: ['lock'],
};

const AMBIGUOUS_CONTEXT_RULES: CategoryRule[] = [
  { category: 'Roofing', score: 5, reason: 'possible leak source', phrases: ['leak', 'water', 'attic', 'ceiling', 'leak in attic', 'stain on ceiling'] },
  { category: 'Plumbing', score: 5, reason: 'possible plumbing source', phrases: ['leak', 'water', 'noise', 'smell', 'wall', 'ceiling', 'leak in attic', 'stain on ceiling'] },
  { category: 'HVAC', score: 5, reason: 'possible HVAC source', phrases: ['leak', 'water', 'noise', 'smell', 'attic', 'ceiling', 'leak in attic', 'stain on ceiling'] },
  { category: 'Gutters', score: 5, reason: 'possible drainage issue', phrases: ['water', 'water outside', 'outside water'] },
  { category: 'Landscaping', score: 4, reason: 'possible grading or yard drainage issue', phrases: ['water', 'water outside', 'outside water'] },
  { category: 'Pest Control', score: 5, reason: 'possible pest activity', phrases: ['noise', 'smell', 'garage', 'attic', 'wall', 'noise in wall', 'bad smell in house', 'garage problem'] },
  { category: 'Electrical', score: 4, reason: 'possible electrical issue', phrases: ['noise', 'garage', 'wall', 'noise in wall', 'garage problem'] },
  { category: 'General Maintenance', score: 4, reason: 'general issue review', phrases: ['noise', 'smell', 'garage', 'attic', 'garage problem', 'bad smell in house'] },
  { category: 'Garage Doors', score: 5, reason: 'possible garage door issue', phrases: ['garage', 'garage problem'] },
  { category: 'Drywall', score: 4, reason: 'possible wall or ceiling surface issue', phrases: ['wall', 'ceiling', 'stain on ceiling'] },
  { category: 'Insulation', score: 4, reason: 'possible attic or insulation issue', phrases: ['attic'] },
];

function normalizeClassifierText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(value: string) {
  return new Set(normalizeClassifierText(value).split(' ').filter(Boolean));
}

function hasPhrase(input: string, phrase: string) {
  const normalizedInput = ` ${normalizeClassifierText(input)} `;
  const normalizedPhrase = normalizeClassifierText(phrase);
  return Boolean(normalizedPhrase) && normalizedInput.includes(` ${normalizedPhrase} `);
}

function addScore(
  scores: Map<string, ServiceCategorySuggestion>,
  category: string,
  score: number,
  reason: string,
  matchedPhrase: string,
) {
  const current = scores.get(category) ?? { category, score: 0, reasons: [] };
  current.score += score;
  const nextReasons = [reason, matchedPhrase].filter(Boolean);
  for (const nextReason of nextReasons) {
    if (!current.reasons.some(existing => normalizeClassifierText(existing) === normalizeClassifierText(nextReason))) {
      current.reasons.push(nextReason);
    }
  }
  scores.set(category, current);
}

function applyRules(input: string, rules: CategoryRule[], scores: Map<string, ServiceCategorySuggestion>) {
  for (const rule of rules) {
    for (const phrase of rule.phrases) {
      if (hasPhrase(input, phrase)) {
        addScore(scores, rule.category, rule.score, rule.reason, phrase);
      }
    }
  }
}

function onlyGenericOrLocationWords(input: string) {
  const tokens = Array.from(tokenSet(input));
  return tokens.length > 0 && tokens.every(token => GENERIC_OR_LOCATION_TERMS.has(token));
}

function allowedSuggestionFilter(allowedCategories: string[]) {
  const allowed = new Set(allowedCategories.map(category => category.toLowerCase()));
  return (suggestion: ServiceCategorySuggestion) => allowed.has(suggestion.category.toLowerCase());
}

export function classifyHomeownerRequest(
  input: string,
  allowedCategories = DEFAULT_SERVICE_CATEGORIES,
): ClassificationResult {
  const normalized = normalizeClassifierText(input);
  if (!normalized) {
    return { rankedServiceTypes: [], ambiguous: false, suggestedCleanedText: '' };
  }

  const scores = new Map<string, ServiceCategorySuggestion>();
  applyRules(input, PHRASE_RULES, scores);
  applyRules(input, AMBIGUOUS_CONTEXT_RULES, scores);

  const tokens = tokenSet(input);
  for (const [category, terms] of Object.entries(TRADE_SPECIFIC_SINGLE_TERMS)) {
    for (const term of terms) {
      const normalizedTerm = normalizeClassifierText(term);
      if (tokens.has(normalizedTerm)) {
        addScore(scores, category, 8, 'trade-specific term', term);
      }
    }
  }

  if ((hasPhrase(input, 'opener') || hasPhrase(input, 'spring')) && (hasPhrase(input, 'garage') || hasPhrase(input, 'door'))) {
    addScore(scores, 'Garage Doors', 8, 'garage door component', 'garage door component');
  }
  if (hasPhrase(input, 'key') && (hasPhrase(input, 'lock') || hasPhrase(input, 'door'))) {
    addScore(scores, 'Locksmith', 7, 'lock or key issue', 'key');
  }
  if (hasPhrase(input, 'sewer smell')) {
    addScore(scores, 'Plumbing', 8, 'sewer or drain odor', 'sewer smell');
    addScore(scores, 'Septic', 15, 'possible septic issue', 'sewer smell');
  }
  if (hasPhrase(input, 'leak in attic')) {
    scores.delete('Pest Control');
  }

  const rankedServiceTypes = Array.from(scores.values())
    .filter(allowedSuggestionFilter(allowedCategories))
    .filter(suggestion => suggestion.category !== 'Other' && suggestion.score > 0)
    .map(suggestion => ({ ...suggestion, reasons: suggestion.reasons.slice(0, 4) }))
    .sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  const topScore = rankedServiceTypes[0]?.score ?? 0;
  const visibleSuggestions = topScore > 0
    ? rankedServiceTypes.filter(suggestion => suggestion.score >= Math.max(3, topScore - 7)).slice(0, 5)
    : [{ category: 'Other', score: 1, reasons: ['No clear trade match'] }].filter(allowedSuggestionFilter(allowedCategories));

  const secondScore = visibleSuggestions[1]?.score ?? 0;
  const thirdScore = visibleSuggestions[2]?.score ?? 0;
  const forceAmbiguous = [
    'leak in attic',
    'noise in wall',
    'bad smell in house',
    'stain on ceiling',
    'water outside',
    'outside water',
    'garage problem',
  ].some(phrase => hasPhrase(input, phrase));
  const ambiguous = Boolean(
    visibleSuggestions.length > 1
    && (forceAmbiguous || onlyGenericOrLocationWords(input) || topScore < 9 || topScore - secondScore <= 3 || topScore - thirdScore <= 4)
  );

  return {
    rankedServiceTypes: visibleSuggestions,
    ambiguous,
    suggestedCleanedText: cleanHomeownerRequestText(input),
  };
}

export function suggestServiceCategories(input: string, allowedCategories = DEFAULT_SERVICE_CATEGORIES) {
  return classifyHomeownerRequest(input, allowedCategories).rankedServiceTypes;
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function ensureSentencePunctuation(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function cleanHomeownerRequestText(input: string) {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  const normalized = normalizeClassifierText(trimmed);

  const exactCleanups: Array<{ phrases: string[]; text: string }> = [
    { phrases: ['shingles'], text: 'There is an issue with the roof shingles.' },
    { phrases: ['shingles raised', 'raised shingles'], text: 'The roof shingles appear to be raised.' },
    { phrases: ['lifted shingles'], text: 'The roof shingles appear to be lifted.' },
    { phrases: ['loose shingles'], text: 'The roof shingles appear to be loose.' },
    { phrases: ['missing shingles'], text: 'Some roof shingles appear to be missing.' },
    { phrases: ['leak in attic'], text: 'There appears to be a leak in the attic.' },
    { phrases: ['ac not cooling', 'a c not cooling', 'air conditioner not cooling'], text: 'The air conditioner is not cooling properly.' },
    { phrases: ['water under sink'], text: 'There is water under the sink.' },
    { phrases: ['pipe leaking', 'leaking pipe'], text: 'A pipe appears to be leaking.' },
    { phrases: ['toilet running'], text: 'The toilet keeps running.' },
    { phrases: ['drain clogged'], text: 'The drain appears to be clogged.' },
    { phrases: ['water heater leaking'], text: 'The water heater appears to be leaking.' },
    { phrases: ['low water pressure'], text: 'The water pressure is low.' },
    { phrases: ['sewer smell'], text: 'There is a sewer smell.' },
    { phrases: ['outlet not working'], text: 'An outlet is not working.' },
    { phrases: ['breaker keeps tripping', 'breaker tripping'], text: 'The breaker keeps tripping.' },
    { phrases: ['lights flickering'], text: 'The lights are flickering.' },
    { phrases: ['gfci wont reset', 'gfci won t reset'], text: 'The GFCI will not reset.' },
    { phrases: ['switch not working'], text: 'A switch is not working.' },
    { phrases: ['sparks'], text: 'There are sparks.' },
    { phrases: ['noise'], text: 'There is a noise.' },
    { phrases: ['smell'], text: 'There is a smell.' },
    { phrases: ['garage'], text: 'There is an issue in the garage.' },
    { phrases: ['attic'], text: 'There is an issue in the attic.' },
    { phrases: ['wall'], text: 'There is an issue with a wall.' },
    { phrases: ['ceiling'], text: 'There is an issue with the ceiling.' },
    { phrases: ['water'], text: 'There is a water-related issue.' },
    { phrases: ['roof leak', 'leaking roof'], text: 'There appears to be a roof leak.' },
    { phrases: ['attic leak after rain'], text: 'There appears to be a leak in the attic after rain.' },
    { phrases: ['water stain on ceiling after rain'], text: 'There is a water stain on the ceiling after rain.' },
    { phrases: ['stain on ceiling'], text: 'There is a stain on the ceiling.' },
    { phrases: ['pest activity in garage'], text: 'There is pest activity in the garage.' },
    { phrases: ['scratching in wall'], text: 'There is scratching in the wall.' },
    { phrases: ['scratching in attic'], text: 'There is scratching in the attic.' },
    { phrases: ['attic ac unit leaking', 'attic a c unit leaking'], text: 'The attic air conditioner unit appears to be leaking.' },
    { phrases: ['weak airflow'], text: 'The airflow appears to be weak.' },
    { phrases: ['thermostat not working'], text: 'The thermostat is not working.' },
    { phrases: ['heater not working'], text: 'The heater is not working.' },
    { phrases: ['furnace not turning on'], text: 'The furnace is not turning on.' },
    { phrases: ['vent dripping'], text: 'A vent appears to be dripping.' },
    { phrases: ['unit frozen'], text: 'The unit appears to be frozen.' },
    { phrases: ['garage door wont open', 'garage door won t open'], text: 'The garage door will not open.' },
    { phrases: ['garage door stuck'], text: 'The garage door appears to be stuck.' },
    { phrases: ['broken garage spring'], text: 'The garage door spring appears to be broken.' },
    { phrases: ['garage door off track'], text: 'The garage door appears to be off track.' },
    { phrases: ['opener not working'], text: 'The garage door opener is not working.' },
    { phrases: ['dishwasher not draining'], text: 'The dishwasher is not draining properly.' },
    { phrases: ['refrigerator not cooling'], text: 'The refrigerator is not cooling properly.' },
    { phrases: ['washer leaking'], text: 'The washer appears to be leaking.' },
    { phrases: ['dryer not heating'], text: 'The dryer is not heating.' },
    { phrases: ['oven not heating'], text: 'The oven is not heating.' },
    { phrases: ['noise in wall'], text: 'There is a noise in the wall.' },
    { phrases: ['bad smell in house'], text: 'There is a bad smell in the house.' },
    { phrases: ['water outside'], text: 'There is water outside the home.' },
    { phrases: ['garage problem'], text: 'There is a problem in the garage.' },
  ];
  const exactMatch = exactCleanups.find(item => item.phrases.some(phrase => normalized === normalizeClassifierText(phrase)));
  if (exactMatch) return exactMatch.text;

  let cleaned = trimmed
    .replace(/\bac\b/gi, 'air conditioner')
    .replace(/\ba c\b/gi, 'air conditioner')
    .replace(/\bgfci\b/gi, 'GFCI')
    .replace(/\bhvac\b/gi, 'HVAC')
    .replace(/\bwont\b/gi, 'will not')
    .replace(/\bwon t\b/gi, 'will not');

  if (!/^(there|the|an|a|water|pest|bees|rats|mice|termites|outlet|garage|dishwasher|roof|shingles|stain|bad smell|air conditioner|hvac|gfci)\b/i.test(cleaned)) {
    cleaned = `There is ${cleaned}`;
  }
  return ensureSentencePunctuation(sentenceCase(cleaned));
}

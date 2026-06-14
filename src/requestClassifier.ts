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
  'coming',
  'up',
  'raised',
  'loose',
  'broken',
  'not',
  'working',
  'cracked',
  'missing',
  'stuck',
  'clogged',
  'noisy',
  'board',
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

const BROAD_ACTION_TERMS = [
  'build',
  'repair',
  'fix',
  'install',
  'replace',
  'mount',
  'hang',
  'assemble',
  'remove',
  'patch',
  'adjust',
  'maintain',
  'troubleshoot',
  'inspect',
  'finish',
  'remodel',
  'update',
];

const CARPENTRY_FALLBACK_TERMS = [
  'build',
  'pergola',
  'deck',
  'fence',
  'gate',
  'trim',
  'molding',
  'cabinet',
  'door',
  'window',
  'frame',
  'framing',
  'wood',
  'stairs',
  'railing',
  'shelf',
  'shelves',
  'built in',
  'built-in',
  'porch',
  'patio cover',
  'gazebo',
  'fascia',
  'soffit',
];

type CategoryRule = {
  category: string;
  phrases: string[];
  score: number;
  reason: string;
};

type ObjectSymptomRule = {
  objects: string[];
  symptoms?: string[];
  matches: Array<{
    category: string;
    objectScore?: number;
    symptomScore: number;
    reason: string;
  }>;
};

type TradeObjectRule = {
  objects: string[];
  matches: Array<{
    category: string;
    score: number;
    reason: string;
  }>;
};

const TRADE_OBJECT_RULES: TradeObjectRule[] = [
  {
    objects: ['deck', 'deck board', 'deck boards', 'porch', 'porch board', 'porch boards', 'pergola', 'gazebo', 'patio cover'],
    matches: [
      { category: 'Decks', score: 12, reason: 'deck or porch object' },
      { category: 'Carpentry', score: 9, reason: 'wood structure object' },
      { category: 'Handyman', score: 8, reason: 'small exterior repair object' },
      { category: 'General Maintenance', score: 5, reason: 'general exterior maintenance object' },
    ],
  },
  {
    objects: ['steps', 'stairs', 'railing', 'handrail'],
    matches: [
      { category: 'Carpentry', score: 10, reason: 'step or railing object' },
      { category: 'Handyman', score: 9, reason: 'small step or railing repair object' },
      { category: 'Decks', score: 7, reason: 'exterior step or railing object' },
    ],
  },
  {
    objects: ['shingle', 'shingles', 'roof', 'flashing', 'fascia', 'soffit', 'ridge cap', 'roof vent'],
    matches: [{ category: 'Roofing', score: 13, reason: 'roofing object' }],
  },
  {
    objects: ['outlet', 'breaker', 'gfci', 'switch', 'panel', 'electrical panel', 'ceiling fan', 'power', 'fixture'],
    matches: [
      { category: 'Electrical', score: 13, reason: 'electrical object' },
      { category: 'Handyman', score: 5, reason: 'fixture or fan object' },
    ],
  },
  {
    objects: ['toilet', 'sink', 'drain', 'pipe', 'faucet', 'shower', 'tub', 'water heater', 'garbage disposal', 'sewer'],
    matches: [{ category: 'Plumbing', score: 13, reason: 'plumbing object' }],
  },
  {
    objects: ['thermostat', 'furnace', 'ac', 'air conditioner', 'air handler', 'condenser', 'heater', 'vent', 'vents', 'duct', 'airflow'],
    matches: [{ category: 'HVAC', score: 13, reason: 'HVAC object' }],
  },
  {
    objects: ['dishwasher', 'garbage disposal'],
    matches: [
      { category: 'Appliance Repair', score: 12, reason: 'appliance object' },
      { category: 'Plumbing', score: 8, reason: 'water-connected appliance object' },
    ],
  },
  {
    objects: ['refrigerator', 'freezer', 'washer', 'dryer', 'oven', 'microwave', 'stove', 'burner', 'ice maker'],
    matches: [{ category: 'Appliance Repair', score: 12, reason: 'appliance object' }],
  },
  {
    objects: ['garage door', 'garage remote', 'garage door opener', 'garage door spring', 'garage door cable'],
    matches: [{ category: 'Garage Doors', score: 13, reason: 'garage door object' }],
  },
  {
    objects: ['opener', 'spring', 'cable', 'track'],
    matches: [
      { category: 'Garage Doors', score: 7, reason: 'possible garage door component' },
      { category: 'General Maintenance', score: 4, reason: 'component needs more context' },
    ],
  },
  {
    objects: ['fence', 'gate', 'fence post', 'fence board'],
    matches: [
      { category: 'Fencing', score: 12, reason: 'fence or gate object' },
      { category: 'Carpentry', score: 9, reason: 'wood fence or gate object' },
      { category: 'Handyman', score: 8, reason: 'small fence or gate repair object' },
    ],
  },
  {
    objects: ['gutter', 'gutters', 'downspout'],
    matches: [{ category: 'Gutters', score: 13, reason: 'gutter object' }],
  },
  {
    objects: ['window'],
    matches: [
      { category: 'Windows', score: 13, reason: 'window object' },
      { category: 'Carpentry', score: 6, reason: 'window trim or framing object' },
      { category: 'Handyman', score: 5, reason: 'small window repair object' },
    ],
  },
  {
    objects: ['door'],
    matches: [
      { category: 'Doors', score: 12, reason: 'door object' },
      { category: 'Carpentry', score: 8, reason: 'door framing or trim object' },
      { category: 'Handyman', score: 8, reason: 'small door repair object' },
    ],
  },
  {
    objects: ['drywall'],
    matches: [
      { category: 'Drywall', score: 13, reason: 'drywall object' },
      { category: 'Handyman', score: 7, reason: 'small drywall repair object' },
      { category: 'Painting', score: 5, reason: 'paint finish may follow drywall repair' },
    ],
  },
  {
    objects: ['paint'],
    matches: [{ category: 'Painting', score: 13, reason: 'painting object' }],
  },
  {
    objects: ['tile', 'grout'],
    matches: [
      { category: 'Tile', score: 13, reason: 'tile object' },
      { category: 'Flooring', score: 9, reason: 'floor surface object' },
    ],
  },
  {
    objects: ['floor', 'flooring', 'hardwood', 'carpet'],
    matches: [
      { category: 'Flooring', score: 12, reason: 'flooring object' },
      { category: 'Foundation Repair', score: 7, reason: 'floor support may be relevant' },
      { category: 'Handyman', score: 7, reason: 'small floor repair object' },
    ],
  },
  {
    objects: ['lock', 'deadbolt', 'key', 'door lock'],
    matches: [{ category: 'Locksmith', score: 13, reason: 'locksmith object' }],
  },
  {
    objects: ['sprinkler', 'irrigation'],
    matches: [{ category: 'Irrigation', score: 13, reason: 'irrigation object' }],
  },
  {
    objects: ['tree', 'limb', 'branch', 'branches'],
    matches: [
      { category: 'Tree Service', score: 12, reason: 'tree object' },
      { category: 'Landscaping', score: 7, reason: 'landscape object' },
    ],
  },
  {
    objects: ['lawn', 'grass', 'yard'],
    matches: [
      { category: 'Lawn Care', score: 12, reason: 'lawn or yard object' },
      { category: 'Landscaping', score: 8, reason: 'landscape object' },
    ],
  },
  {
    objects: ['pool', 'spa', 'hot tub'],
    matches: [{ category: 'Pool Service', score: 13, reason: 'pool or spa object' }],
  },
  {
    objects: ['chimney', 'fireplace', 'flue', 'chimney cap'],
    matches: [{ category: 'Chimney', score: 13, reason: 'chimney object' }],
  },
  {
    objects: ['septic'],
    matches: [{ category: 'Septic', score: 13, reason: 'septic object' }],
  },
  {
    objects: ['well', 'well pump', 'pressure tank'],
    matches: [{ category: 'Well Service', score: 13, reason: 'well object' }],
  },
  {
    objects: ['concrete', 'driveway', 'patio', 'sidewalk'],
    matches: [{ category: 'Concrete', score: 12, reason: 'concrete object' }],
  },
  {
    objects: ['foundation', 'slab', 'crawlspace'],
    matches: [{ category: 'Foundation Repair', score: 13, reason: 'foundation object' }],
  },
  {
    objects: ['brick', 'block', 'masonry', 'mortar'],
    matches: [{ category: 'Masonry', score: 13, reason: 'masonry object' }],
  },
  {
    objects: ['siding', 'vinyl siding'],
    matches: [{ category: 'Siding', score: 13, reason: 'siding object' }],
  },
  {
    objects: ['insulation'],
    matches: [{ category: 'Insulation', score: 13, reason: 'insulation object' }],
  },
];

const COMMON_SYMPTOMS = [
  'coming up',
  'raised',
  'loose',
  'broken',
  'not working',
  'wont work',
  'will not work',
  'wont open',
  'will not open',
  'wont close',
  'will not close',
  'leaking',
  'leak',
  'cracked',
  'crack',
  'missing',
  'stuck',
  'clogged',
  'not draining',
  'overflowing',
  'flickering',
  'tripping',
  'sagging',
  'soft',
  'rotted',
  'rot',
  'leaning',
  'peeling',
  'bubbling',
  'buckling',
  'dirty',
];

const OBJECT_SYMPTOM_RULES: ObjectSymptomRule[] = [
  {
    objects: ['deck board', 'deck boards', 'deck', 'porch boards', 'deck railing', 'wood rot on deck', 'soft deck board'],
    symptoms: ['coming up', 'raised', 'loose', 'soft', 'sagging', 'rot', 'rotted', 'broken'],
    matches: [
      { category: 'Decks', objectScore: 6, symptomScore: 13, reason: 'deck object and symptom' },
      { category: 'Carpentry', symptomScore: 12, reason: 'wood repair possible' },
      { category: 'Handyman', symptomScore: 11, reason: 'small deck repair possible' },
    ],
  },
  {
    objects: ['porch step', 'porch steps', 'steps', 'stairs', 'railing', 'handrail'],
    symptoms: ['loose', 'broken', 'coming up', 'sagging', 'rotted', 'rot'],
    matches: [
      { category: 'Carpentry', objectScore: 5, symptomScore: 12, reason: 'step or railing carpentry issue' },
      { category: 'Handyman', symptomScore: 11, reason: 'small step or railing repair possible' },
      { category: 'Decks', symptomScore: 10, reason: 'porch or exterior step repair possible' },
    ],
  },
  {
    objects: ['shingle', 'shingles', 'roof', 'flashing', 'fascia', 'soffit', 'ridge cap', 'roof vent'],
    symptoms: ['coming up', 'raised', 'loose', 'lifted', 'curling', 'buckling', 'missing', 'leaking', 'leak', 'damaged', 'rotting', 'broken'],
    matches: [{ category: 'Roofing', objectScore: 8, symptomScore: 13, reason: 'roof object and symptom' }],
  },
  {
    objects: ['sink', 'faucet', 'toilet', 'drain', 'pipe', 'shower', 'tub', 'water heater', 'garbage disposal', 'sewer'],
    symptoms: ['leaking', 'leak', 'dripping', 'running', 'clogged', 'not draining', 'low pressure', 'backup', 'not working'],
    matches: [{ category: 'Plumbing', objectScore: 7, symptomScore: 12, reason: 'plumbing object and symptom' }],
  },
  {
    objects: ['septic'],
    symptoms: ['backup', 'smell', 'not working', 'overflowing'],
    matches: [
      { category: 'Septic', objectScore: 7, symptomScore: 12, reason: 'septic object and symptom' },
      { category: 'Plumbing', symptomScore: 7, reason: 'septic or drain issue may need plumbing review' },
    ],
  },
  {
    objects: ['outlet', 'switch', 'breaker', 'panel', 'gfci', 'lights', 'ceiling fan', 'power', 'fixture'],
    symptoms: ['not working', 'wont reset', 'will not reset', 'tripping', 'flickering', 'sparks', 'loose', 'broken'],
    matches: [
      { category: 'Electrical', objectScore: 8, symptomScore: 13, reason: 'electrical object and symptom' },
      { category: 'Handyman', symptomScore: 8, reason: 'fixture or fan repair may be handyman work' },
    ],
  },
  {
    objects: ['ac', 'air conditioner', 'air handler', 'furnace', 'heater', 'thermostat', 'condenser', 'vents', 'vent', 'duct', 'airflow', 'unit'],
    symptoms: ['not cooling', 'not heating', 'not working', 'leaking', 'dripping', 'weak', 'frozen', 'making noise'],
    matches: [{ category: 'HVAC', objectScore: 8, symptomScore: 13, reason: 'HVAC object and symptom' }],
  },
  {
    objects: ['garage door', 'opener', 'garage remote', 'spring', 'cable', 'track'],
    symptoms: ['not working', 'wont open', 'will not open', 'stuck', 'off track', 'broken', 'loose'],
    matches: [{ category: 'Garage Doors', objectScore: 8, symptomScore: 13, reason: 'garage door object and symptom' }],
  },
  {
    objects: ['pest', 'pests', 'bugs', 'roaches', 'ants', 'termites', 'bees', 'wasps', 'rats', 'mice', 'rodents', 'droppings', 'scratching', 'nest', 'infestation', 'animal'],
    symptoms: ['activity', 'in attic', 'in wall', 'in garage', 'droppings', 'scratching', 'nest', 'infestation'],
    matches: [{ category: 'Pest Control', objectScore: 9, symptomScore: 12, reason: 'pest evidence or activity' }],
  },
  {
    objects: ['gutter', 'gutters', 'downspout', 'drainage'],
    symptoms: ['overflowing', 'clogged', 'standing water', 'water pooling', 'erosion', 'water near foundation', 'issue'],
    matches: [
      { category: 'Gutters', objectScore: 8, symptomScore: 12, reason: 'gutter or drainage object and symptom' },
      { category: 'Landscaping', symptomScore: 5, reason: 'grading or drainage may involve landscaping' },
    ],
  },
  {
    objects: ['fence', 'gate', 'fence post', 'fence board', 'latch'],
    symptoms: ['leaning', 'broken', 'wont close', 'will not close', 'not closing', 'loose', 'stuck'],
    matches: [
      { category: 'Fencing', objectScore: 8, symptomScore: 13, reason: 'fence or gate object and symptom' },
      { category: 'Handyman', symptomScore: 9, reason: 'small gate or latch repair possible' },
    ],
  },
  {
    objects: ['window'],
    symptoms: ['leaking', 'leak', 'wont open', 'will not open', 'broken', 'draft', 'stuck'],
    matches: [{ category: 'Windows', objectScore: 8, symptomScore: 13, reason: 'window object and symptom' }],
  },
  {
    objects: ['door', 'frame', 'latch', 'weatherstrip'],
    symptoms: ['sticks', 'sticking', 'wont latch', 'will not latch', 'wont open', 'will not open', 'wont close', 'will not close', 'draft', 'leaking', 'broken'],
    matches: [
      { category: 'Doors', objectScore: 8, symptomScore: 13, reason: 'door object and symptom' },
      { category: 'Handyman', symptomScore: 18, reason: 'door adjustment may be handyman work' },
    ],
  },
  {
    objects: ['drywall', 'wall', 'ceiling', 'texture'],
    symptoms: ['hole', 'crack', 'cracked', 'water stain', 'stain', 'repair'],
    matches: [
      { category: 'Drywall', objectScore: 7, symptomScore: 12, reason: 'drywall or surface object and symptom' },
      { category: 'Roofing', symptomScore: 4, reason: 'ceiling stains may come from roof leaks' },
      { category: 'Foundation Repair', symptomScore: 4, reason: 'wall or ceiling cracks may indicate movement' },
    ],
  },
  {
    objects: ['paint'],
    symptoms: ['peeling', 'bubbling', 'cracked', 'dirty'],
    matches: [{ category: 'Painting', objectScore: 7, symptomScore: 12, reason: 'paint object and symptom' }],
  },
  {
    objects: ['tile', 'grout'],
    symptoms: ['cracked', 'crack', 'loose', 'broken'],
    matches: [
      { category: 'Tile', objectScore: 8, symptomScore: 13, reason: 'tile object and symptom' },
      { category: 'Flooring', symptomScore: 27, reason: 'floor surface repair possible' },
    ],
  },
  {
    objects: ['floor', 'flooring', 'hardwood', 'carpet'],
    symptoms: ['soft spot', 'soft', 'buckling', 'damaged', 'cracked', 'loose'],
    matches: [
      { category: 'Flooring', objectScore: 8, symptomScore: 12, reason: 'flooring object and symptom' },
      { category: 'Foundation Repair', symptomScore: 17, reason: 'soft or uneven floor may indicate support movement' },
      { category: 'Handyman', symptomScore: 17, reason: 'small floor repair possible' },
    ],
  },
  {
    objects: ['dishwasher', 'refrigerator', 'freezer', 'washer', 'dryer', 'oven', 'microwave', 'stove', 'burner', 'ice maker'],
    symptoms: ['not working', 'not draining', 'not cooling', 'not freezing', 'leaking', 'not spinning', 'not heating'],
    matches: [
      { category: 'Appliance Repair', objectScore: 8, symptomScore: 13, reason: 'appliance object and symptom' },
      { category: 'Plumbing', symptomScore: 5, reason: 'appliance leak or drain may need plumbing review' },
    ],
  },
  {
    objects: ['lock', 'key', 'deadbolt', 'door lock'],
    symptoms: ['stuck', 'locked out', 'not working', 'broken', 'wont open', 'will not open'],
    matches: [
      { category: 'Locksmith', objectScore: 8, symptomScore: 13, reason: 'lock object and symptom' },
      { category: 'Doors', symptomScore: 17, reason: 'door hardware issue possible' },
    ],
  },
  {
    objects: ['foundation', 'slab'],
    symptoms: ['crack', 'cracked', 'settling', 'uneven'],
    matches: [{ category: 'Foundation Repair', objectScore: 8, symptomScore: 13, reason: 'foundation object and symptom' }],
  },
  {
    objects: ['concrete', 'driveway', 'patio', 'sidewalk'],
    symptoms: ['crack', 'cracked', 'uneven', 'trip hazard'],
    matches: [{ category: 'Concrete', objectScore: 8, symptomScore: 12, reason: 'concrete object and symptom' }],
  },
  {
    objects: ['brick', 'block', 'masonry', 'mortar'],
    symptoms: ['crack', 'cracked', 'loose', 'broken'],
    matches: [{ category: 'Masonry', objectScore: 8, symptomScore: 12, reason: 'masonry object and symptom' }],
  },
  {
    objects: ['sprinkler', 'irrigation'],
    symptoms: ['not working', 'broken', 'leaking', 'wont turn on', 'will not turn on'],
    matches: [{ category: 'Irrigation', objectScore: 8, symptomScore: 13, reason: 'irrigation object and symptom' }],
  },
  {
    objects: ['tree', 'limb', 'branch', 'branches'],
    symptoms: ['hanging', 'broken', 'down', 'removal'],
    matches: [{ category: 'Tree Service', objectScore: 8, symptomScore: 13, reason: 'tree object and symptom' }],
  },
  {
    objects: ['yard', 'lawn', 'grass'],
    symptoms: ['cleanup', 'brown spots', 'dead spots', 'overgrown'],
    matches: [
      { category: 'Lawn Care', objectScore: 7, symptomScore: 11, reason: 'lawn object and symptom' },
      { category: 'Landscaping', symptomScore: 14, reason: 'yard work possible' },
      { category: 'Irrigation', symptomScore: 14, reason: 'lawn spots may relate to irrigation' },
    ],
  },
  {
    objects: ['clean', 'cleaning', 'deep clean', 'move out clean', 'house'],
    symptoms: ['deep clean', 'cleaning', 'clean'],
    matches: [{ category: 'Cleaning Service', objectScore: 7, symptomScore: 12, reason: 'cleaning request' }],
  },
  {
    objects: ['pressure wash', 'power wash', 'driveway', 'siding'],
    symptoms: ['pressure wash', 'power wash', 'dirty', 'mold on exterior'],
    matches: [{ category: 'Pressure Washing', objectScore: 7, symptomScore: 12, reason: 'pressure washing request' }],
  },
];

const PHRASE_RULES: CategoryRule[] = [
  {
    category: 'Carpentry',
    score: 13,
    reason: 'wood structure request',
    phrases: [
      'build pergola',
      'install pergola',
      'repair pergola',
      'install trim',
      'repair trim',
      'install cabinet',
      'repair cabinet',
      'build shelves',
      'install shelves',
      'build shelf',
      'install shelf',
      'patio cover',
      'build gazebo',
      'install gazebo',
    ],
  },
  {
    category: 'Handyman',
    score: 10,
    reason: 'small project or repair request',
    phrases: [
      'build pergola',
      'install pergola',
      'repair pergola',
      'build deck',
      'repair deck',
      'repair fence',
      'install door',
      'repair drywall',
      'install outlet',
      'fix toilet',
      'mount',
      'hang',
      'assemble',
      'patch',
      'adjust',
    ],
  },
  {
    category: 'Decks',
    score: 10,
    reason: 'deck structure request',
    phrases: ['build deck', 'install deck', 'repair deck', 'deck repair'],
  },
  {
    category: 'Fencing',
    score: 11,
    reason: 'fence or gate request',
    phrases: ['repair fence', 'install fence', 'build fence', 'repair gate', 'install gate'],
  },
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
      'install outlet',
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
  { category: 'Landscaping', score: 23, reason: 'possible yard drainage issue', phrases: ['water pooling outside', 'standing water near house'] },
  { category: 'Landscaping', score: 18, reason: 'possible yard drainage issue', phrases: ['drainage issue'] },
  { category: 'Plumbing', score: 23, reason: 'possible water source issue', phrases: ['water pooling outside'] },
  { category: 'Windows', score: 9, reason: 'window symptom', phrases: ['window leaking', 'window wont open', 'broken window', 'draft around window'] },
  { category: 'Doors', score: 9, reason: 'door symptom', phrases: ['door sticks', 'door wont latch', 'draft around door', 'exterior door leaking'] },
  { category: 'Drywall', score: 9, reason: 'drywall or wall symptom', phrases: ['drywall hole', 'hole in wall', 'wall crack', 'ceiling crack', 'water stain on drywall', 'texture repair', 'repair drywall', 'patch drywall'] },
  { category: 'Roofing', score: 10, reason: 'possible ceiling stain source', phrases: ['stain on ceiling'] },
  { category: 'Plumbing', score: 10, reason: 'possible ceiling stain source', phrases: ['stain on ceiling'] },
  { category: 'HVAC', score: 10, reason: 'possible ceiling stain source', phrases: ['stain on ceiling'] },
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
  { category: 'Masonry', score: 12, reason: 'masonry wall crack', phrases: ['brick wall crack'] },
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
  Decks: ['deck', 'porch'],
  Fencing: ['fence', 'gate'],
  Doors: ['door'],
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
  { category: 'Plumbing', score: 4, reason: 'possible exterior water issue', phrases: ['outside'] },
  { category: 'Landscaping', score: 4, reason: 'possible grading or yard drainage issue', phrases: ['water', 'outside', 'water outside', 'outside water'] },
  { category: 'Gutters', score: 4, reason: 'possible exterior water issue', phrases: ['outside'] },
  { category: 'General Maintenance', score: 4, reason: 'general exterior issue review', phrases: ['outside'] },
  { category: 'Pest Control', score: 5, reason: 'possible pest activity', phrases: ['noise', 'smell', 'garage', 'attic', 'wall', 'noise in wall', 'bad smell in house', 'garage problem'] },
  { category: 'Electrical', score: 4, reason: 'possible electrical issue', phrases: ['noise', 'garage', 'wall', 'noise in wall', 'garage problem'] },
  { category: 'General Maintenance', score: 4, reason: 'general issue review', phrases: ['noise', 'smell', 'garage', 'attic', 'garage problem', 'bad smell in house'] },
  { category: 'Garage Doors', score: 5, reason: 'possible garage door issue', phrases: ['garage', 'garage problem'] },
  { category: 'Drywall', score: 4, reason: 'possible wall or ceiling surface issue', phrases: ['wall', 'ceiling', 'stain on ceiling'] },
  { category: 'Insulation', score: 4, reason: 'possible attic or insulation issue', phrases: ['attic'] },
  { category: 'Decks', score: 4, reason: 'possible exterior board issue', phrases: ['board', 'loose', 'coming up'] },
  { category: 'Carpentry', score: 4, reason: 'possible wood repair', phrases: ['board', 'loose', 'raised', 'broken', 'coming up'] },
  { category: 'Handyman', score: 4, reason: 'possible small repair', phrases: ['board', 'loose', 'broken', 'not working', 'coming up'] },
  { category: 'General Maintenance', score: 3, reason: 'general issue review', phrases: ['loose', 'broken', 'not working', 'coming up'] },
  { category: 'Roofing', score: 4, reason: 'possible raised exterior surface', phrases: ['raised'] },
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

function matchedPhrases(input: string, phrases: string[]) {
  return phrases.filter(phrase => hasPhrase(input, phrase));
}

function applyTradeObjectRules(input: string, rules: TradeObjectRule[], scores: Map<string, ServiceCategorySuggestion>) {
  for (const rule of rules) {
    const objectMatches = matchedPhrases(input, rule.objects);
    if (objectMatches.length === 0) continue;

    for (const match of rule.matches) {
      addScore(scores, match.category, match.score, match.reason, objectMatches[0]);
    }
  }
}

function applyObjectSymptomRules(input: string, rules: ObjectSymptomRule[], scores: Map<string, ServiceCategorySuggestion>) {
  for (const rule of rules) {
    const objectMatches = matchedPhrases(input, rule.objects);
    if (objectMatches.length === 0) continue;

    const symptomMatches = matchedPhrases(input, rule.symptoms ?? COMMON_SYMPTOMS);
    if (symptomMatches.length === 0) continue;

    const matchedContext = `${objectMatches[0]} + ${symptomMatches[0]}`;
    for (const match of rule.matches) {
      addScore(
        scores,
        match.category,
        match.symptomScore + (match.objectScore ?? 0),
        match.reason,
        matchedContext,
      );
    }
  }
}

function applyBroadFallbackRules(input: string, scores: Map<string, ServiceCategorySuggestion>) {
  const hasBroadAction = BROAD_ACTION_TERMS.some(term => hasPhrase(input, term));
  const hasCarpentryContext = CARPENTRY_FALLBACK_TERMS.some(term => hasPhrase(input, term));

  if (hasBroadAction) {
    addScore(scores, 'Handyman', 7, 'broad service action', 'general home project');
    addScore(scores, 'General Maintenance', 3, 'broad service action', 'general home project');
  }

  if (hasCarpentryContext) {
    addScore(scores, 'Carpentry', hasBroadAction ? 9 : 6, 'wood or structure context', 'carpentry context');
    if (hasBroadAction) {
      addScore(scores, 'Handyman', 5, 'wood or structure project may be handyman work', 'carpentry context');
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
  applyTradeObjectRules(input, TRADE_OBJECT_RULES, scores);
  applyObjectSymptomRules(input, OBJECT_SYMPTOM_RULES, scores);
  applyRules(input, PHRASE_RULES, scores);
  applyRules(input, AMBIGUOUS_CONTEXT_RULES, scores);
  applyBroadFallbackRules(input, scores);

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
    addScore(scores, 'Septic', 20, 'possible septic issue', 'sewer smell');
  }
  if (hasPhrase(input, 'ceiling fan not working')) {
    addScore(scores, 'Handyman', 16, 'fan or fixture repair may be handyman work', 'ceiling fan not working');
  }
  if (hasPhrase(input, 'deck railing')) {
    addScore(scores, 'Decks', 8, 'deck railing context', 'deck railing');
  }
  if (hasPhrase(input, 'soft deck board')) {
    addScore(scores, 'Handyman', 8, 'small deck repair possible', 'soft deck board');
  }
  if (hasPhrase(input, 'siding dirty')) {
    addScore(scores, 'Pressure Washing', 12, 'exterior surface cleaning', 'siding dirty');
  }
  if (hasPhrase(input, 'gate wont close') || hasPhrase(input, 'gate won t close')) {
    addScore(scores, 'Handyman', 10, 'small gate adjustment possible', 'gate will not close');
  }
  if (hasPhrase(input, 'door sticks') || hasPhrase(input, 'door wont latch') || hasPhrase(input, 'door won t latch') || hasPhrase(input, 'draft around door')) {
    addScore(scores, 'Handyman', 10, 'small door adjustment possible', 'door adjustment');
  }
  if (hasPhrase(input, 'deadbolt stuck')) {
    addScore(scores, 'Doors', 12, 'door hardware issue possible', 'deadbolt stuck');
  }
  if (hasPhrase(input, 'repair drywall') || hasPhrase(input, 'patch drywall')) {
    addScore(scores, 'Handyman', 22, 'small drywall repair may be handyman work', 'repair drywall');
    addScore(scores, 'Painting', 22, 'paint finish may follow drywall repair', 'repair drywall');
  }
  if (hasPhrase(input, 'lawn brown spots')) {
    addScore(scores, 'Irrigation', 8, 'lawn spots may relate to irrigation', 'lawn brown spots');
  }
  const hasRoofLeakContext = ['roof', 'attic', 'ceiling', 'shingle', 'shingles', 'flashing', 'fascia', 'soffit'].some(phrase => hasPhrase(input, phrase));
  if (hasPhrase(input, 'water leak') && !hasRoofLeakContext) {
    addScore(scores, 'Plumbing', 30, 'water leak usually starts with plumbing review', 'water leak');
    scores.delete('Roofing');
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
    ? rankedServiceTypes.filter(suggestion => suggestion.score >= Math.max(3, topScore - 18)).slice(0, 5)
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
    'board',
    'loose',
    'raised',
    'broken',
    'not working',
    'coming up',
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
    { phrases: ['deck board coming up'], text: 'A deck board appears to be coming up.' },
    { phrases: ['loose deck board', 'deck board loose'], text: 'A deck board appears to be loose.' },
    { phrases: ['deck railing loose'], text: 'The deck railing appears to be loose.' },
    { phrases: ['porch step loose'], text: 'A porch step appears to be loose.' },
    { phrases: ['fence leaning'], text: 'The fence appears to be leaning.' },
    { phrases: ['gate wont close', 'gate won t close'], text: 'The gate will not close.' },
    { phrases: ['window leaking'], text: 'A window appears to be leaking.' },
    { phrases: ['door sticks'], text: 'A door is sticking.' },
    { phrases: ['drywall hole'], text: 'There is a hole in the drywall.' },
    { phrases: ['hole in wall'], text: 'There is a hole in the wall.' },
    { phrases: ['cracked tile'], text: 'A tile appears to be cracked.' },
    { phrases: ['deadbolt stuck'], text: 'The deadbolt appears to be stuck.' },
    { phrases: ['sprinkler not working'], text: 'The sprinkler is not working.' },
    { phrases: ['tree limb hanging'], text: 'A tree limb appears to be hanging.' },
    { phrases: ['pressure wash driveway'], text: 'The driveway needs pressure washing.' },
    { phrases: ['deep clean house'], text: 'The house needs a deep clean.' },
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

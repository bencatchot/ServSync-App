/** Small, deterministic discovery hints. These are broad trades, not scope guarantees. */
const TASK_RULES = [
  { service: 'Plumbing', phrases: ['faucet', 'faucets', 'tap', 'toilet', 'drain', 'pipe', 'water heater'] },
  { service: 'Decks', phrases: ['deck', 'decks'] },
  { service: 'HVAC', phrases: ['ac', 'air conditioner', 'air conditioning', 'furnace', 'heat pump', 'hvac'] },
  { service: 'Electrical', phrases: ['outlet', 'breaker', 'wiring', 'light switch', 'electrical'] },
  { service: 'Roofing', phrases: ['roof', 'roofing', 'shingle', 'shingles'] },
  { service: 'Painting', phrases: ['paint', 'painting', 'repaint'] },
  { service: 'Drywall', phrases: ['drywall', 'hole in wall', 'hole in the wall'] },
  { service: 'Fencing', phrases: ['fence', 'fencing', 'gate'] },
  { service: 'Lawn Care', phrases: ['mow', 'mowing', 'lawn'] },
  { service: 'Tree Service', phrases: ['tree', 'trees', 'stump'] },
  { service: 'Appliance Repair', phrases: ['dishwasher', 'refrigerator', 'washing machine', 'dryer', 'oven'] },
  { service: 'Gutters', phrases: ['gutter', 'gutters'] },
] as const;
const UNCERTAIN_TASKS = [
  { phrases: ['leak', 'leaking', 'water stain', 'water damage'], services: ['Plumbing', 'Roofing', 'HVAC'] },
  { phrases: ['not cooling', 'not heating'], services: ['HVAC', 'Appliance Repair'] },
  { phrases: ['door', 'window'], services: ['Carpentry', 'Handyman'] },
] as const;

export type TaskServiceSuggestion = { service: string; phrases: string[] };
export function suggestTaskServices(input: string): TaskServiceSuggestion[] {
  const normalized = ` ${input.toLowerCase().replace(/\ba\s*\/\s*c\b/g, 'ac').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const matches = (phrase: string) => normalized.includes(` ${phrase} `);
  const specific = TASK_RULES.flatMap(rule => {
    const phrases = rule.phrases.filter(matches);
    return phrases.length ? [{ service: rule.service, phrases: [...phrases] }] : [];
  });
  if (specific.length) return specific;
  const candidates = new Map<string, string[]>();
  for (const rule of UNCERTAIN_TASKS) {
    const phrases = rule.phrases.filter(matches);
    if (phrases.length) for (const service of rule.services) {
      candidates.set(service, [...new Set([...(candidates.get(service) ?? []), ...phrases])]);
    }
  }
  return [...candidates].map(([service, phrases]) => ({ service, phrases }));
}

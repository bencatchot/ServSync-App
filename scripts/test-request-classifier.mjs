import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/requestClassifier.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, console });

const { classifyHomeownerRequest, cleanHomeownerRequestText } = module.exports;

const cases = [
  ['shingles', ['Roofing']],
  ['shingles raised', ['Roofing']],
  ['raised shingles', ['Roofing']],
  ['lifted shingles', ['Roofing']],
  ['loose shingles', ['Roofing']],
  ['missing shingles', ['Roofing']],
  ['roof', ['Roofing']],
  ['roof leak', ['Roofing']],
  ['leaking roof', ['Roofing']],
  ['leak in attic', ['Roofing', 'Plumbing', 'HVAC'], { notFirst: 'Pest Control', ambiguous: true }],
  ['attic leak after rain', ['Roofing']],
  ['water stain on ceiling after rain', ['Roofing']],
  ['flashing loose', ['Roofing']],
  ['soffit damaged', ['Roofing']],
  ['water under sink', ['Plumbing']],
  ['pipe leaking', ['Plumbing']],
  ['toilet running', ['Plumbing']],
  ['drain clogged', ['Plumbing']],
  ['water heater leaking', ['Plumbing']],
  ['low water pressure', ['Plumbing']],
  ['sewer smell', ['Plumbing'], { includes: ['Septic'] }],
  ['AC', ['HVAC']],
  ['AC not cooling', ['HVAC']],
  ['air conditioner not cooling', ['HVAC']],
  ['heater not working', ['HVAC']],
  ['furnace not turning on', ['HVAC']],
  ['thermostat not working', ['HVAC']],
  ['attic AC unit leaking', ['HVAC']],
  ['weak airflow', ['HVAC']],
  ['vent dripping', ['HVAC']],
  ['unit frozen', ['HVAC']],
  ['outlet', ['Electrical']],
  ['outlet not working', ['Electrical']],
  ['breaker keeps tripping', ['Electrical']],
  ['lights flickering', ['Electrical']],
  ['GFCI won’t reset', ['Electrical']],
  ['switch not working', ['Electrical']],
  ['sparks', ['Electrical']],
  ['termites', ['Pest Control']],
  ['bees', ['Pest Control']],
  ['rats', ['Pest Control']],
  ['mice', ['Pest Control']],
  ['rodents', ['Pest Control']],
  ['pest activity in garage', ['Pest Control']],
  ['droppings', ['Pest Control']],
  ['scratching in wall', ['Pest Control']],
  ['scratching in attic', ['Pest Control']],
  ['garage door', ['Garage Doors']],
  ['garage door won’t open', ['Garage Doors']],
  ['garage door stuck', ['Garage Doors']],
  ['broken garage spring', ['Garage Doors']],
  ['garage door off track', ['Garage Doors']],
  ['opener not working', ['Garage Doors']],
  ['dishwasher', ['Appliance Repair']],
  ['dishwasher not draining', ['Appliance Repair']],
  ['refrigerator not cooling', ['Appliance Repair']],
  ['washer leaking', ['Appliance Repair']],
  ['dryer not heating', ['Appliance Repair']],
  ['oven not heating', ['Appliance Repair']],
  ['leak', ['Roofing', 'Plumbing', 'HVAC'], { ambiguous: true }],
  ['water', ['Gutters', 'Plumbing', 'Landscaping'], { ambiguous: true }],
  ['noise', ['Pest Control', 'HVAC', 'Plumbing', 'Electrical'], { ambiguous: true }],
  ['smell', ['Plumbing', 'HVAC', 'Pest Control'], { ambiguous: true }],
  ['garage', ['Garage Doors', 'Pest Control', 'Electrical'], { ambiguous: true }],
  ['attic', ['Roofing', 'HVAC', 'Pest Control', 'Insulation'], { ambiguous: true }],
  ['wall', ['Drywall', 'Pest Control', 'Plumbing', 'Electrical'], { ambiguous: true }],
  ['ceiling', ['Roofing', 'Plumbing', 'HVAC', 'Drywall'], { ambiguous: true }],
  ['noise in wall', ['Pest Control', 'Plumbing', 'HVAC', 'Electrical'], { ambiguous: true }],
  ['bad smell in house', ['Plumbing', 'HVAC', 'Pest Control'], { ambiguous: true }],
  ['stain on ceiling', ['Roofing', 'Plumbing', 'HVAC'], { ambiguous: true }],
  ['water outside', ['Gutters', 'Plumbing', 'Landscaping'], { ambiguous: true }],
  ['garage problem', ['Garage Doors', 'Pest Control', 'Electrical', 'General Maintenance'], { ambiguous: true }],
];

let failures = 0;

for (const [input, expectedCategories, options = {}] of cases) {
  const result = classifyHomeownerRequest(input);
  const categories = result.rankedServiceTypes.map(item => item.category);
  const missing = expectedCategories.filter(category => !categories.includes(category));
  const topMismatch = expectedCategories.length === 1 && categories[0] !== expectedCategories[0];
  const notFirstViolation = options.notFirst && categories[0] === options.notFirst;
  const includeMissing = (options.includes ?? []).filter(category => !categories.includes(category));
  const ambiguityMismatch = options.ambiguous === true && !result.ambiguous;
  const ok = missing.length === 0 && !topMismatch && !notFirstViolation && includeMissing.length === 0 && !ambiguityMismatch;

  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${input}`);
  console.log(`  ranked: ${categories.join(', ') || 'none'}`);
  console.log(`  ambiguous: ${result.ambiguous}`);
  console.log(`  cleaned: ${cleanHomeownerRequestText(input)}`);
  if (!ok) {
    if (missing.length > 0) console.log(`  missing: ${missing.join(', ')}`);
    if (topMismatch) console.log(`  expected top: ${expectedCategories[0]}`);
    if (notFirstViolation) console.log(`  should not be first: ${options.notFirst}`);
    if (includeMissing.length > 0) console.log(`  missing includes: ${includeMissing.join(', ')}`);
    if (ambiguityMismatch) console.log('  expected ambiguous result');
  }
}

if (failures > 0) {
  console.error(`\n${failures} request classifier case${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log(`\nAll ${cases.length} request classifier cases passed.`);

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/requestClassifier.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, console });

const { classifyHomeownerRequest, cleanHomeownerRequestText } = module.exports;

const cases = [
  ['deck', ['Decks', 'Carpentry', 'Handyman', 'General Maintenance'], { top: 'Decks' }],
  ['build pergola', ['Carpentry', 'Handyman'], { top: 'Carpentry' }],
  ['install pergola', ['Carpentry', 'Handyman'], { top: 'Carpentry' }],
  ['repair pergola', ['Carpentry', 'Handyman'], { top: 'Carpentry' }],
  ['build deck', ['Decks', 'Carpentry', 'Handyman'], { top: 'Decks' }],
  ['deck board', ['Decks', 'Carpentry', 'Handyman'], { top: 'Decks' }],
  ['porch', ['Decks', 'Carpentry', 'Handyman'], { top: 'Decks' }],
  ['shingles', ['Roofing']],
  ['shingle', ['Roofing']],
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
  ['water leak', ['Plumbing'], { top: 'Plumbing', notFirst: 'Roofing' }],
  ['pipe leaking', ['Plumbing']],
  ['toilet running', ['Plumbing']],
  ['fix toilet', ['Plumbing', 'Handyman'], { top: 'Plumbing' }],
  ['drain clogged', ['Plumbing']],
  ['water heater leaking', ['Plumbing']],
  ['low water pressure', ['Plumbing']],
  ['sewer smell', ['Plumbing'], { includes: ['Septic'] }],
  ['AC', ['HVAC']],
  ['air conditioner', ['HVAC']],
  ['AC not cooling', ['HVAC']],
  ['air conditioner not cooling', ['HVAC']],
  ['heater not working', ['HVAC']],
  ['furnace not turning on', ['HVAC']],
  ['thermostat not working', ['HVAC']],
  ['thermostat', ['HVAC']],
  ['furnace', ['HVAC']],
  ['attic AC unit leaking', ['HVAC']],
  ['weak airflow', ['HVAC']],
  ['vent dripping', ['HVAC']],
  ['unit frozen', ['HVAC']],
  ['outlet', ['Electrical']],
  ['install outlet', ['Electrical', 'Handyman'], { top: 'Electrical' }],
  ['breaker', ['Electrical']],
  ['GFCI', ['Electrical']],
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
  ['opener', ['Garage Doors'], { ambiguous: true }],
  ['garage door won’t open', ['Garage Doors']],
  ['garage door stuck', ['Garage Doors']],
  ['broken garage spring', ['Garage Doors']],
  ['garage door off track', ['Garage Doors']],
  ['opener not working', ['Garage Doors']],
  ['dishwasher', ['Appliance Repair']],
  ['refrigerator', ['Appliance Repair']],
  ['dryer', ['Appliance Repair']],
  ['dishwasher not draining', ['Appliance Repair']],
  ['refrigerator not cooling', ['Appliance Repair']],
  ['washer leaking', ['Appliance Repair']],
  ['dryer not heating', ['Appliance Repair']],
  ['oven not heating', ['Appliance Repair']],
  ['deck board coming up', ['Decks']],
  ['loose deck board', ['Decks']],
  ['deck railing loose', ['Decks']],
  ['porch step loose', ['Carpentry', 'Handyman', 'Decks']],
  ['wood rot on deck', ['Decks', 'Carpentry']],
  ['soft deck board', ['Decks', 'Carpentry', 'Handyman']],
  ['deck sagging', ['Decks', 'Carpentry']],
  ['railing loose', ['Carpentry', 'Handyman', 'Decks']],
  ['handrail loose', ['Carpentry', 'Handyman', 'Decks']],
  ['fence leaning', ['Fencing']],
  ['fence', ['Fencing', 'Carpentry', 'Handyman'], { top: 'Fencing' }],
  ['gate', ['Fencing', 'Carpentry', 'Handyman'], { top: 'Fencing' }],
  ['repair fence', ['Fencing', 'Carpentry', 'Handyman'], { top: 'Fencing' }],
  ['broken fence board', ['Fencing']],
  ['gate won’t close', ['Fencing', 'Handyman']],
  ['latch broken', ['Fencing', 'Handyman']],
  ['window leaking', ['Windows']],
  ['gutter', ['Gutters']],
  ['downspout', ['Gutters']],
  ['window', ['Windows']],
  ['window won’t open', ['Windows']],
  ['broken window', ['Windows']],
  ['draft around window', ['Windows']],
  ['door sticks', ['Doors', 'Handyman']],
  ['door', ['Doors', 'Carpentry', 'Handyman'], { top: 'Doors' }],
  ['install door', ['Doors', 'Carpentry', 'Handyman']],
  ['door won’t latch', ['Doors', 'Handyman']],
  ['draft around door', ['Doors', 'Handyman']],
  ['drywall hole', ['Drywall']],
  ['drywall', ['Drywall', 'Handyman']],
  ['repair drywall', ['Drywall', 'Handyman'], { top: 'Drywall' }],
  ['hole in wall', ['Drywall']],
  ['ceiling crack', ['Drywall']],
  ['wall crack', ['Drywall']],
  ['paint peeling', ['Painting']],
  ['paint', ['Painting']],
  ['paint bubbling', ['Painting']],
  ['water stain on drywall', ['Drywall']],
  ['cracked tile', ['Tile', 'Flooring']],
  ['tile', ['Tile', 'Flooring'], { top: 'Tile' }],
  ['loose tile', ['Tile', 'Flooring']],
  ['grout cracked', ['Tile', 'Flooring']],
  ['floor soft spot', ['Flooring', 'Foundation Repair', 'Handyman']],
  ['floor', ['Flooring', 'Foundation Repair', 'Handyman'], { top: 'Flooring' }],
  ['hardwood buckling', ['Flooring']],
  ['flooring buckling', ['Flooring']],
  ['carpet damaged', ['Flooring']],
  ['deadbolt stuck', ['Locksmith', 'Doors']],
  ['lock', ['Locksmith']],
  ['deadbolt', ['Locksmith']],
  ['locked out', ['Locksmith']],
  ['key stuck in lock', ['Locksmith']],
  ['lock not working', ['Locksmith']],
  ['foundation crack', ['Foundation Repair']],
  ['foundation', ['Foundation Repair']],
  ['crack in foundation', ['Foundation Repair']],
  ['driveway crack', ['Concrete']],
  ['concrete', ['Concrete']],
  ['patio concrete cracked', ['Concrete']],
  ['uneven concrete', ['Concrete']],
  ['brick wall crack', ['Masonry']],
  ['brick', ['Masonry']],
  ['siding', ['Siding']],
  ['insulation', ['Insulation']],
  ['sprinkler not working', ['Irrigation']],
  ['sprinkler', ['Irrigation']],
  ['sprinkler broken', ['Irrigation']],
  ['irrigation leaking', ['Irrigation']],
  ['tree limb hanging', ['Tree Service']],
  ['tree', ['Tree Service', 'Landscaping'], { top: 'Tree Service' }],
  ['tree branch broken', ['Tree Service']],
  ['yard cleanup', ['Lawn Care', 'Landscaping']],
  ['lawn', ['Lawn Care', 'Landscaping'], { top: 'Lawn Care' }],
  ['pool', ['Pool Service']],
  ['chimney', ['Chimney']],
  ['septic', ['Septic']],
  ['well', ['Well Service']],
  ['lawn brown spots', ['Lawn Care', 'Irrigation']],
  ['deep clean house', ['Cleaning Service']],
  ['need deep clean', ['Cleaning Service']],
  ['pressure wash driveway', ['Pressure Washing']],
  ['driveway dirty', ['Pressure Washing']],
  ['siding dirty', ['Pressure Washing']],
  ['gutter overflowing', ['Gutters']],
  ['downspout clogged', ['Gutters']],
  ['water pooling outside', ['Gutters', 'Landscaping', 'Plumbing']],
  ['drainage issue', ['Gutters', 'Landscaping']],
  ['air handler leaking', ['HVAC']],
  ['garage door not working', ['Garage Doors']],
  ['toilet not working', ['Plumbing']],
  ['dishwasher not working', ['Appliance Repair']],
  ['ceiling fan not working', ['Electrical', 'Handyman']],
  ['bees in attic', ['Pest Control']],
  ['droppings in attic', ['Pest Control']],
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
  ['outside', ['Gutters', 'Landscaping', 'Plumbing', 'General Maintenance'], { ambiguous: true }],
  ['board', ['Decks', 'Carpentry', 'Handyman'], { ambiguous: true }],
  ['loose', ['Decks', 'Carpentry', 'Handyman'], { ambiguous: true }],
  ['raised', ['Roofing', 'Carpentry'], { ambiguous: true }],
  ['broken', ['Handyman', 'General Maintenance'], { ambiguous: true }],
  ['not working', ['Handyman', 'General Maintenance'], { ambiguous: true }],
  ['coming up', ['Decks', 'Carpentry', 'Handyman'], { ambiguous: true }],
  ['not sure need help fixing something', ['Handyman', 'General Maintenance'], { ambiguous: true }],
];

let failures = 0;

for (const [input, expectedCategories, options = {}] of cases) {
  const result = classifyHomeownerRequest(input);
  const categories = result.rankedServiceTypes.map(item => item.category);
  const missing = expectedCategories.filter(category => !categories.includes(category));
  const topMismatch = expectedCategories.length === 1 && categories[0] !== expectedCategories[0];
  const explicitTopMismatch = options.top && categories[0] !== options.top;
  const notFirstViolation = options.notFirst && categories[0] === options.notFirst;
  const includeMissing = (options.includes ?? []).filter(category => !categories.includes(category));
  const ambiguityMismatch = options.ambiguous === true && !result.ambiguous;
  const ok = missing.length === 0 && !topMismatch && !explicitTopMismatch && !notFirstViolation && includeMissing.length === 0 && !ambiguityMismatch;

  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${input}`);
  console.log(`  ranked: ${categories.join(', ') || 'none'}`);
  console.log(`  ambiguous: ${result.ambiguous}`);
  console.log(`  cleaned: ${cleanHomeownerRequestText(input)}`);
  if (!ok) {
    if (missing.length > 0) console.log(`  missing: ${missing.join(', ')}`);
    if (topMismatch) console.log(`  expected top: ${expectedCategories[0]}`);
    if (explicitTopMismatch) console.log(`  expected top: ${options.top}`);
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

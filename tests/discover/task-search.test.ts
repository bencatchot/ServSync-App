import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestTaskServices } from '../../src/features/discover/taskSearch.ts';
import { matchesContractorLocation, matchesContractorTrade } from '../../src/features/discover/discoverSearch.ts';
import type { ContractorProfile } from '../../src/types.ts';
const services = (task: string) => suggestTaskServices(task).map(item => item.service);

test('common homeowner tasks suggest transparent, broad trades', () => {
  assert.deepEqual(services('replace a faucet'), ['Plumbing']);
  assert.deepEqual(services('repair a deck'), ['Decks']);
  assert.deepEqual(services('AC not cooling'), ['HVAC']);
  assert.deepEqual(suggestTaskServices('replace a faucet')[0].phrases, ['faucet']);
});
test('case, punctuation, plural and A/C variants remain deterministic', () => {
  assert.deepEqual(services('  REPLACE faucets!! '), ['Plumbing']);
  assert.deepEqual(services('A/C not cooling'), ['HVAC']);
  assert.deepEqual(services('air-conditioning is broken'), ['HVAC']);
  assert.deepEqual(services('faucet faucet faucet'), ['Plumbing']);
});
test('ambiguous symptoms and multi-trade tasks retain choices', () => {
  assert.deepEqual(services('a leak'), ['Plumbing', 'Roofing', 'HVAC']);
  assert.deepEqual(services('not cooling'), ['HVAC', 'Appliance Repair']);
  assert.deepEqual(services('repair deck and paint it'), ['Decks', 'Painting']);
  assert.deepEqual(services('fix a faucet and roof'), ['Plumbing', 'Roofing']);
});
test('empty, unsupported and partial-word tasks do not invent a service', () => {
  for (const task of ['', '  ', 'help', 'repair it', 'spaceship', 'fauc', 'desktop', 'acorn', 'pipeline']) assert.deepEqual(services(task), []);
});
test('edited and repeated searches have no retained suggestion state', () => {
  assert.deepEqual(services('faucet'), ['Plumbing']);
  assert.deepEqual(services('unknown task'), []);
  assert.deepEqual(services('deck'), ['Decks']);
  assert.deepEqual(services('faucet'), ['Plumbing']);
});
test('suggested trades use existing exact location and category filters', () => {
  const contractor = {service_categories:['Plumbing'],city:'Fairhope',state:'AL',zip_code:'36532',service_zip_codes:['36526']} as ContractorProfile;
  assert.equal(matchesContractorTrade(contractor, services('faucet')[0]), true);
  assert.equal(matchesContractorTrade(contractor, services('deck')[0]), false);
  assert.equal(matchesContractorLocation(contractor,'36526'),true);
  assert.equal(matchesContractorLocation(contractor,'365'),false);
  assert.equal(matchesContractorLocation(contractor,'Mobile'),false);
});

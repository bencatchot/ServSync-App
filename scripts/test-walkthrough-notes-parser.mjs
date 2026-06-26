import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTsModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText: code } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console });
  return module.exports;
}

const parser = loadTsModule('../src/walkthroughNotesParser.ts');
const assistant = loadTsModule('../src/inspectionAssistant.ts');

const {
  checklistMatchConfidence,
  detectRoomFromNote,
  findBestChecklistItem,
  splitWalkthroughNotes,
  suggestedChecklistItemFromNote,
  uniqueWalkthroughChecklistItemLabel,
} = parser;
const { localDraftFromNote } = assistant;

const roomCatalog = [
  { room: 'Kitchen', items: ['Kitchen sink leak', 'Garbage disposal concern', 'GFCI outlet', 'Dishwasher drain hose', 'Under-sink shutoff valve'] },
  { room: 'Primary Bathroom', items: ['Toilet operation', 'Bathroom sink leak', 'GFCI outlet'] },
  { room: 'Hall Bathroom', items: ['Toilet operation', 'Bathroom sink leak', 'Slow drain or clog'] },
  { room: 'Living Room', items: ['Ceiling fan noise'] },
  { room: 'Entry', items: ['Door operation issue'] },
  { room: 'Laundry', items: ['Dryer vent'] },
  { room: 'Mechanical', items: ['Water heater', 'Expansion tank'] },
  { room: 'Upstairs Hallway', items: ['Smoke detector'] },
  { room: 'Bedroom', items: ['Window operation issue'] },
  { room: 'Exterior', items: ['Gutter blockage', 'Downspout extension'] },
];

function buildSuggestions(input) {
  const roomNames = roomCatalog.map(room => room.room);
  return splitWalkthroughNotes(input).map(line => {
    const detectedRoom = detectRoomFromNote(line, roomNames, null);
    const roomRecord = roomCatalog.find(room => room.room === detectedRoom) ?? null;
    const roomItems = roomRecord?.items ?? [];
    const bestItem = roomItems.length > 0 ? findBestChecklistItem(line, roomItems) : null;
    const matchedExistingItem = bestItem ? checklistMatchConfidence(line, bestItem) > 0 : false;
    return {
      rawText: line,
      room: detectedRoom,
      item: matchedExistingItem && bestItem ? bestItem : suggestedChecklistItemFromNote(line, detectedRoom ?? 'General'),
      status: localDraftFromNote(line),
    };
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSuggestions(testCase) {
  const suggestions = buildSuggestions(testCase.input);
  assert(
    suggestions.length === testCase.count,
    `${testCase.name}: expected ${testCase.count} suggestions, got ${suggestions.length}\n${suggestions.map(s => `- ${s.rawText}`).join('\n')}`,
  );
  if (testCase.rooms) {
    assert(
      JSON.stringify(suggestions.map(s => s.room)) === JSON.stringify(testCase.rooms),
      `${testCase.name}: expected rooms ${testCase.rooms.join(', ')}, got ${suggestions.map(s => s.room).join(', ')}`,
    );
  }
  if (testCase.items) {
    assert(
      JSON.stringify(suggestions.map(s => s.item)) === JSON.stringify(testCase.items),
      `${testCase.name}: expected items ${testCase.items.join(', ')}, got ${suggestions.map(s => s.item).join(', ')}`,
    );
  }
  if (testCase.statuses) {
    assert(
      JSON.stringify(suggestions.map(s => s.status)) === JSON.stringify(testCase.statuses),
      `${testCase.name}: expected statuses ${testCase.statuses.join(', ')}, got ${suggestions.map(s => s.status).join(', ')}`,
    );
  }
  console.log(`PASS ${testCase.name}`);
}

const matrixCases = [
  {
    name: 'matrix 1 - kitchen sink and disposal split',
    input: 'Kitchen sink is leaking under the cabinet and the garbage disposal is jammed.',
    count: 2,
    rooms: ['Kitchen', 'Kitchen'],
    items: ['Kitchen sink leak', 'Garbage disposal concern'],
  },
  {
    name: 'matrix 2 - kitchen comma list splits into three',
    input: 'Kitchen sink leaking, disposal jammed, and GFCI outlet is not working.',
    count: 3,
    rooms: ['Kitchen', 'Kitchen', 'Kitchen'],
    items: ['Kitchen sink leak', 'Garbage disposal concern', 'GFCI outlet'],
  },
  {
    name: 'matrix 3 - primary bath and hall bath split',
    input: 'Primary bath toilet is running and hall bath sink drain is slow.',
    count: 2,
    rooms: ['Primary Bathroom', 'Hall Bathroom'],
  },
  {
    name: 'matrix 4 - living room fan and front door split',
    input: 'Living room ceiling fan squeaks and front door sticks.',
    count: 2,
    rooms: ['Living Room', 'Entry'],
  },
  {
    name: 'matrix 5 - completed dryer vent remains one finding',
    input: 'Laundry dryer vent was clogged, cleaned it while onsite.',
    count: 1,
    rooms: ['Laundry'],
    statuses: ['Fixed On Site'],
  },
  {
    name: 'matrix 6 - pass observation and loose expansion tank split',
    input: 'Water heater looks good, but the expansion tank is loose.',
    count: 2,
    rooms: ['Mechanical', 'Mechanical'],
    items: ['Water heater', 'Expansion tank'],
  },
  {
    name: 'matrix 7 - hallway smoke detector and bedroom window split',
    input: 'Upstairs hallway smoke detector missing and bedroom window lock broken.',
    count: 2,
    rooms: ['Upstairs Hallway', 'Bedroom'],
  },
  {
    name: 'matrix 8 - kitchen three-component comma list',
    input: 'In the kitchen, dishwasher drain hose is loose, sink faucet drips, and under-sink shutoff valve is corroded.',
    count: 3,
    rooms: ['Kitchen', 'Kitchen', 'Kitchen'],
    items: ['Dishwasher drain hose', 'Kitchen sink leak', 'Under-sink shutoff valve'],
  },
  {
    name: 'matrix 9 - gutter completion and downspout backlog split',
    input: 'Exterior gutter clogged, cleaned onsite, but downspout extension is missing.',
    count: 2,
    rooms: ['Exterior', 'Exterior'],
    items: ['Gutter blockage', 'Downspout extension'],
  },
  {
    name: 'matrix 10 - toilet recommendation stays merged and GFCI splits',
    input: 'Primary bathroom toilet running, recommend replacing fill valve, also GFCI outlet does not trip.',
    count: 2,
    rooms: ['Primary Bathroom', 'Primary Bathroom'],
    items: ['Toilet operation', 'GFCI outlet'],
  },
];

const extraCases = [
  {
    name: 'same component plus recommendation stays merged',
    input: 'Toilet running, recommend replacing fill valve.',
    count: 1,
    items: ['Toilet operation'],
  },
  {
    name: 'speech punctuation before recommendation stays merged',
    input: 'Kitchen sink leaking, disposal jammed, and GFCI outlet is not working. Primary bathroom toilet running. Recommend replacing fill valve, also GFCI outlet does not trip.',
    count: 5,
    rooms: ['Kitchen', 'Kitchen', 'Kitchen', 'Primary Bathroom', 'Primary Bathroom'],
    items: ['Kitchen sink leak', 'Garbage disposal concern', 'GFCI outlet', 'Toilet operation', 'GFCI outlet'],
  },
  {
    name: 'different components in same room split',
    input: 'GFCI failed and light switch loose.',
    count: 2,
    items: ['GFCI outlet', 'Loose outlet or switch'],
  },
  {
    name: 'different rooms in one sentence split',
    input: 'Primary bath toilet running and hall bath toilet running.',
    count: 2,
    rooms: ['Primary Bathroom', 'Hall Bathroom'],
  },
  {
    name: 'existing single observation still works',
    input: 'AC filter is dirty, recommend replacing.',
    count: 1,
  },
];

for (const testCase of [...matrixCases, ...extraCases]) {
  assertSuggestions(testCase);
}

const duplicateLabel = uniqueWalkthroughChecklistItemLabel('GFCI outlet', ['GFCI outlet']);
assert(duplicateLabel === 'GFCI outlet (2)', `duplicate label expected GFCI outlet (2), got ${duplicateLabel}`);
const thirdDuplicateLabel = uniqueWalkthroughChecklistItemLabel('GFCI outlet', ['GFCI outlet', 'GFCI outlet (2)']);
assert(thirdDuplicateLabel === 'GFCI outlet (3)', `duplicate label expected GFCI outlet (3), got ${thirdDuplicateLabel}`);
console.log('PASS duplicate checklist labels preserve separate suggestions');

console.log('All walkthrough notes parser cases passed.');

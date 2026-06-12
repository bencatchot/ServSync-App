import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/inspectionAssistant.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, console });

const { localDraftFromNote, localSuggestedActionFromNote } = module.exports;

const cases = [
  {
    input: 'toilet in master bath is running, recommend replacing the ball valve',
    allowed: ['Needs Repair'],
    not: ['Pass'],
    actionIncludes: ['running toilet', 'fill valve', 'ball valve'],
  },
  {
    input: 'kitchen sink is leaking under cabinet',
    allowed: ['Needs Repair', 'Urgent'],
    not: ['Pass'],
  },
  {
    input: 'AC filter is dirty, recommend replacing',
    allowed: ['Needs Repair', 'Monitor'],
    not: ['Pass'],
  },
  {
    input: 'water heater looks good, no issues found',
    allowed: ['Pass'],
  },
  {
    input: 'GFCI outlet not working',
    allowed: ['Needs Repair'],
    not: ['Pass'],
  },
  {
    input: 'active leak under bathroom sink',
    allowed: ['Urgent'],
    not: ['Pass'],
  },
  {
    input: 'Ceiling fan in living room is squeaking.',
    allowed: ['Monitor'],
    not: ['Pass'],
  },
  {
    input: 'Cleaned clogged gutter while onsite.',
    allowed: ['Fixed On Site'],
    not: ['Pass'],
  },
];

let failures = 0;

for (const testCase of cases) {
  const status = localDraftFromNote(testCase.input);
  const action = localSuggestedActionFromNote(testCase.input, status);
  const allowed = testCase.allowed.includes(status);
  const forbidden = (testCase.not ?? []).includes(status);
  const missingActionTerms = (testCase.actionIncludes ?? []).filter(term => !action.toLowerCase().includes(term.toLowerCase()));
  const ok = allowed && !forbidden && missingActionTerms.length === 0;

  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.input}`);
  console.log(`  status: ${status}`);
  console.log(`  action: ${action || '(none)'}`);
  if (!allowed) console.log(`  expected one of: ${testCase.allowed.join(', ')}`);
  if (forbidden) console.log(`  forbidden status: ${status}`);
  if (missingActionTerms.length > 0) console.log(`  action missing: ${missingActionTerms.join(', ')}`);
}

if (failures > 0) {
  console.error(`${failures} inspection assistant classifier case${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log(`All ${cases.length} inspection assistant classifier cases passed.`);

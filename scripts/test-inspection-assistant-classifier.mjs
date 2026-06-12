import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const source = readFileSync(new URL('../src/inspectionAssistant.ts', import.meta.url), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, console });

const { cleanInspectionNoteText, localDraftFromNote, localSuggestedActionFromNote } = module.exports;

const cases = [
  {
    input: 'toilet in master bath is running, recommend replacing the ball valve',
    allowed: ['Needs Repair'],
    not: ['Pass'],
    actionIncludes: ['running toilet', 'fill valve', 'ball valve'],
    note: 'The toilet in the primary bathroom is running. Recommend replacing the fill valve or ball valve as needed.',
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
    note: 'The AC filter is dirty. Recommend replacing the filter.',
    actionIncludes: ['AC filter'],
  },
  {
    input: 'water heater looks good, no issues found',
    allowed: ['Pass'],
    note: 'The water heater appears to be in good condition. No issues were observed.',
  },
  {
    input: 'GFCI outlet not working',
    allowed: ['Needs Repair'],
    not: ['Pass'],
    note: 'The GFCI outlet is not working. Recommend repair or replacement by a qualified electrician.',
    actionIncludes: ['qualified electrician'],
  },
  {
    input: 'active leak under bathroom sink',
    allowed: ['Urgent'],
    not: ['Pass'],
    note: 'There is an active leak under the bathroom sink. Recommend addressing this immediately to prevent further water damage.',
  },
  {
    input: 'Ceiling fan in living room is squeaking.',
    allowed: ['Monitor'],
    not: ['Pass'],
    note: 'The ceiling fan is squeaking. Monitor the fan noise and inspect the mounting or blades if it worsens.',
  },
  {
    input: 'Cleaned clogged gutter while onsite.',
    allowed: ['Fixed On Site'],
    not: ['Pass'],
    note: 'The clogged gutter was cleaned onsite. Monitor during the next rain for proper drainage.',
  },
];

let failures = 0;

for (const testCase of cases) {
  const status = localDraftFromNote(testCase.input);
  const action = localSuggestedActionFromNote(testCase.input, status);
  const note = cleanInspectionNoteText(testCase.input, status);
  const allowed = testCase.allowed.includes(status);
  const forbidden = (testCase.not ?? []).includes(status);
  const missingActionTerms = (testCase.actionIncludes ?? []).filter(term => !action.toLowerCase().includes(term.toLowerCase()));
  const noteMatches = !testCase.note || note === testCase.note;
  const ok = allowed && !forbidden && missingActionTerms.length === 0 && noteMatches;

  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.input}`);
  console.log(`  status: ${status}`);
  console.log(`  note: ${note || '(none)'}`);
  console.log(`  action: ${action || '(none)'}`);
  if (!allowed) console.log(`  expected one of: ${testCase.allowed.join(', ')}`);
  if (forbidden) console.log(`  forbidden status: ${status}`);
  if (missingActionTerms.length > 0) console.log(`  action missing: ${missingActionTerms.join(', ')}`);
  if (!noteMatches) console.log(`  expected note: ${testCase.note}`);
}

if (failures > 0) {
  console.error(`${failures} inspection assistant classifier case${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}

console.log(`All ${cases.length} inspection assistant classifier cases passed.`);

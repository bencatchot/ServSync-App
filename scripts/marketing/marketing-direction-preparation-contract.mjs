import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadMarketingContracts, validateMarketingDirection } from './marketing-package-contract.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, '..', '..');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const ROOT_KEYS = [
  'direction_mode',
  'directions',
  'owner_input',
  'preparation_request_id',
  'preparation_source',
  'source_plan_id',
  'source_plan_revision',
  'truth_pack_version',
];
const ITEM_KEYS = [
  'audience_key',
  'cautions',
  'central_message',
  'corrected_assumptions',
  'objective',
  'plan_item_index',
  'recommendation_rationale',
  'statement',
  'supporting_points',
  'truth_capability_keys',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected), `${label} contains missing or unsupported fields.`);
}

function boundedText(value, minimum, maximum, label) {
  assert(typeof value === 'string', `${label} must be text.`);
  const normalized = value.trim();
  assert(normalized.length >= minimum && normalized.length <= maximum, `${label} must contain ${minimum}-${maximum} characters.`);
  assert(!CONTROL_PATTERN.test(normalized), `${label} contains control characters.`);
  return normalized;
}

function textArray(value, maximum, itemMaximum, label, minimum = 0) {
  assert(Array.isArray(value) && value.length >= minimum && value.length <= maximum, `${label} is invalid.`);
  const normalized = value.map((item, index) => boundedText(item, 1, itemMaximum, `${label} ${index + 1}`));
  assert(new Set(normalized.map(item => item.toLowerCase())).size === normalized.length, `${label} must be unique.`);
  return normalized;
}

export async function validateMarketingDirectionPreparation(input, root = repositoryRoot) {
  exactKeys(input, ROOT_KEYS, 'Marketing Direction preparation');
  assert(UUID_PATTERN.test(input.preparation_request_id), 'Direction preparation request ID must be a UUID.');
  assert(UUID_PATTERN.test(input.source_plan_id), 'Direction source Plan ID must be a UUID.');
  assert(Number.isSafeInteger(input.source_plan_revision) && input.source_plan_revision >= 1, 'Direction source Plan revision is invalid.');
  assert(input.truth_pack_version === 'servsync-marketing-truth-v3', 'Direction preparation requires Truth Pack v3.');
  assert(input.preparation_source === 'codex_assisted', 'Codex Direction preparation source is invalid.');
  assert(input.direction_mode === 'owner_led' || input.direction_mode === 'recommended', 'Marketing Direction mode is invalid.');
  const ownerInput = input.owner_input === null ? null : boundedText(input.owner_input, 1, 1000, 'Marketing Direction owner input');
  if (input.direction_mode === 'owner_led') assert(ownerInput, 'Owner-led Directions require owner input.');
  if (input.direction_mode === 'recommended') assert(ownerInput === null, 'Recommended Directions must not invent owner input.');
  assert(Array.isArray(input.directions) && input.directions.length >= 1 && input.directions.length <= 7, 'Direction preparation must contain 1-7 items.');

  const contracts = await loadMarketingContracts(root, input.truth_pack_version);
  const capabilityKeys = new Set(contracts.truthPack.marketableCapabilities.map(capability => capability.key));
  const directions = input.directions.map((item, index) => {
    exactKeys(item, ITEM_KEYS, `Marketing Direction ${index + 1}`);
    assert(item.plan_item_index === index + 1, 'Marketing Directions must follow accepted Plan item order.');
    assert(contracts.truthPack.audiences.includes(item.audience_key), `Marketing Direction ${index + 1} audience is not in the Truth Pack.`);
    const objective = boundedText(item.objective, 20, 240, `Marketing Direction ${index + 1} objective`);
    const statement = boundedText(item.statement, 80, 500, `Marketing Direction ${index + 1} statement`);
    const centralMessage = boundedText(item.central_message, 20, 500, `Marketing Direction ${index + 1} central message`);
    const supportingPoints = textArray(item.supporting_points, 4, 300, `Marketing Direction ${index + 1} supporting point`);
    const cautions = textArray(item.cautions, 4, 300, `Marketing Direction ${index + 1} caution`);
    const truthCapabilityKeys = textArray(item.truth_capability_keys, 4, 80, `Marketing Direction ${index + 1} Truth capability`, 1);
    assert(truthCapabilityKeys.every(key => capabilityKeys.has(key)), `Marketing Direction ${index + 1} references an unsupported Truth capability.`);

    const validated = validateMarketingDirection({
      mode: input.direction_mode,
      owner_input: ownerInput,
      audience: item.audience_key,
      objective,
      statement,
      central_message: centralMessage,
      supporting_points: supportingPoints,
      corrected_assumptions: item.corrected_assumptions,
      recommendation_rationale: item.recommendation_rationale,
    }, contracts);

    return {
      plan_item_index: index + 1,
      audience_key: validated.audience,
      objective: validated.objective,
      statement: validated.statement,
      central_message: validated.central_message,
      supporting_points: validated.supporting_points,
      cautions,
      corrected_assumptions: validated.corrected_assumptions,
      recommendation_rationale: validated.recommendation_rationale,
      truth_capability_keys: truthCapabilityKeys,
    };
  });

  return {
    preparation_request_id: input.preparation_request_id.toLowerCase(),
    source_plan_id: input.source_plan_id.toLowerCase(),
    source_plan_revision: input.source_plan_revision,
    truth_pack_version: input.truth_pack_version,
    preparation_source: input.preparation_source,
    direction_mode: input.direction_mode,
    owner_input: ownerInput,
    directions,
  };
}

async function runCli() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: marketing-direction-preparation-contract.mjs <directions.json>');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = await validateMarketingDirectionPreparation(input);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    preparationRequestId: result.preparation_request_id,
    sourcePlanId: result.source_plan_id,
    sourcePlanRevision: result.source_plan_revision,
    truthPackVersion: result.truth_pack_version,
    directionCount: result.directions.length,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Marketing Direction preparation validation failed.'}\n`);
    process.exitCode = 1;
  });
}

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadMarketingContracts, marketingPackageContract } from './marketing-package-contract.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, '..', '..');

const PACKAGE_KEYS = [
  'items',
  'preparation_contract_key',
  'preparation_request_id',
  'source_plan_id',
  'source_plan_revision',
  'truth_pack_version',
];
const ITEM_KEYS = [
  'body',
  'channel_category',
  'content_role',
  'content_type',
  'direction_id',
  'direction_revision',
  'intended_audience',
  'title',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const INTERNAL_COPY_PATTERN = /\b(?:workflow|customer-facing|eligible|work context)\b/i;

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

function normalizedCopy(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function roleShape(role, recipeSet) {
  const matches = recipeSet.recipes
    .flatMap(recipe => recipe.items)
    .filter(item => item.role === role)
    .map(item => `${item.contentType}:${item.channelCategory}`);
  const unique = [...new Set(matches)];
  assert(unique.length === 1, `Approved Direction role ${role} does not have one canonical content shape.`);
  const [contentType, channelCategory] = unique[0].split(':');
  return { contentType, channelCategory };
}

export async function loadApprovedDirectionPackageContracts(root = repositoryRoot) {
  return loadMarketingContracts(root, 'servsync-marketing-truth-v3');
}

export function validateApprovedDirectionPackageEnvelope(input, contracts) {
  exactKeys(input, PACKAGE_KEYS, 'Approved-Direction package');
  assert(UUID_PATTERN.test(input.preparation_request_id), 'Preparation request ID must be a UUID.');
  assert(UUID_PATTERN.test(input.source_plan_id), 'Source Plan ID must be a UUID.');
  assert(Number.isSafeInteger(input.source_plan_revision) && input.source_plan_revision >= 1, 'Source Plan revision is invalid.');
  assert(input.truth_pack_version === 'servsync-marketing-truth-v3', 'Approved-Direction package must use Truth Pack v3.');
  assert(input.preparation_contract_key === 'approved_direction_plan_v1', 'Approved-Direction preparation contract is invalid.');
  assert(Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= 7, 'Approved-Direction package must contain 1-7 items.');

  const seenTitles = new Set();
  const seenBodies = new Set();
  for (const [offset, item] of input.items.entries()) {
    const label = `Approved-Direction item ${offset + 1}`;
    exactKeys(item, ITEM_KEYS, label);
    assert(UUID_PATTERN.test(item.direction_id), `${label} Direction ID must be a UUID.`);
    assert(Number.isSafeInteger(item.direction_revision) && item.direction_revision >= 1, `${label} Direction revision is invalid.`);
    assert(contracts.truthPack.audiences.includes(item.intended_audience), `${label} audience is unsupported.`);
    const shape = roleShape(item.content_role, contracts.recipeSet);
    assert(item.content_type === shape.contentType, `${label} content type conflicts with its role.`);
    assert(item.channel_category === shape.channelCategory, `${label} channel conflicts with its role.`);
    const title = boundedText(item.title, 1, 160, `${label} title`);
    const body = boundedText(item.body, 1, 10000, `${label} body`);
    const combined = `${title}\n${body}`;
    assert(!marketingPackageContract.secretPatterns.some(pattern => pattern.test(combined)), `${label} contains secret-like material.`);
    assert(!marketingPackageContract.claimPatterns.some(pattern => pattern.test(combined)), `${label} contains an unsupported claim pattern.`);
    assert(!marketingPackageContract.unsupportedContrastPatterns.some(pattern => pattern.test(combined)), `${label} contains unsupported competitor contrast.`);
    assert(!INTERNAL_COPY_PATTERN.test(combined), `${label} contains internal or product-documentation language.`);
    const normalizedTitle = normalizedCopy(title);
    const normalizedBody = normalizedCopy(body);
    assert(!seenTitles.has(normalizedTitle), 'Approved-Direction package contains duplicate titles.');
    assert(!seenBodies.has(normalizedBody), 'Approved-Direction package contains duplicate content.');
    seenTitles.add(normalizedTitle);
    seenBodies.add(normalizedBody);
  }
  return true;
}

export function validateApprovedDirectionPackage(input, contracts, source, recentContent = []) {
  validateApprovedDirectionPackageEnvelope(input, contracts);

  const acceptedPlan = source?.accepted_plan;
  const directions = source?.directions;
  assert(acceptedPlan && typeof acceptedPlan === 'object', 'Accepted Marketing Plan context is unavailable.');
  assert(acceptedPlan.plan_id === input.source_plan_id, 'Package source Plan does not match the accepted Plan.');
  assert(acceptedPlan.revision_number === input.source_plan_revision, 'Package source Plan revision is stale.');
  assert(Number.isSafeInteger(acceptedPlan.item_count) && acceptedPlan.item_count >= 1 && acceptedPlan.item_count <= 7, 'Accepted Plan item count is invalid.');
  assert(Array.isArray(directions) && directions.length === acceptedPlan.item_count, 'Every accepted Plan item requires one Direction.');
  assert(Array.isArray(input.items) && input.items.length === acceptedPlan.item_count, 'Package must contain one item for every approved Direction.');

  const directionsByIndex = new Map();
  for (const direction of directions) {
    assert(direction && typeof direction === 'object', 'Marketing Direction context is malformed.');
    assert(direction.source_plan_id === acceptedPlan.plan_id, 'Marketing Direction belongs to another Plan.');
    assert(direction.source_plan_revision === acceptedPlan.revision_number, 'Marketing Direction source revision is stale.');
    assert(direction.direction_status === 'approved', 'Only approved Marketing Directions can prepare content.');
    assert(direction.truth_pack_version === input.truth_pack_version, 'Marketing Direction references another Truth Pack.');
    assert(Number.isSafeInteger(direction.source_plan_item_index), 'Marketing Direction Plan index is invalid.');
    assert(!directionsByIndex.has(direction.source_plan_item_index), 'Marketing Directions contain a duplicate Plan index.');
    directionsByIndex.set(direction.source_plan_item_index, direction);
  }

  const seenTitles = new Set();
  const seenBodies = new Set();
  const recentTitles = new Set(recentContent.map(item => normalizedCopy(item.title ?? '')));
  const recentBodies = new Set(recentContent.map(item => normalizedCopy(item.body ?? '')));
  const items = input.items.map((item, offset) => {
    const label = `Approved-Direction item ${offset + 1}`;
    exactKeys(item, ITEM_KEYS, label);
    const direction = directionsByIndex.get(offset + 1);
    assert(direction, `${label} has no source Direction.`);
    assert(item.direction_id === direction.direction_id, `${label} references the wrong Direction.`);
    assert(item.direction_revision === direction.revision_number, `${label} references a stale Direction revision.`);
    assert(item.intended_audience === direction.audience_key, `${label} changes the approved audience.`);
    assert(item.content_role === direction.content_role, `${label} changes the approved content role.`);

    const shape = roleShape(direction.content_role, contracts.recipeSet);
    assert(item.content_type === shape.contentType, `${label} content type conflicts with its approved role.`);
    assert(item.channel_category === shape.channelCategory, `${label} channel conflicts with its approved role.`);

    const title = boundedText(item.title, 1, 160, `${label} title`);
    const body = boundedText(item.body, 1, 10000, `${label} body`);
    const combined = `${title}\n${body}`;
    assert(!marketingPackageContract.secretPatterns.some(pattern => pattern.test(combined)), `${label} contains secret-like material.`);
    assert(!marketingPackageContract.claimPatterns.some(pattern => pattern.test(combined)), `${label} contains an unsupported claim pattern.`);
    assert(!marketingPackageContract.unsupportedContrastPatterns.some(pattern => pattern.test(combined)), `${label} contains unsupported competitor contrast.`);
    assert(!INTERNAL_COPY_PATTERN.test(combined), `${label} contains internal or product-documentation language.`);

    const normalizedTitle = normalizedCopy(title);
    const normalizedBody = normalizedCopy(body);
    assert(!seenTitles.has(normalizedTitle), 'Approved-Direction package contains duplicate titles.');
    assert(!seenBodies.has(normalizedBody), 'Approved-Direction package contains duplicate content.');
    assert(!recentTitles.has(normalizedTitle), `${label} duplicates a recent Marketing title.`);
    assert(!recentBodies.has(normalizedBody), `${label} duplicates recent Marketing copy.`);
    seenTitles.add(normalizedTitle);
    seenBodies.add(normalizedBody);

    return {
      direction_id: item.direction_id.toLowerCase(),
      direction_revision: item.direction_revision,
      title,
      content_type: item.content_type,
      body,
      channel_category: item.channel_category,
      intended_audience: item.intended_audience,
      content_role: item.content_role,
    };
  });

  return {
    preparation_request_id: input.preparation_request_id.toLowerCase(),
    source_plan_id: input.source_plan_id.toLowerCase(),
    source_plan_revision: input.source_plan_revision,
    truth_pack_version: input.truth_pack_version,
    preparation_contract_key: input.preparation_contract_key,
    items,
  };
}

async function runCli() {
  const [inputPath, sourcePath, recentPath] = process.argv.slice(2);
  if (!inputPath || !sourcePath) {
    throw new Error('Usage: approved-direction-package-contract.mjs <package.json> <direction-context.json> [recent-content.json]');
  }
  const [input, source, recentContent] = await Promise.all([
    readFile(inputPath, 'utf8').then(JSON.parse),
    readFile(sourcePath, 'utf8').then(JSON.parse),
    recentPath ? readFile(recentPath, 'utf8').then(JSON.parse) : [],
  ]);
  const contracts = await loadApprovedDirectionPackageContracts();
  const result = validateApprovedDirectionPackage(input, contracts, source, recentContent);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    preparationRequestId: result.preparation_request_id,
    sourcePlanId: result.source_plan_id,
    sourcePlanRevision: result.source_plan_revision,
    itemCount: result.items.length,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Approved-Direction package validation failed.'}\n`);
    process.exitCode = 1;
  });
}

export const approvedDirectionPackageContract = {
  packageKeys: PACKAGE_KEYS,
  itemKeys: ITEM_KEYS,
  internalCopyPattern: INTERNAL_COPY_PATTERN,
};

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, '..', '..');

const PACKAGE_KEYS = [
  'brief_summary',
  'items',
  'preparation_request_id',
  'recipe_key',
  'truth_pack_version',
];
const ITEM_KEYS = [
  'body',
  'channel_category',
  'content_role',
  'content_type',
  'intended_audience',
  'title',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const SECRET_PATTERNS = [
  /\bsk-(?:admin-|proj-)?[A-Za-z0-9_-]{12,}\b/i,
  /\bOPENAI_API_KEY\b/i,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
  /\bservice[_ -]?role\b/i,
  /\bbearer\s+[A-Za-z0-9._-]{12,}\b/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
];
const CLAIM_PATTERNS = [
  /(^|[^a-z])(guarantee(?:d|s)?|award[- ]winning|five[- ]star|top[- ]rated|best[- ]in[- ]class)([^a-z]|$)/i,
  /(^|[^a-z0-9])#1([^a-z0-9]|$)|(^|[^a-z])number\s+one([^a-z]|$)/i,
  /\d+(?:\.\d+)?\s*%/,
  /(?:trusted by|used by|serving)\s+\d+/i,
  /(?:save|saves|saved|reduce|reduces|increase|increases)[^.!?]{0,60}\d+/i,
  /(?:quickbooks integration|google calendar sync|outlook calendar sync|live stripe payments|automatic sms|automated email campaign|ai-powered diagnostics)/i,
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} contains missing or unsupported fields.`);
}

function boundedText(value, minimum, maximum, label) {
  assert(typeof value === 'string', `${label} must be text.`);
  const normalized = value.trim();
  assert(normalized.length >= minimum && normalized.length <= maximum, `${label} must contain ${minimum}-${maximum} characters.`);
  assert(!CONTROL_PATTERN.test(normalized), `${label} contains control characters.`);
  return normalized;
}

export async function loadMarketingContracts(root = repositoryRoot) {
  const [truthPack, recipeSet] = await Promise.all([
    readFile(join(root, 'config/marketing/servsync-marketing-truth-pack.v1.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'config/marketing/servsync-marketing-recipes.v1.json'), 'utf8').then(JSON.parse),
  ]);
  validateMarketingContracts(truthPack, recipeSet);
  return { truthPack, recipeSet };
}

export function validateMarketingContracts(truthPack, recipeSet) {
  assert(truthPack?.schemaVersion === 1, 'Marketing Truth Pack schema version must be 1.');
  assert(truthPack?.truthPackVersion === 'servsync-marketing-truth-v1', 'Unexpected Marketing Truth Pack version.');
  assert(Array.isArray(truthPack.audiences) && truthPack.audiences.length > 0, 'Marketing Truth Pack audiences are missing.');
  assert(Array.isArray(truthPack.marketableCapabilities) && truthPack.marketableCapabilities.length > 0, 'Marketing capabilities are missing.');
  assert(Array.isArray(truthPack.unavailableOrRestrictedCapabilities), 'Restricted Marketing capabilities are missing.');
  assert(Array.isArray(truthPack.prohibitedClaimPolicy?.categories), 'Marketing prohibited-claim policy is missing.');

  assert(recipeSet?.schemaVersion === 1, 'Marketing recipe schema version must be 1.');
  assert(recipeSet?.recipeSetVersion === 'servsync-marketing-recipes-v1', 'Unexpected Marketing recipe version.');
  assert(recipeSet?.truthPackVersion === truthPack.truthPackVersion, 'Marketing recipes reference the wrong Truth Pack.');
  assert(Array.isArray(recipeSet.recipes) && recipeSet.recipes.length === 3, 'Exactly three Marketing recipes are required in v1.');

  const recipeKeys = new Set();
  for (const recipe of recipeSet.recipes) {
    assert(typeof recipe.key === 'string' && !recipeKeys.has(recipe.key), 'Marketing recipe keys must be unique.');
    recipeKeys.add(recipe.key);
    assert(Array.isArray(recipe.allowedAudiences) && recipe.allowedAudiences.length > 0, `Recipe ${recipe.key} has no audiences.`);
    assert(recipe.allowedAudiences.every(value => truthPack.audiences.includes(value)), `Recipe ${recipe.key} has an unknown audience.`);
    assert(Array.isArray(recipe.items) && recipe.items.length >= 1 && recipe.items.length <= 7, `Recipe ${recipe.key} item count is invalid.`);
    const roles = new Set();
    for (const item of recipe.items) {
      assert(typeof item.role === 'string' && !roles.has(item.role), `Recipe ${recipe.key} roles must be unique.`);
      roles.add(item.role);
      assert(['social_post', 'email', 'website_copy', 'other'].includes(item.contentType), `Recipe ${recipe.key} has an invalid content type.`);
      assert(['social', 'email', 'website', 'other'].includes(item.channelCategory), `Recipe ${recipe.key} has an invalid channel.`);
    }
  }
}

export function validateMarketingPackage(input, contracts) {
  exactKeys(input, PACKAGE_KEYS, 'Marketing package');
  assert(UUID_PATTERN.test(input.preparation_request_id), 'Preparation request ID must be a UUID.');
  assert(input.truth_pack_version === contracts.truthPack.truthPackVersion, 'Marketing package references the wrong Truth Pack.');
  const briefSummary = boundedText(input.brief_summary, 1, 500, 'Brief summary');
  const recipe = contracts.recipeSet.recipes.find(candidate => candidate.key === input.recipe_key);
  assert(recipe, 'Marketing package references an unknown recipe.');
  assert(Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= 7, 'Marketing package must contain 1-7 items.');

  const recipeRoles = new Map(recipe.items.map(item => [item.role, item]));
  const seenRoles = new Set();
  const seenTitles = new Set();
  const seenBodies = new Set();
  const items = input.items.map((item, index) => {
    const label = `Marketing item ${index + 1}`;
    exactKeys(item, ITEM_KEYS, label);
    const title = boundedText(item.title, 1, 160, `${label} title`);
    const body = boundedText(item.body, 1, 10000, `${label} body`);
    const role = recipeRoles.get(item.content_role);
    assert(role && !seenRoles.has(item.content_role), `${label} has an unsupported or duplicate recipe role.`);
    assert(role.contentType === item.content_type, `${label} content type conflicts with its recipe role.`);
    assert(role.channelCategory === item.channel_category, `${label} channel conflicts with its recipe role.`);
    assert(recipe.allowedAudiences.includes(item.intended_audience), `${label} audience is not allowed by the recipe.`);
    seenRoles.add(item.content_role);

    const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ');
    const normalizedBody = body.toLowerCase().replace(/\s+/g, ' ');
    assert(!seenTitles.has(normalizedTitle), 'Marketing package contains duplicate titles.');
    assert(!seenBodies.has(normalizedBody), 'Marketing package contains duplicate content.');
    seenTitles.add(normalizedTitle);
    seenBodies.add(normalizedBody);

    const combined = `${title}\n${body}`;
    assert(!SECRET_PATTERNS.some(pattern => pattern.test(combined)), `${label} contains secret-like material.`);
    assert(!CLAIM_PATTERNS.some(pattern => pattern.test(combined)), `${label} contains a prohibited or unsupported claim pattern.`);

    return {
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
    recipe_key: recipe.key,
    truth_pack_version: input.truth_pack_version,
    brief_summary: briefSummary,
    items,
  };
}

export const marketingPackageContract = {
  packageKeys: PACKAGE_KEYS,
  itemKeys: ITEM_KEYS,
  claimPatterns: CLAIM_PATTERNS,
  secretPatterns: SECRET_PATTERNS,
};

async function runCli() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: marketing-package-contract.mjs <package.json>');
  const [contracts, input] = await Promise.all([
    loadMarketingContracts(),
    readFile(inputPath, 'utf8').then(value => JSON.parse(value)),
  ]);
  const result = validateMarketingPackage(input, contracts);
  process.stdout.write(`${JSON.stringify({
    valid: true,
    preparationRequestId: result.preparation_request_id,
    recipeKey: result.recipe_key,
    truthPackVersion: result.truth_pack_version,
    itemCount: result.items.length,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Marketing package validation failed.'}\n`);
    process.exitCode = 1;
  });
}

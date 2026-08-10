import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(scriptDirectory, '..', '..');

const CURRENT_TRUTH_PACK_VERSION = 'servsync-marketing-truth-v3';
const PACKAGE_KEYS_V1 = [
  'brief_summary',
  'items',
  'preparation_request_id',
  'recipe_key',
  'truth_pack_version',
];
const PACKAGE_KEYS_V2 = [
  'items',
  'marketing_direction',
  'preparation_request_id',
  'recipe_key',
  'truth_pack_version',
];
const DIRECTION_KEYS = [
  'audience',
  'central_message',
  'corrected_assumptions',
  'mode',
  'objective',
  'owner_input',
  'recommendation_rationale',
  'statement',
  'supporting_points',
];
const CORRECTION_KEYS = ['code', 'correction'];
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
const COMPETITOR_ASSUMPTION_PATTERNS = [
  {
    code: 'competitor_account_requirement',
    pattern: /(?:competitors?|competing|other)\s+(?:apps?|software|platforms?|tools?)?[^.!?]{0,80}(?:require|force|make)[^.!?]{0,60}(?:account|sign[ -]?up|register)/i,
  },
  {
    code: 'competitor_app_download_requirement',
    pattern: /(?:competitors?|competing|other)\s+(?:apps?|software|platforms?|tools?)?[^.!?]{0,80}(?:require|force|make)[^.!?]{0,60}(?:download|install|app)/i,
  },
  {
    code: 'competitor_app_download_requirement',
    pattern: /(?:force|make)[^.!?]{0,50}(?:customers?|homeowners?)[^.!?]{0,50}(?:download|install)(?:[^.!?]{0,20}app)?/i,
  },
  {
    code: 'competitor_subscription_requirement',
    pattern: /(?:competitors?|competing|other)\s+(?:apps?|software|platforms?|tools?)?[^.!?]{0,80}(?:require|force|make)[^.!?]{0,60}(?:subscription|subscribe|monthly fee)/i,
  },
  {
    code: 'competitor_inferiority',
    pattern: /(?:unlike|compared (?:with|to))\s+(?:competitors?|competing|other)|(?:competitors?|competing|other)\s+(?:apps?|software|platforms?|tools?)[^.!?]{0,80}(?:inferior|harder|difficult|expensive|fragmented|lack|cannot|can't|don't|doesn't)/i,
  },
];
const UNSUPPORTED_CONTRAST_PATTERNS = [
  /\b(?:unlike|compared (?:with|to))\s+(?:competitors?|competing|other)\b/i,
  /\b(?:competitors?|competing|other)\s+(?:apps?|software|platforms?|tools?)\b[^.!?]{0,100}\b(?:force|require|make|lack|cannot|can't|don't|doesn't|inferior|harder|difficult|expensive|fragmented)\b/i,
  /\bno more (?:being )?forced to\b/i,
  /\bwithout forcing\b/i,
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

export async function loadMarketingContracts(root = repositoryRoot, truthPackVersion = CURRENT_TRUTH_PACK_VERSION) {
  const versions = {
    'servsync-marketing-truth-v1': {
      truth: 'servsync-marketing-truth-pack.v1.json',
      recipes: 'servsync-marketing-recipes.v1.json',
    },
    'servsync-marketing-truth-v2': {
      truth: 'servsync-marketing-truth-pack.v2.json',
      recipes: 'servsync-marketing-recipes.v2.json',
    },
    'servsync-marketing-truth-v3': {
      truth: 'servsync-marketing-truth-pack.v3.json',
      recipes: 'servsync-marketing-recipes.v3.json',
    },
  };
  const files = versions[truthPackVersion];
  assert(files, 'Marketing package references an unsupported Truth Pack version.');
  const [truthPack, recipeSet] = await Promise.all([
    readFile(join(root, 'config/marketing', files.truth), 'utf8').then(JSON.parse),
    readFile(join(root, 'config/marketing', files.recipes), 'utf8').then(JSON.parse),
  ]);
  validateMarketingContracts(truthPack, recipeSet);
  return { truthPack, recipeSet };
}

export function validateMarketingContracts(truthPack, recipeSet) {
  assert(truthPack?.schemaVersion === 1, 'Marketing Truth Pack schema version must be 1.');
  assert(['servsync-marketing-truth-v1', 'servsync-marketing-truth-v2', 'servsync-marketing-truth-v3'].includes(truthPack?.truthPackVersion), 'Unexpected Marketing Truth Pack version.');
  assert(Array.isArray(truthPack.audiences) && truthPack.audiences.length > 0, 'Marketing Truth Pack audiences are missing.');
  assert(Array.isArray(truthPack.marketableCapabilities) && truthPack.marketableCapabilities.length > 0, 'Marketing capabilities are missing.');
  assert(Array.isArray(truthPack.unavailableOrRestrictedCapabilities), 'Restricted Marketing capabilities are missing.');
  assert(Array.isArray(truthPack.prohibitedClaimPolicy?.categories), 'Marketing prohibited-claim policy is missing.');
  if (truthPack.truthPackVersion === 'servsync-marketing-truth-v3') {
    assert(truthPack.audienceTaxonomyVersion === 1, 'Marketing audience taxonomy version must be 1.');
  }

  assert(recipeSet?.schemaVersion === 1, 'Marketing recipe schema version must be 1.');
  const expectedRecipeVersion = {
    'servsync-marketing-truth-v1': 'servsync-marketing-recipes-v1',
    'servsync-marketing-truth-v2': 'servsync-marketing-recipes-v2',
    'servsync-marketing-truth-v3': 'servsync-marketing-recipes-v3',
  }[truthPack.truthPackVersion];
  assert(recipeSet?.recipeSetVersion === expectedRecipeVersion, 'Unexpected Marketing recipe version.');
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
      if (truthPack.truthPackVersion !== 'servsync-marketing-truth-v1') {
        assert(typeof item.directionPurpose === 'string' && item.directionPurpose.trim().length > 0, `Recipe ${recipe.key} is missing role direction guidance.`);
      }
    }
  }

  if (truthPack.truthPackVersion !== 'servsync-marketing-truth-v1') {
    assert(recipeSet.directionContractVersion === 1, 'Marketing Direction contract version must be 1.');
    assert(typeof truthPack.competitiveFramingPolicy?.rule === 'string', 'Competitive framing policy is missing.');
    assert(typeof truthPack.guestAndConnectedHomeownerTruth?.plainLanguageSummary === 'string', 'Guest and connected-homeowner truth is missing.');
    assert(Array.isArray(truthPack.copyQualityGuidance?.prefer), 'Marketing copy-quality guidance is missing.');
  }
}

export function analyzeMarketingDirectionInput(value) {
  if (typeof value !== 'string') return [];
  return COMPETITOR_ASSUMPTION_PATTERNS
    .filter(candidate => candidate.pattern.test(value))
    .map(candidate => candidate.code)
    .filter((code, index, values) => values.indexOf(code) === index);
}

export function validateMarketingDirection(input, contracts) {
  exactKeys(input, DIRECTION_KEYS, 'Marketing Direction');
  assert(input.mode === 'owner_led' || input.mode === 'recommended', 'Marketing Direction mode is invalid.');
  const ownerInput = input.owner_input === null
    ? null
    : boundedText(input.owner_input, 1, 1000, 'Marketing Direction owner input');
  if (input.mode === 'owner_led') assert(ownerInput, 'Owner-led Marketing Direction requires owner input.');
  if (input.mode === 'recommended') assert(ownerInput === null, 'Recommended Marketing Direction must not invent owner input.');

  assert(contracts.truthPack.audiences.includes(input.audience), 'Marketing Direction audience is invalid.');
  const objective = boundedText(input.objective, 1, 240, 'Marketing Direction objective');
  const statement = boundedText(input.statement, 1, 500, 'Marketing Direction statement');
  const centralMessage = boundedText(input.central_message, 1, 500, 'Marketing Direction central message');
  assert(Array.isArray(input.supporting_points) && input.supporting_points.length <= 4, 'Marketing Direction supporting points are invalid.');
  const supportingPoints = input.supporting_points.map((value, index) => boundedText(value, 1, 300, `Marketing Direction supporting point ${index + 1}`));
  assert(new Set(supportingPoints.map(value => value.toLowerCase())).size === supportingPoints.length, 'Marketing Direction supporting points must be unique.');

  assert(Array.isArray(input.corrected_assumptions) && input.corrected_assumptions.length <= 4, 'Marketing Direction corrected assumptions are invalid.');
  const correctionCodes = new Set();
  const correctedAssumptions = input.corrected_assumptions.map((value, index) => {
    exactKeys(value, CORRECTION_KEYS, `Marketing Direction correction ${index + 1}`);
    assert(COMPETITOR_ASSUMPTION_PATTERNS.some(candidate => candidate.code === value.code), `Marketing Direction correction ${index + 1} has an unknown code.`);
    assert(!correctionCodes.has(value.code), 'Marketing Direction correction codes must be unique.');
    correctionCodes.add(value.code);
    return {
      code: value.code,
      correction: boundedText(value.correction, 1, 300, `Marketing Direction correction ${index + 1}`),
    };
  });

  const detectedAssumptions = analyzeMarketingDirectionInput(ownerInput);
  assert(detectedAssumptions.every(code => correctionCodes.has(code)), 'Marketing Direction must explicitly correct every detected unsupported competitor assumption.');

  const recommendationRationale = input.recommendation_rationale === null
    ? null
    : boundedText(input.recommendation_rationale, 1, 500, 'Marketing Direction recommendation rationale');
  if (input.mode === 'recommended') assert(recommendationRationale, 'Recommended Marketing Direction requires a rationale.');
  if (input.mode === 'owner_led') assert(recommendationRationale === null, 'Owner-led Marketing Direction must not claim a system recommendation.');

  const publicDirection = [statement, centralMessage, ...supportingPoints].join('\n');
  assert(!SECRET_PATTERNS.some(pattern => pattern.test(publicDirection)), 'Marketing Direction contains secret-like material.');
  assert(!CLAIM_PATTERNS.some(pattern => pattern.test(publicDirection)), 'Marketing Direction contains a prohibited or unsupported claim pattern.');
  assert(!UNSUPPORTED_CONTRAST_PATTERNS.some(pattern => pattern.test(publicDirection)), 'Marketing Direction contains an unsupported competitor contrast.');

  return {
    mode: input.mode,
    owner_input: ownerInput,
    audience: input.audience,
    objective,
    statement,
    central_message: centralMessage,
    supporting_points: supportingPoints,
    corrected_assumptions: correctedAssumptions,
    recommendation_rationale: recommendationRationale,
  };
}

export function validateMarketingPackage(input, contracts) {
  const usesDirection = ['servsync-marketing-truth-v2', 'servsync-marketing-truth-v3'].includes(input?.truth_pack_version);
  exactKeys(input, usesDirection ? PACKAGE_KEYS_V2 : PACKAGE_KEYS_V1, 'Marketing package');
  assert(UUID_PATTERN.test(input.preparation_request_id), 'Preparation request ID must be a UUID.');
  assert(input.truth_pack_version === contracts.truthPack.truthPackVersion, 'Marketing package references the wrong Truth Pack.');
  const marketingDirection = usesDirection ? validateMarketingDirection(input.marketing_direction, contracts) : null;
  const briefSummary = usesDirection
    ? marketingDirection.statement
    : boundedText(input.brief_summary, 1, 500, 'Brief summary');
  const recipe = contracts.recipeSet.recipes.find(candidate => candidate.key === input.recipe_key);
  assert(recipe, 'Marketing package references an unknown recipe.');
  if (marketingDirection) assert(recipe.allowedAudiences.includes(marketingDirection.audience), 'Marketing Direction audience is not allowed by the recipe.');
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
    if (marketingDirection) assert(item.intended_audience === marketingDirection.audience, `${label} audience conflicts with the Marketing Direction.`);
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
    assert(!UNSUPPORTED_CONTRAST_PATTERNS.some(pattern => pattern.test(combined)), `${label} contains an unsupported competitor contrast.`);

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
    ...(marketingDirection ? { marketing_direction: marketingDirection } : {}),
    items,
  };
}

export const marketingPackageContract = {
  packageKeysV1: PACKAGE_KEYS_V1,
  packageKeysV2: PACKAGE_KEYS_V2,
  itemKeys: ITEM_KEYS,
  claimPatterns: CLAIM_PATTERNS,
  competitorAssumptionPatterns: COMPETITOR_ASSUMPTION_PATTERNS,
  unsupportedContrastPatterns: UNSUPPORTED_CONTRAST_PATTERNS,
  secretPatterns: SECRET_PATTERNS,
};

async function runCli() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: marketing-package-contract.mjs <package.json>');
  const input = await readFile(inputPath, 'utf8').then(value => JSON.parse(value));
  const contracts = await loadMarketingContracts(repositoryRoot, input.truth_pack_version);
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

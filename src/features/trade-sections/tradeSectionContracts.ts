const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,79}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const VISIBILITIES = new Set([
  'contractor_private',
  'customer_safe_summary',
  'customer_safe_evidence',
  'customer_safe_recommendation',
]);

export type TradeSectionFieldType = 'number' | 'text' | 'boolean' | 'choice';

export type TradeSectionField = {
  group: 'readings' | 'tests';
  key: string;
  label: string;
  description: string | null;
  valueType: TradeSectionFieldType;
  unit: string | null;
  required: boolean;
  options: string[];
};

export type TradeSectionDefinition = {
  schemaVersion: number;
  sectionKey: string;
  label: string;
  description: string | null;
  fields: TradeSectionField[];
  supported: boolean;
  unsupportedReason: string | null;
};

export type TradeSectionWorkType = {
  workTypeKey: string;
  tradeKey: string;
  workflowFamilyKey: string;
  capabilityKey: string;
  versionNumber: number;
  displayName: string;
  description: string;
  definition: TradeSectionDefinition;
};

export type TradeSectionInstance = {
  id: string;
  contractorId: string;
  jobId: string;
  workTypeKey: string;
  capabilityKey: string;
  definitionVersionNumber: number;
  definitionSnapshotSha256: string;
  definition: TradeSectionDefinition;
  values: Record<string, unknown>;
  lifecycleStatus: 'active' | 'completed' | 'abandoned' | 'voided';
  revisionNumber: number;
  sectionOrder: number;
  createdAt: string;
  updatedAt: string;
};

const malformed = () => new Error('Trade Section response is malformed.');
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const hasControlCharacter = (value: string) => Array.from(value).some(character => {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 31 || codePoint === 127;
});

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requireString(value: unknown, maxLength = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || hasControlCharacter(value)) {
    throw malformed();
  }
  return value;
}

function nullableString(value: unknown, maxLength = 1000) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > maxLength || hasControlCharacter(value)) throw malformed();
  return value;
}

function requireUuid(value: unknown) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw malformed();
  return value.toLowerCase();
}

function requirePositiveInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw malformed();
  return value;
}

function parseField(value: unknown, group: 'readings' | 'tests'): TradeSectionField {
  if (!isRecord(value)) throw malformed();
  const readingKeys = ['key', 'label', 'description', 'value_type', 'unit', 'required', 'customer_visibility', 'options'];
  const testKeys = ['key', 'label', 'description', 'value_type', 'required', 'customer_visibility', 'options'];
  if (!hasExactKeys(value, group === 'readings' ? readingKeys : testKeys)) throw malformed();

  const key = requireString(value.key, 80);
  const label = requireString(value.label, 120);
  const description = nullableString(value.description, 1000);
  const valueType = value.value_type;
  const allowedTypes = group === 'readings'
    ? new Set(['number', 'text', 'boolean', 'choice'])
    : new Set(['text', 'boolean', 'choice']);
  if (!KEY_PATTERN.test(key) || typeof valueType !== 'string' || !allowedTypes.has(valueType)) throw malformed();
  if (typeof value.required !== 'boolean' || typeof value.customer_visibility !== 'string' || !VISIBILITIES.has(value.customer_visibility)) {
    throw malformed();
  }
  if (!Array.isArray(value.options) || value.options.length > 30) throw malformed();
  const options = value.options.map(option => requireString(option, 80));
  if (new Set(options).size !== options.length) throw malformed();
  if ((valueType === 'choice' && options.length < 2) || (valueType !== 'choice' && options.length !== 0)) throw malformed();
  const unit = group === 'readings' ? nullableString(value.unit, 40) : null;

  return {
    group,
    key,
    label,
    description,
    valueType: valueType as TradeSectionFieldType,
    unit,
    required: value.required,
    options,
  };
}

export function parseTradeSectionDefinition(value: unknown): TradeSectionDefinition {
  if (!isRecord(value) || !hasExactKeys(value, ['schema_version', 'section', 'readings', 'tests', 'findings', 'recommendations'])) {
    throw malformed();
  }
  if (!isRecord(value.section)
    || !hasExactKeys(value.section, ['key', 'label', 'description', 'customer_visibility'])
    || !Array.isArray(value.readings)
    || !Array.isArray(value.tests)
    || !Array.isArray(value.findings)
    || !Array.isArray(value.recommendations)) {
    throw malformed();
  }
  const sectionKey = requireString(value.section.key, 80);
  const label = requireString(value.section.label, 120);
  const description = nullableString(value.section.description, 1000);
  if (!KEY_PATTERN.test(sectionKey)
    || typeof value.section.customer_visibility !== 'string'
    || !VISIBILITIES.has(value.section.customer_visibility)) {
    throw malformed();
  }
  const schemaVersion = requirePositiveInteger(value.schema_version);
  if (schemaVersion !== 1) {
    return { schemaVersion, sectionKey, label, description, fields: [], supported: false, unsupportedReason: 'This Trade Section uses an unsupported schema version.' };
  }

  const fields = [
    ...value.readings.map(field => parseField(field, 'readings')),
    ...value.tests.map(field => parseField(field, 'tests')),
  ];
  if (new Set(fields.map(field => field.key)).size !== fields.length) throw malformed();
  const hasDeferredContent = value.findings.length > 0 || value.recommendations.length > 0;
  return {
    schemaVersion,
    sectionKey,
    label,
    description,
    fields,
    supported: !hasDeferredContent,
    unsupportedReason: hasDeferredContent
      ? 'This Trade Section includes content that is not supported in this runtime slice.'
      : null,
  };
}

function validateValues(value: unknown, definition: TradeSectionDefinition) {
  if (!isRecord(value) || !definition.supported || Object.keys(value).length > 400) throw malformed();
  const fields = new Map(definition.fields.map(field => [field.key, field]));
  for (const field of definition.fields) {
    if (field.required && !(field.key in value)) throw malformed();
  }
  for (const [key, fieldValue] of Object.entries(value)) {
    const field = fields.get(key);
    if (!field) throw malformed();
    if (field.valueType === 'number') {
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue) || Math.abs(fieldValue) > 1_000_000_000_000) throw malformed();
    } else if (field.valueType === 'boolean') {
      if (typeof fieldValue !== 'boolean') throw malformed();
    } else {
      if (typeof fieldValue !== 'string' || fieldValue.length > 2000 || hasControlCharacter(fieldValue)) throw malformed();
      if (field.required && !fieldValue.trim()) throw malformed();
      if (field.valueType === 'choice' && !field.options.includes(fieldValue)) throw malformed();
    }
  }
  return { ...value };
}

export function parseTradeSectionWorkTypes(value: unknown): TradeSectionWorkType[] {
  if (!Array.isArray(value)) throw malformed();
  return value.map(row => {
    if (!isRecord(row) || !hasExactKeys(row, [
      'work_type_key', 'trade_key', 'workflow_family_key', 'capability_key',
      'version_number', 'display_name', 'description', 'definition_contract',
    ])) throw malformed();
    const workTypeKey = requireString(row.work_type_key, 160);
    const tradeKey = requireString(row.trade_key, 80);
    const workflowFamilyKey = requireString(row.workflow_family_key, 80);
    const capabilityKey = requireString(row.capability_key, 160);
    if (![workTypeKey, tradeKey, workflowFamilyKey, capabilityKey].every(key => /^[a-z][a-z0-9_.]{0,159}$/.test(key))) throw malformed();
    return {
      workTypeKey,
      tradeKey,
      workflowFamilyKey,
      capabilityKey,
      versionNumber: requirePositiveInteger(row.version_number),
      displayName: requireString(row.display_name, 160),
      description: nullableString(row.description, 1000) ?? '',
      definition: parseTradeSectionDefinition(row.definition_contract),
    };
  });
}

export function parseTradeSectionInstance(
  value: unknown,
  expected: { contractorId: string; jobId: string; instanceId?: string },
): TradeSectionInstance {
  if (!isRecord(value)) throw malformed();
  const id = requireUuid(value.id);
  const contractorId = requireUuid(value.contractor_id);
  const jobId = requireUuid(value.job_id);
  if (contractorId !== requireUuid(expected.contractorId)
    || jobId !== requireUuid(expected.jobId)
    || (expected.instanceId && id !== requireUuid(expected.instanceId))
    || value.work_draft_id !== null
    || value.origin_kind !== 'job'
    || value.property_asset_id !== null
    || value.property_asset_revision_number !== null) {
    throw malformed();
  }
  const definition = parseTradeSectionDefinition(value.definition_snapshot);
  const lifecycleStatus = value.lifecycle_status;
  if (!['active', 'completed', 'abandoned', 'voided'].includes(String(lifecycleStatus))) throw malformed();
  if (typeof value.definition_snapshot_sha256 !== 'string' || !HASH_PATTERN.test(value.definition_snapshot_sha256)) throw malformed();
  if (typeof value.section_order !== 'number' || !Number.isSafeInteger(value.section_order) || value.section_order < 0 || value.section_order > 999) throw malformed();

  return {
    id,
    contractorId,
    jobId,
    workTypeKey: requireString(value.work_type_key, 160),
    capabilityKey: requireString(value.capability_key, 160),
    definitionVersionNumber: requirePositiveInteger(value.definition_version_number),
    definitionSnapshotSha256: value.definition_snapshot_sha256,
    definition,
    values: validateValues(value.current_values, definition),
    lifecycleStatus: lifecycleStatus as TradeSectionInstance['lifecycleStatus'],
    revisionNumber: requirePositiveInteger(value.current_revision_number),
    sectionOrder: value.section_order,
    createdAt: requireString(value.created_at, 80),
    updatedAt: requireString(value.updated_at, 80),
  };
}

export function parseTradeSectionInstances(
  value: unknown,
  expected: { contractorId: string; jobId: string },
) {
  if (!Array.isArray(value)) throw malformed();
  return value.map(row => parseTradeSectionInstance(row, expected));
}

export type TradeSectionFormValue = string | boolean;

export function formValuesFromPersisted(instance: TradeSectionInstance): Record<string, TradeSectionFormValue> {
  const result: Record<string, TradeSectionFormValue> = {};
  for (const field of instance.definition.fields) {
    const value = instance.values[field.key];
    result[field.key] = typeof value === 'boolean' ? value : value === undefined ? '' : String(value);
  }
  return result;
}

export function emptyTradeSectionForm(definition: TradeSectionDefinition): Record<string, TradeSectionFormValue> {
  return Object.fromEntries(definition.fields.map(field => [field.key, field.valueType === 'boolean' ? false : '']));
}

export function persistedValuesFromForm(
  definition: TradeSectionDefinition,
  form: Record<string, TradeSectionFormValue>,
) {
  if (!definition.supported) throw new Error(definition.unsupportedReason ?? 'Trade Section schema is unsupported.');
  const result: Record<string, unknown> = {};
  for (const field of definition.fields) {
    const value = form[field.key];
    if (field.valueType === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${field.label} is invalid.`);
      result[field.key] = value;
      continue;
    }
    if (typeof value !== 'string') throw new Error(`${field.label} is invalid.`);
    if (!value.trim() && !field.required) continue;
    if (!value.trim()) throw new Error(`${field.label} is required.`);
    if (field.valueType === 'number') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || Math.abs(numeric) > 1_000_000_000_000) throw new Error(`${field.label} must be a valid number.`);
      result[field.key] = numeric;
    } else if (field.valueType === 'choice') {
      if (!field.options.includes(value)) throw new Error(`${field.label} has an invalid choice.`);
      result[field.key] = value;
    } else {
      if (value.length > 2000 || hasControlCharacter(value)) throw new Error(`${field.label} contains unsupported text.`);
      result[field.key] = value;
    }
  }
  return result;
}

const FALSE_VALUES = new Set(['false', '0', 'no', 'off', 'disabled']);

function projectRefFromSupabaseUrl(raw) {
  try {
    return new URL(raw).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function validateRuntimeParity(contract, snapshots) {
  const errors = [];
  const checks = [];
  const production = snapshots.production;
  const demo = snapshots.demo;

  for (const [name, snapshot] of Object.entries({ production, demo })) {
    const expected = contract.environments[name];
    if (!snapshot) {
      errors.push(`${name}: runtime snapshot is missing.`);
      continue;
    }
    for (const [field, expectedValue] of Object.entries({
      alias: expected.alias,
      projectId: expected.vercelProjectId,
      projectName: expected.vercelProjectName,
    })) {
      if (snapshot[field] !== expectedValue) errors.push(`${name}: ${field} does not match the fixed environment identity.`);
    }
    checks.push(`${name} environment identity`);

    const actualRef = projectRefFromSupabaseUrl(snapshot.values.VITE_SUPABASE_URL);
    if (actualRef !== expected.supabaseProjectRef) {
      errors.push(`${name}: VITE_SUPABASE_URL does not resolve to the expected Supabase project.`);
    }
    checks.push(`${name} Supabase project identity`);
  }

  if (production && demo) {
    if (!production.gitCommitSha || !demo.gitCommitSha || production.gitCommitSha !== demo.gitCommitSha) {
      errors.push('Production and Demo active deployments do not use the same Git commit.');
    }
    if (contract.environments.production.supabaseProjectRef === contract.environments.demo.supabaseProjectRef) {
      errors.push('The parity contract must require separate Production and Demo Supabase projects.');
    }
    checks.push('active deployment commit parity', 'separate Supabase projects');

    for (const [key, requiredValue] of Object.entries(contract.workflowParityFlags)) {
      const productionHasKey = hasOwn(production.values, key);
      const demoHasKey = hasOwn(demo.values, key);
      if (requiredValue === null && !productionHasKey && !demoHasKey) continue;
      if (!productionHasKey || !demoHasKey) {
        errors.push(`${key}: required workflow flag is missing from Production or Demo.`);
      } else if (production.values[key] !== demo.values[key]) {
        errors.push(`${key}: Production and Demo values differ.`);
      } else if (requiredValue !== null && production.values[key] !== requiredValue) {
        errors.push(`${key}: Production-equivalent workflow flag does not match its required value.`);
      }
    }
    checks.push('non-secret workflow flag parity');
  }

  if (demo) {
    for (const [key, expected] of Object.entries(contract.intentionalDemoDifferences)) {
      if (expected === null ? hasOwn(demo.values, key) : demo.values[key] !== expected) {
        errors.push(`${key}: Demo intentional difference does not match the documented contract.`);
      }
    }
    for (const key of contract.demoExternalEffects.falseOrAbsent) {
      if (!hasOwn(demo.values, key)) continue;
      const value = String(demo.values[key]).trim().toLowerCase();
      if (!FALSE_VALUES.has(value)) errors.push(`${key}: Demo external-effect gate is not explicitly disabled.`);
    }
    for (const key of contract.demoExternalEffects.absentKeys) {
      if (demo.configuredKeys.includes(key)) errors.push(`${key}: external-provider credential/capability must be absent from Demo.`);
    }
    checks.push('intentional Demo differences', 'Demo external-effect fail-closed posture');
  }

  return { ok: errors.length === 0, checks, errors };
}

export function safeParitySummary(result) {
  return {
    ok: result.ok,
    checks: result.checks,
    errors: result.errors,
    note: 'Only environment names, configuration key names, and pass/fail results are reported.',
  };
}

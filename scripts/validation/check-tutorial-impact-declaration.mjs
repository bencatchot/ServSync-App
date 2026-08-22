#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const ACCEPTED_STATUSES = new Set([
  'NOT APPLICABLE',
  'NONE',
  'UPDATE REQUIRED',
  'UPDATED',
]);

function readField(body, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(body || '').match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, 'im'));
  if (!match) return '';
  return match[1].replace(/<!--.*?-->/g, '').trim();
}

function isMeaningful(value) {
  return Boolean(value && !/^(?:none|n\/a|not applicable|tbd|todo)$/i.test(value));
}

export function validateTutorialImpactDeclaration(body) {
  const status = readField(body, 'Tutorial impact').toUpperCase();
  const evidence = readField(body, 'Tutorial evidence');
  const affectedTutorials = readField(body, 'Affected tutorials');
  const followUp = readField(body, 'Tutorial follow-up');
  const errors = [];

  if (!ACCEPTED_STATUSES.has(status)) {
    errors.push('Tutorial impact must be exactly NOT APPLICABLE, NONE, UPDATE REQUIRED, or UPDATED.');
  }
  if (!isMeaningful(evidence)) {
    errors.push('Tutorial evidence must briefly explain the Help Studio search/review or why the change is not user-facing.');
  }
  if ((status === 'UPDATE REQUIRED' || status === 'UPDATED') && !isMeaningful(affectedTutorials)) {
    errors.push('Affected tutorials must name each tutorial when an update is required or completed.');
  }
  if (status === 'UPDATE REQUIRED' && !isMeaningful(followUp)) {
    errors.push('Tutorial follow-up must name the owner or bounded replacement task when an update is still required.');
  }

  return {
    ok: errors.length === 0,
    status,
    evidence,
    affectedTutorials,
    followUp,
    errors,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validateTutorialImpactDeclaration(process.env.PR_BODY || '');
  if (!result.ok) {
    console.error(`Tutorial freshness declaration failed:\n- ${result.errors.join('\n- ')}`);
    process.exitCode = 1;
  } else {
    console.log(`Tutorial freshness declaration passed (${result.status}).`);
  }
}

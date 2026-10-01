import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const path = 'public/legal/servsync-2026-10-01-v1.json';
const text = readFileSync(path, 'utf8');
const bundle = JSON.parse(text);
if (!/^servsync-[\d-]+-v\d+$/.test(bundle.bundleId)) throw new Error('Invalid bundle ID');
if (text.includes('$servsync_policy$')) throw new Error('Unsafe SQL delimiter');
const hash = createHash('sha256').update(text).digest('hex');
const sql = `-- Generated from ${path}; SHA-256 ${hash}
-- Archive only. Does not activate signup or publish a policy. Requires separate DB approval.
begin;
insert into public.servsync_legal_policy_bundles (bundle_id, policy_text)
values ('${bundle.bundleId}', $servsync_policy$${text}$servsync_policy$);
commit;
`;
const manifest = `${JSON.stringify({ bundleId: bundle.bundleId, path, sha256: hash }, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync('servsync-legal-policy-archive.sql', 'utf8') !== sql
      || readFileSync('public/legal/manifest.json', 'utf8') !== manifest) {
    throw new Error('Policy archive or hash drift. Regenerate candidate before release; never change a published version.');
  }
  console.log('Policy text, archive SQL and SHA-256 match.');
} else {
  writeFileSync('servsync-legal-policy-archive.sql', sql);
  writeFileSync('public/legal/manifest.json', manifest);
}

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest=JSON.parse(readFileSync('public/legal/manifest.json','utf8'));
const raw=readFileSync(manifest.path,'utf8');
const bundle=JSON.parse(raw);
const problems=[];
if(createHash('sha256').update(raw).digest('hex')!==manifest.sha256) problems.push('Archive hash mismatch');
if(!bundle.operator?.trim()) problems.push('Confirm exact ServSync contracting entity');
if(!bundle.privacyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bundle.privacyEmail)) problems.push('Confirm monitored public privacy email and receipt test');
if(!/^\d{4}-\d{2}-\d{2}$/.test(bundle.effectiveDate||'')) problems.push('Approve effective/publication date');
if(bundle.releaseReady!==true) problems.push('Complete owner/counsel/provider and operating review; releaseReady is false');
if(problems.length){console.error('PUBLICATION BLOCKED:\n'+problems.map(x=>`- ${x}`).join('\n'));process.exitCode=1;}
else console.log('Source release metadata complete; separate database, merge and publication approvals still required.');

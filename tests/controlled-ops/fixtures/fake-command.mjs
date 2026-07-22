#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

const [mode = 'clean', value = '', counterPath = ''] = process.argv.slice(2);
if (counterPath) appendFileSync(counterPath, 'executed\n', { encoding: 'utf8' });

switch (mode) {
  case 'clean':
    process.stdout.write('status=ok\ncount=1\n');
    break;
  case 'stderr':
    process.stdout.write('status=ok\n');
    process.stderr.write('result=expected\n');
    break;
  case 'exit':
    process.stdout.write('status=failed\n');
    process.exitCode = Number.parseInt(value, 10);
    break;
  case 'delay':
    await new Promise((resolve) => setTimeout(resolve, Number.parseInt(value || '25', 10)));
    process.stdout.write('status=completed\n');
    break;
  case 'secret':
    process.stdout.write(`authorization: Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJmaXh0dXJlIn0', 'signature-value'].join('.')}\n`);
    break;
  case 'customer':
    process.stdout.write('customer details: Test Person, 123 Test Street\n');
    break;
  case 'malformed-json':
    process.stdout.write('{"status":"ok"\n');
    break;
  case 'duplicate':
    process.stdout.write('status=ok\nstatus=ok\n');
    break;
  case 'affected':
    process.stdout.write(`affected_rows=${Number.parseInt(value || '1', 10)}\nstatus=completed\n`);
    break;
  case 'large':
    process.stdout.write(`${'count=1\n'.repeat(Math.min(Number.parseInt(value || '100', 10), 1000))}`);
    break;
  case 'signal':
    process.kill(process.pid, 'SIGTERM');
    break;
  default:
    process.stderr.write('code=invalid_mode\n');
    process.exitCode = 64;
}

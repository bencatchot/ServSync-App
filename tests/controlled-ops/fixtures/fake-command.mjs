#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';

const allArguments = process.argv.slice(2);
const [mode = 'clean', value = '', counterPath = ''] = allArguments;
if (counterPath && mode !== 'argv') appendFileSync(counterPath, 'executed\n', { encoding: 'utf8' });

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
    process.stdout.write(`${'count=1\n'.repeat(Math.min(Number.parseInt(value || '100', 10), 200_000))}`);
    break;
  case 'large-stderr':
    process.stderr.write(`${'count=1\n'.repeat(Math.min(Number.parseInt(value || '100', 10), 200_000))}`);
    break;
  case 'both-large': {
    const repeats = Math.min(Number.parseInt(value || '100', 10), 200_000);
    process.stdout.write(`${'count=1\n'.repeat(repeats)}`); process.stderr.write(`${'count=1\n'.repeat(repeats)}`);
    break;
  }
  case 'long-line':
    process.stdout.write(`status=${'x'.repeat(Math.min(Number.parseInt(value || '20000', 10), 100_000))}\n`);
    break;
  case 'tree': {
    const childScript = `const {spawn}=require('node:child_process');const {appendFileSync}=require('node:fs');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);appendFileSync(process.argv[1],process.pid+'\\n'+p.pid+'\\n');setInterval(()=>{},1000);`;
    const child = spawn(process.execPath, ['-e', childScript, value], { stdio: 'ignore' });
    writeFileSync(value, `${process.pid}\n${child.pid}\n`);
    await new Promise(() => {});
    break;
  }
  case 'argv':
    writeFileSync(value, JSON.stringify(allArguments.slice(2)));
    process.stdout.write('status=ok\n');
    break;
  case 'signal':
    process.kill(process.pid, 'SIGTERM');
    break;
  default:
    process.stderr.write('code=invalid_mode\n');
    process.exitCode = 64;
}

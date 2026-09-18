import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

test('historical business-conflict RPCs are all covered by the forward repair', async () => {
  const repair = await readFile('servsync-rpc-business-conflict-no-retry.sql', 'utf8');
  const covered = new Set([...repair.matchAll(/'public\.(servsync_\w+)\(/g)].map(match => match[1]));
  const historical = new Set();
  for (const path of (await readdir('.')).filter(path => /^servsync-.*\.sql$/.test(path))) {
    const source = await readFile(path, 'utf8');
    const functions = [...source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)];
    for (const match of functions) {
      const end = source.indexOf('$$;', match.index);
      const definition = source.slice(match.index, end < 0 ? undefined : end);
      if (!/errcode\s*=\s*'40001'/i.test(definition)) continue;
      historical.add(match[1]);
      assert.ok(covered.has(match[1]), `${path}: ${match[1]} must use PT409 or be covered by the forward repair`);
    }
  }
  assert.equal(historical.size, 32, 'Update full SQL integration coverage when adding a conflict RPC');
  assert.deepEqual(covered, historical);
});

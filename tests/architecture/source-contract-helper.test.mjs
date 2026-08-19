import test from 'node:test';
import assert from 'node:assert/strict';
import {
  repositoryPath,
  sourceBetween,
  sourceFile,
  sourceFiles,
} from '../helpers/source-contract.mjs';

test('reads one or more repository sources for migration-safe contracts', () => {
  const packageSource = sourceFile('package.json');
  assert.match(packageSource, /vite-react-typescript-starter/);

  const combined = sourceFiles([
    'src/App.tsx',
    'src/features/work/ContractorWorkDashboard.tsx',
  ]);
  assert.match(combined, /source-contract: src\/App\.tsx/);
  assert.match(combined, /source-contract: src\/features\/work\/ContractorWorkDashboard\.tsx/);
});

test('extracts bounded source and rejects missing markers', () => {
  assert.equal(sourceBetween('before START content END after', 'START', 'END'), 'START content ');
  assert.throws(() => sourceBetween('content', 'missing', 'END'), /Expected source marker/);
  assert.throws(() => sourceBetween('START content', 'START', 'missing'), /Expected source end marker/);
});

test('rejects paths outside the repository', () => {
  assert.throws(() => repositoryPath('../outside.txt'), /must stay inside the repository/);
});

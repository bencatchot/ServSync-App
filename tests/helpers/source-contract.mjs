import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export function repositoryPath(relativePath) {
  const resolvedPath = resolve(REPOSITORY_ROOT, relativePath);
  if (resolvedPath !== REPOSITORY_ROOT && !resolvedPath.startsWith(`${REPOSITORY_ROOT}${sep}`)) {
    throw new Error(`Source-contract path must stay inside the repository: ${relativePath}`);
  }
  return resolvedPath;
}

export function sourceFile(relativePath) {
  return readFileSync(repositoryPath(relativePath), 'utf8');
}

export function sourceFiles(relativePaths) {
  return relativePaths
    .map(relativePath => `/* source-contract: ${relativePath} */\n${sourceFile(relativePath)}`)
    .join('\n');
}

export function sourceBetween(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) throw new Error(`Expected source marker: ${startMarker}`);

  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  if (endIndex <= startIndex) throw new Error(`Expected source end marker after start: ${endMarker}`);

  return source.slice(startIndex, endIndex);
}

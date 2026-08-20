import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const APP_TSX_PATH = 'src/App.tsx';
export const APP_TSX_MAX_LINES = 50_880;

export function countSourceLines(source) {
  if (source.length === 0) return 0;
  const newlineCount = source.match(/\n/g)?.length ?? 0;
  return newlineCount + (source.endsWith('\n') ? 0 : 1);
}

export function appMonolithBudgetResult(source, maximumLines = APP_TSX_MAX_LINES) {
  const lineCount = countSourceLines(source);
  return {
    lineCount,
    maximumLines,
    remainingLines: maximumLines - lineCount,
    passes: lineCount === maximumLines,
  };
}

export function checkAppMonolithBudget({
  appPath = resolve(process.cwd(), APP_TSX_PATH),
  maximumLines = APP_TSX_MAX_LINES,
} = {}) {
  return appMonolithBudgetResult(readFileSync(appPath, 'utf8'), maximumLines);
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  const result = checkAppMonolithBudget();
  if (!result.passes) {
    if (result.remainingLines < 0) {
      console.error(
        `${APP_TSX_PATH} is ${result.lineCount} lines, exceeding the ${result.maximumLines}-line architecture baseline by ${Math.abs(result.remainingLines)}. `
        + 'Move new behavior into an owning feature module or reduce the existing monolith before merging.',
      );
    } else {
      console.error(
        `${APP_TSX_PATH} is now ${result.lineCount} lines, ${result.remainingLines} below the recorded architecture baseline. `
        + `Lower APP_TSX_MAX_LINES to ${result.lineCount} in this same change so the improvement cannot regress.`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(
      `${APP_TSX_PATH} architecture baseline passed: ${result.lineCount} lines.`,
    );
  }
}

import { ESLint } from 'eslint';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ESLINT_WARNING_BASELINE = 80;

export function lintWarningBudgetResult(warningCount, expectedWarnings = ESLINT_WARNING_BASELINE) {
  return {
    warningCount,
    expectedWarnings,
    remainingWarnings: expectedWarnings - warningCount,
    passes: warningCount === expectedWarnings,
  };
}

export async function checkEslintWarningBudget({
  expectedWarnings = ESLINT_WARNING_BASELINE,
} = {}) {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(['.']);
  const formatter = await eslint.loadFormatter('stylish');
  const formattedResults = formatter.format(results);
  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const warningCount = results.reduce((total, result) => total + result.warningCount, 0);

  return {
    ...lintWarningBudgetResult(warningCount, expectedWarnings),
    errorCount,
    formattedResults,
  };
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  const result = await checkEslintWarningBudget();

  if (result.formattedResults) console.log(result.formattedResults);

  if (result.errorCount > 0) {
    console.error(`ESLint failed with ${result.errorCount} error${result.errorCount === 1 ? '' : 's'}.`);
    process.exitCode = 1;
  } else if (!result.passes) {
    if (result.remainingWarnings < 0) {
      console.error(
        `ESLint found ${result.warningCount} warnings, exceeding the ${result.expectedWarnings}-warning baseline by ${Math.abs(result.remainingWarnings)}.`,
      );
    } else {
      console.error(
        `ESLint found ${result.warningCount} warnings, ${result.remainingWarnings} below the recorded baseline. `
        + `Lower ESLINT_WARNING_BASELINE to ${result.warningCount} in this same change so the improvement cannot regress.`,
      );
    }
    process.exitCode = 1;
  } else {
    console.log(`ESLint warning baseline passed: 0 errors and exactly ${result.warningCount} warnings.`);
  }
}

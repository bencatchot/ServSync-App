import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('automatic role tour removal', () => {
  test('removes automatic homeowner and contractor tour code paths', () => {
    const appSource = sourceFile('src/App.tsx');
    const storageSource = sourceFile('src/utils/localStorage.ts');
    const combinedSource = `${appSource}\n${storageSource}`;

    for (const removedTourToken of [
      'RoleWalkthroughCard',
      'WalkthroughStep',
      'HOMEOWNER_WALKTHROUGH_STEPS',
      'CONTRACTOR_WALKTHROUGH_STEPS',
      'showHomeownerWalkthrough',
      'showContractorWalkthrough',
      'homeownerWalkthrough',
      'contractorWalkthrough',
      'walkthroughSkipped',
      'Homeowner tour',
      'Contractor tour',
      'Skip Tour',
      'Start Using ServSync',
    ]) {
      expect(combinedSource).not.toContain(removedTourToken);
    }
  });

  test('keeps homeowner setup prompt and onboarding checklist intact', () => {
    const appSource = sourceFile('src/App.tsx');
    const setupPromptSource = sourceBetween(
      appSource,
      '{showInitialHomeSetupPrompt && (',
      "{homes.length !== 1 && !['requests', 'discover'].includes(homeownerTab) && (",
    );
    const onboardingSource = sourceBetween(
      appSource,
      'const homeownerOnboardingItems: Array<',
      'const completedHomeownerOnboardingCount =',
    );

    expect(appSource).toContain('const showInitialHomeSetupPrompt = !loading && homes.length === 0 && !homeSetupSkipped;');
    expect(setupPromptSource).toContain('Home setup');
    expect(setupPromptSource).toContain('Tell us about your home');
    expect(setupPromptSource).toContain('Save home profile');
    expect(setupPromptSource).toContain('Skip for now');
    expect(onboardingSource).toContain('Add or confirm your first property');
    expect(onboardingSource).toContain('Connect with a contractor');
    expect(onboardingSource).toContain('Request service');
    expect(onboardingSource).toContain('Review an estimate or invoice');
    expect(appSource).toContain('const showHomeownerOnboardingChecklist = completedHomeownerOnboardingCount < homeownerOnboardingItems.length;');
    expect(appSource).toContain('Set up your home record');
  });

  test('keeps contractor setup prompt and onboarding checklist intact', () => {
    const appSource = sourceFile('src/App.tsx');
    const setupPromptSource = sourceBetween(
      appSource,
      '{showInitialContractorProfileSetupPrompt && (',
      '{homeTemplatePrompt && (',
    );
    const onboardingSource = sourceBetween(
      appSource,
      'const contractorOnboardingItems: Array<',
      'const completedContractorOnboardingCount =',
    );

    expect(appSource).toContain('const showInitialContractorProfileSetupPrompt = !loading');
    expect(setupPromptSource).toContain('Business setup');
    expect(setupPromptSource).toContain('Set up your business profile');
    expect(setupPromptSource).toContain('Set Up Business Profile');
    expect(setupPromptSource).toContain('Skip for Now');
    expect(onboardingSource).toContain('Complete company profile');
    expect(onboardingSource).toContain('Add your first customer');
    expect(onboardingSource).toContain('Send your first estimate');
    expect(onboardingSource).toContain('Send your first invoice');
    expect(appSource).toContain('const showContractorOnboardingChecklist = completedContractorOnboardingCount < contractorOnboardingItems.length;');
    expect(appSource).toContain('Follow the core workflow once, then this checklist gets out of the way.');
  });
});

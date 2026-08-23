import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

test.describe('homeowner dashboard attention priority', () => {
  test('places the attention queue directly after the dashboard command center', () => {
    const source = appSource();
    const overviewStart = source.indexOf("{homeownerTab === 'overview' && (");
    const overviewEnd = source.indexOf("{homeownerTab === 'home' && selectedHome", overviewStart);
    const overview = source.slice(overviewStart, overviewEnd);

    const commandCenter = overview.indexOf('Home command center');
    const attentionQueue = overview.indexOf('What needs your attention?');
    const onboarding = overview.indexOf('Set up your home record');
    const feedback = overview.indexOf('Help improve ServSync');

    expect(overviewStart).toBeGreaterThanOrEqual(0);
    expect(overviewEnd).toBeGreaterThan(overviewStart);
    expect(commandCenter).toBeGreaterThanOrEqual(0);
    expect(attentionQueue).toBeGreaterThan(commandCenter);
    expect(onboarding).toBeGreaterThan(attentionQueue);
    expect(feedback).toBeGreaterThan(attentionQueue);
    expect(overview.match(/What needs your attention\?/g)).toHaveLength(1);
  });
});

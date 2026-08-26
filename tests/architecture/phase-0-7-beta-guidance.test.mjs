import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';

const repoFile = path => readFileSync(resolve(process.cwd(), path), 'utf8');

test('both pilot roles receive one stable Beta Guide destination and Support handoff', () => {
  const app = repoFile('src/App.tsx');
  const guide = repoFile('src/features/help/BetaGuidePanel.tsx');
  const contractorNavigation = repoFile('src/features/navigation/contractorWorkspaceNavigation.ts');

  assert.match(app, /\{ id: 'beta',\s+label: 'Beta Guide'/);
  assert.match(app, /<BetaGuidePanel\s+role="homeowner"/);
  assert.match(app, /<BetaGuidePanel\s+role="contractor"/);
  assert.match(app, /openHomeownerBetaFeedback\('question', 'Beta help'\)/);
  assert.match(app, /openContractorBetaFeedback\('question', 'Beta help'\)/);
  assert.match(contractorNavigation, /\| 'beta'/);
  assert.match(guide, /data-testid=\{`\$\{role\}-beta-guide`\}/);
  assert.match(guide, /Open Support/);
});

test('Beta Guide distinguishes available, manual, and unavailable capability without inventing promises', () => {
  const guide = repoFile('src/features/help/BetaGuidePanel.tsx');

  assert.match(guide, /eyebrow: 'Available in beta'/);
  assert.match(guide, /eyebrow: 'Manual for now'/);
  assert.match(guide, /eyebrow: 'Not available yet'/);
  assert.match(guide, /Collect payment outside ServSync/);
  assert.match(guide, /Pay the contractor outside ServSync/);
  assert.match(guide, /QuickBooks or other accounting sync/);
  assert.match(guide, /Automatic email, text, or push reminders/);
  assert.match(guide, /Native iOS or Android apps/);
  assert.match(guide, /Full external calendar sync or advanced dispatch/);
  assert.match(guide, /Broad public marketplace lead generation/);
  assert.doesNotMatch(guide, /verified contractor/i);
});

test('automation-prone workflows carry concise contextual boundaries', () => {
  const app = repoFile('src/App.tsx');

  assert.match(app, /Payment collection happens outside ServSync during the controlled beta\./);
  assert.match(app, /Payment collection happens outside ServSync during beta\./);
  assert.match(app, /homeowner-calendar-beta-boundary/);
  assert.match(app, /contractor-calendar-beta-boundary/);
  assert.match(app, /contractor-discover-beta-boundary/);
  assert.match(app, /Discover is limited during the private beta\./);
  assert.match(app, /Home Reminders are manual follow-up notes you create for yourself\./);
});

test('Beta Guide reuses role-aware published Help instead of creating a second media system', () => {
  const app = repoFile('src/App.tsx');

  assert.match(app, /contextKey="contractor\.drafts"/);
  assert.match(app, /label="Estimate walkthrough"/);
  assert.match(app, /ContextualHelp/);
});

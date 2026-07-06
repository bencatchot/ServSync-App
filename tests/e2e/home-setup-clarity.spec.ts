import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Home Setup clarity shell', () => {
  test('homeowner property area shows setup guidance based on existing surfaces only', () => {
    const source = appSource();
    const homeSetupDataSource = sourceBetween(
      source,
      'const homeSetupGuideItems = [',
      'const showInitialHomeSetupPrompt',
    );
    const homeSetupUiSource = sourceBetween(
      source,
      'data-testid="home-setup-guide"',
      '{renderSharedHomeShellsPanel()}',
    );

    expect(homeSetupUiSource).toContain('Home Setup');
    expect(homeSetupUiSource).toContain('Start with the basics: property details, rooms, photos, documents, reminders, and notes.');
    expect(homeSetupDataSource).toContain('Complete property details');
    expect(homeSetupDataSource).toContain('Add rooms');
    expect(homeSetupDataSource).toContain('Add a home photo');
    expect(homeSetupDataSource).toContain('Upload important documents');
    expect(homeSetupDataSource).toContain('Create maintenance reminders');
    expect(homeSetupDataSource).toContain('Add useful notes');
    expect(homeSetupDataSource).toContain('homeProfileScore === 100');
    expect(homeSetupDataSource).toContain('selectedHomeRooms.length > 0');
    expect(homeSetupDataSource).toContain('homeDraft.home_photo_path');
    expect(homeSetupDataSource).toContain('selectedHomeManualDocuments.length > 0');
    expect(homeSetupDataSource).toContain('propertyScopedHomeReminders.filter');
    expect(homeSetupDataSource).toContain('homeDraft.notes.trim()');
  });

  test('future Home Setup Template and Home Map copy stays scoped and modest', () => {
    const source = appSource();
    const homeSetupSource = sourceBetween(
      source,
      'data-testid="home-setup-guide"',
      '{renderSharedHomeShellsPanel()}',
    );

    expect(homeSetupSource).toContain('Rooms are available now for basic home organization.');
    expect(homeSetupSource).toContain('Systems &amp; Assets, Key Home Locations, Home Map, and true Home Setup Templates remain future tools.');
    expect(homeSetupSource).toContain('Home Map will start as a simple not-to-scale room and system map, not a measured floor plan, CAD tool, LiDAR scan, floor-plan generator, or 3D model.');
    expect(homeSetupSource).toContain('Home-specific Inspection Checklists are for inspections and reports. They are separate from future Home Setup Templates.');
    expect(homeSetupSource).not.toContain('Home Templates');
    expect(homeSetupSource).not.toContain('floor-plan creator');
    expect(homeSetupSource).not.toContain('measured layouts');
  });

  test('setup shell does not add system, key-location, map, or checklist persistence paths', () => {
    const source = appSource();
    const homeSetupDataSource = sourceBetween(
      source,
      'const homeSetupGuideItems = [',
      'const showInitialHomeSetupPrompt',
    );
    const homeSetupUiSource = sourceBetween(
      source,
      'data-testid="home-setup-guide"',
      '{renderSharedHomeShellsPanel()}',
    );
    const homeSetupSource = `${homeSetupDataSource}\n${homeSetupUiSource}`;

    expect(homeSetupSource).not.toContain('supabase.');
    expect(homeSetupSource).not.toContain(".from('inspection_templates')");
    expect(homeSetupSource).not.toContain('inspection_templates');
    expect(homeSetupSource).not.toContain('home_systems');
    expect(homeSetupSource).not.toContain('home_assets');
    expect(homeSetupSource).not.toContain('key_locations');
    expect(homeSetupSource).not.toContain('home_map');
    expect(homeSetupSource).not.toContain('floor_plan');
    expect(homeSetupSource).not.toContain('storage.from');
    expect(source).not.toContain('home_systems');
    expect(source).not.toContain('home_assets');
    expect(source).not.toContain('key_locations');
    expect(source).not.toContain('home_map');
    expect(source).not.toContain('floor_plan');
  });

  test('shared-home permission and address-visibility guardrails remain visible', () => {
    const source = appSource();
    const sharedHomesSource = sourceBetween(
      source,
      '<Card title="Homes shared with me" icon={<Home size={18} />}>',
      '<Card title="Home Access" icon={<Users size={18} />}>',
    );

    expect(sharedHomesSource).toContain('Shared home records are limited.');
    expect(sharedHomesSource).toContain('Requests, estimates, invoices, jobs, documents, messages, notifications, storage, contractor connections, and Home History remain private until sharing is expanded.');
    expect(sharedHomesSource).toContain('Limited location shared');
    expect(sharedHomesSource).toContain('This shared home cannot be selected for owner dashboard records yet.');
    expect(sharedHomesSource).toContain('Read-only reminders shared with this home. Notes and linked records are not shared yet.');
  });
});

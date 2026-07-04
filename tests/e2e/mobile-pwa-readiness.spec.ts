import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test.describe('mobile PWA readiness metadata', () => {
  test('index.html references conservative PWA and mobile metadata', () => {
    const html = readRepoFile('index.html');

    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/servsync-pwa-192.png" />');
    expect(html).toContain('<meta name="theme-color" content="#223d67" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="ServSync" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />');
    expect(html).not.toContain('user-scalable=no');
    expect(html).not.toContain('maximum-scale=1');
  });

  test('manifest is valid JSON with required installability fields and existing icons', () => {
    const manifestPath = resolve(repoRoot, 'public/manifest.webmanifest');

    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string;
      short_name?: string;
      description?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      background_color?: string;
      theme_color?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
      screenshots?: unknown;
      shortcuts?: unknown;
    };

    expect(manifest.name).toBe('ServSync');
    expect(manifest.short_name).toBe('ServSync');
    expect(manifest.description).toContain('ServSync helps homeowners find local contractors');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.icons).toHaveLength(2);
    expect(manifest).not.toHaveProperty('screenshots');
    expect(manifest).not.toHaveProperty('shortcuts');
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain('offline');

    for (const icon of manifest.icons ?? []) {
      expect(icon.src).toMatch(/^\/servsync-pwa-(192|512)\.png$/);
      expect(icon.sizes).toMatch(/^(192|512)x\1$/);
      expect(icon.type).toBe('image/png');
      expect(icon.purpose).toBe('any');
      expect(existsSync(resolve(repoRoot, 'public', icon.src?.replace(/^\//, '') ?? ''))).toBe(true);
    }
  });

  test('slice does not add service worker registration or native app projects', () => {
    const source = [
      readRepoFile('index.html'),
      readRepoFile('src/main.tsx'),
      readRepoFile('src/App.tsx'),
    ].join('\n').toLowerCase();

    expect(source).not.toContain('serviceworker');
    expect(source).not.toContain('navigator.serviceworker');
    expect(source).not.toContain('registerserviceworker');
    expect(existsSync(resolve(repoRoot, 'public/sw.js'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'capacitor.config.ts'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'capacitor.config.json'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'ios'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'android'))).toBe(false);
  });
});

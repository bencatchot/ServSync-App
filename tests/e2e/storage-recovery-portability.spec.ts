import { expect, test } from '@playwright/test';
import { configuredSupabasePublicStorageUrl } from '../../src/storageUrls';

const productionUrl = 'https://uqgtheclhxqlnjpfmheq.supabase.co';
const recoveryUrl = 'https://zizojbqbsikymrdhfebd.supabase.co';

test.describe('FB-016 recovered public Storage URL portability', () => {
  test('rebases a recognized contractor asset onto the configured project', () => {
    expect(configuredSupabasePublicStorageUrl(
      `${productionUrl}/storage/v1/object/public/contractor-assets/owner/logo.png`,
      recoveryUrl,
      'contractor-assets',
    )).toBe(`${recoveryUrl}/storage/v1/object/public/contractor-assets/owner/logo.png`);
  });

  test('preserves path encoding, query parameters, and fragments', () => {
    expect(configuredSupabasePublicStorageUrl(
      `${productionUrl}/storage/v1/object/public/contractor-assets/owner/logo%20mark.png?version=2#brand`,
      recoveryUrl,
      'contractor-assets',
    )).toBe(`${recoveryUrl}/storage/v1/object/public/contractor-assets/owner/logo%20mark.png?version=2#brand`);
  });

  test('does not rewrite external, private, other-bucket, or malformed values', () => {
    const values = [
      'https://cdn.example.com/storage/v1/object/public/contractor-assets/logo.png',
      `${productionUrl}/storage/v1/object/sign/contractor-assets/logo.png`,
      `${productionUrl}/storage/v1/object/public/email-assets/logo.png`,
      'not-a-url',
    ];

    for (const value of values) {
      expect(configuredSupabasePublicStorageUrl(value, recoveryUrl, 'contractor-assets')).toBe(value);
    }
  });

  test('fails closed when the configured project URL is unavailable or untrusted', () => {
    const value = `${productionUrl}/storage/v1/object/public/contractor-assets/owner/logo.png`;
    expect(configuredSupabasePublicStorageUrl(value, '', 'contractor-assets')).toBe(value);
    expect(configuredSupabasePublicStorageUrl(value, 'https://recovery.example.com', 'contractor-assets')).toBe(value);
  });
});

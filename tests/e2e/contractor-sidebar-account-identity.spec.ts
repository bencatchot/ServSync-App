import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor sidebar account identity', () => {
  test('SidebarLayout keeps account identity caller-provided with profile fallbacks', () => {
    const source = readRepoFile('src/App.tsx');
    const layoutSource = sourceBetween(source, 'function SidebarLayout({', 'function PhotoUploadPanel({');

    expect(layoutSource).toContain('accountName?: string | null;');
    expect(layoutSource).toContain('accountSubtitle?: string | null;');
    expect(layoutSource).toContain("const resolvedAccountName = accountName?.trim() || profile.full_name || profile.email;");
    expect(layoutSource).toContain("const resolvedAccountSubtitle = accountSubtitle?.trim() || profile.role.replace('_', ' ');");
    expect(layoutSource).toContain('{resolvedAccountName}');
    expect(layoutSource).toContain('{resolvedAccountSubtitle}');
    expect(layoutSource).not.toContain('contractorDraft.contact_name');
    expect(layoutSource).not.toContain('contact_name');
  });

  test('contractor shell separates business branding from signed-in account identity', () => {
    const source = readRepoFile('src/App.tsx');
    const contractorShellSource = sourceBetween(
      source,
      '  return (\n    <SidebarLayout\n      brand={{ name: contractorDraft.business_name',
      '    >',
    );

    expect(contractorShellSource).toContain("brand={{ name: contractorDraft.business_name || 'ServSync', subtitle: 'Contractor Portal' }}");
    expect(contractorShellSource).toContain('profileLogoUrl={contractorDraft.logo_url}');
    expect(contractorShellSource).toContain('profileLogoFit="contain"');
    expect(contractorShellSource).toContain('accountName={contractorAccountName}');
    expect(contractorShellSource).toContain('accountSubtitle={contractorAccountSubtitle}');
    expect(contractorShellSource).not.toContain('accountName={contractorDraft.business_name');
    expect(contractorShellSource).not.toContain('accountName={contractorDraft.contact_name');
    expect(contractorShellSource).not.toContain('accountSubtitle={profile.role');
  });

  test('contractor account subtitle uses owner/team role instead of coarse contractor role', () => {
    const source = readRepoFile('src/App.tsx');
    const roleSource = sourceBetween(
      source,
      '  const currentContractorTeamMember = teamAccess?.members.find',
      '  const canManageServiceAgreements =',
    );

    expect(roleSource).toContain("contractorDraft.owner_user_id === profile.id ? 'owner'");
    expect(roleSource).toContain('currentContractorTeamMember?.role ?? null');
    expect(roleSource).toContain("const contractorAccountName = profile.full_name.trim() || profile.email;");
    expect(roleSource).toContain("currentContractorTeamRole === 'owner'");
    expect(roleSource).toContain("'Owner'");
    expect(roleSource).toContain('CONTRACTOR_TEAM_ROLE_LABELS[currentContractorTeamRole]');
    expect(roleSource).toContain("'Contractor'");
    expect(roleSource).not.toContain('contractorDraft.contact_name');
    expect(roleSource).not.toContain("profile.role.replace('_', ' ')");
  });

  test('account-name save updates only the signed-in profiles.full_name field', () => {
    const source = readRepoFile('src/App.tsx');
    const saveSource = sourceBetween(
      source,
      '  const saveContractorAccountName = async () => {',
      '  const uploadContractorLogo = async',
    );
    const validationIndex = saveSource.indexOf('if (!nextAccountName)');
    const savingIndex = saveSource.indexOf('setSavingAccountName(true)');
    const updateIndex = saveSource.indexOf(".from('profiles')");

    expect(saveSource).toContain("if (!nextAccountName) {\n      setError('Enter your name before saving.');\n      return;\n    }");
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeLessThan(savingIndex);
    expect(validationIndex).toBeLessThan(updateIndex);
    expect(saveSource).toContain(".from('profiles')");
    expect(saveSource).toContain('.update({ full_name: nextAccountName })');
    expect(saveSource).toContain(".eq('id', profile.id)");
    expect(saveSource).toContain('onProfileUpdated(updatedProfile)');
    expect(saveSource).toContain("setNotice('Account name saved.');");
    expect(saveSource).not.toContain('Account name cleared');
    expect(saveSource).not.toContain(".from('contractor_profiles')");
    expect(saveSource).not.toContain('contractorDraft.contact_name');
    expect(saveSource).not.toContain('contractorDraft.business_name');
    expect(saveSource).not.toContain('contractor_team_members');
  });

  test('business profile account card avoids contact-name fallback for the signed-in owner', () => {
    const source = readRepoFile('src/App.tsx');
    const accountCardSource = sourceBetween(
      source,
      '<p className="text-sm font-bold text-[#02132D]">Signed-in account</p>',
      '<div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3">',
    );
    const ownerCardSource = sourceBetween(
      source,
      '<p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Current owner</p>',
      '<p className="mt-0.5 text-xs text-blue-800">{profile.email} · Owner seat</p>',
    );

    expect(accountCardSource).toContain('This is the person shown in the lower sidebar account area.');
    expect(accountCardSource).toContain('value={accountNameDraft}');
    expect(accountCardSource).toContain('placeholder={profile.email}');
    expect(accountCardSource).toContain('!accountNameDraft.trim()');
    expect(accountCardSource).not.toContain('contact_name');
    expect(ownerCardSource).toContain('{profile.full_name || profile.email}');
    expect(ownerCardSource).not.toContain('contractorDraft.contact_name');
  });
});

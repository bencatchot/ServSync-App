import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('signup email confirmation modal', () => {
  test('modal uses clear email-confirmation copy and mobile-friendly dialog treatment', () => {
    const source = appSource();
    const modalSource = sourceBetween(source, 'function SignupEmailConfirmationModal', 'function ContractorReferralInvitePage');

    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).toContain('data-testid="signup-email-confirmation-modal"');
    expect(modalSource).toContain('items-end justify-center');
    expect(modalSource).toContain('sm:items-center');
    expect(modalSource).toContain('Check your email to finish creating your account');
    expect(modalSource).toContain('We sent a confirmation link to');
    expect(modalSource).toContain('Open that link to activate your ServSync account.');
    expect(modalSource).toContain('Don’t see it? Check your spam, junk, or promotions folder. It may take a minute to arrive.');
    expect(modalSource).toContain('I’ll check my email');
    expect(modalSource).toContain('Resend confirmation email');
    expect(modalSource).toContain('Resend available in');
    expect(modalSource).toContain('normalizedEmail ? <span');
  });

  test('resend action is delayed, one-attempt, and uses the submitted signup email only', () => {
    const source = appSource();
    const modalSource = sourceBetween(source, 'function SignupEmailConfirmationModal', 'function ContractorReferralInvitePage');

    expect(modalSource).toContain('const [resendDelaySeconds, setResendDelaySeconds] = useState(60);');
    expect(modalSource).toContain('const [resendAttempted, setResendAttempted] = useState(false);');
    expect(modalSource).toContain('if (!supabase || !normalizedEmail || resendDelaySeconds > 0 || resendBusy || resendAttempted) return;');
    expect(modalSource).toContain('await supabase.auth.resend({');
    expect(modalSource).toContain("type: 'signup'");
    expect(modalSource).toContain('email: normalizedEmail');
    expect(modalSource).not.toContain('emailRedirectTo');
    expect(modalSource).toContain('We requested another confirmation email. It may take a minute to arrive.');
    expect(modalSource).toContain('We could not resend that email right now. Wait a minute and try again.');
    expect(modalSource).toContain('disabled={!normalizedEmail || resendDelaySeconds > 0 || resendBusy || resendAttempted}');
    expect(modalSource).toContain('Confirmation email requested');
    expect(modalSource).toContain('Try again later');
  });

  test('successful signup without an immediate session opens the modal with the local email state', () => {
    const source = appSource();
    const authPageSource = sourceBetween(source, 'function AuthPage', 'function SignupEmailConfirmationModal');
    const referralSource = sourceBetween(source, 'function ContractorReferralInvitePage', 'function LocalCustomerClaimPage');
    const claimSource = sourceBetween(source, 'function LocalCustomerClaimPage', 'function ContextualConnectionRequestModal');

    for (const componentSource of [authPageSource, referralSource, claimSource]) {
      expect(componentSource).toContain('const [signupConfirmation, setSignupConfirmation] = useState<{ email: string; nextStepHint?: string } | null>(null);');
      expect(componentSource).toContain('setSignupConfirmation(null);');
      expect(componentSource).toContain('const { data');
      expect(componentSource).toContain('await supabase.auth.signUp({');
      expect(componentSource).toContain('if (data.session && data.user)');
      expect(componentSource).toContain('setSignupConfirmation({');
      expect(componentSource).toContain('email,');
      expect(componentSource).toContain('<SignupEmailConfirmationModal');
      expect(componentSource).not.toContain('Account created. Check your email to confirm your ServSync account before signing in');
    }

    expect(authPageSource).toContain('After confirming your email, return here and sign in.');
    expect(referralSource).toContain('After confirming your email, reopen this contractor invitation link to continue.');
    expect(claimSource).toContain('After confirming your email, reopen this invite link to continue.');
  });

  test('failed signup paths preserve errors and do not display the confirmation modal', () => {
    const source = appSource();
    const authPageSource = sourceBetween(source, 'function AuthPage', 'function SignupEmailConfirmationModal');
    const referralSource = sourceBetween(source, 'function ContractorReferralInvitePage', 'function LocalCustomerClaimPage');
    const claimSource = sourceBetween(source, 'function LocalCustomerClaimPage', 'function ContextualConnectionRequestModal');

    expect(authPageSource).toContain('if (error) throw error;');
    expect(referralSource).toContain('if (signupError) throw signupError;');
    expect(claimSource).toContain('if (error) throw error;');

    const catchBlocks = [
      sourceBetween(authPageSource, 'catch (err) {', '} finally {'),
      sourceBetween(referralSource, 'catch (err) {', '} finally {'),
      sourceBetween(claimSource, 'catch (err) {', '} finally {'),
    ];

    for (const catchBlock of catchBlocks) {
      expect(catchBlock).not.toContain('setSignupConfirmation({');
      expect(catchBlock).not.toContain('auth.resend');
    }
  });

  test('resend is not wired into signin or password reset flows', () => {
    const source = appSource();
    const authPageSource = sourceBetween(source, 'function AuthPage', 'function SignupEmailConfirmationModal');
    const referralSource = sourceBetween(source, 'function ContractorReferralInvitePage', 'function LocalCustomerClaimPage');
    const claimSource = sourceBetween(source, 'function LocalCustomerClaimPage', 'function ContextualConnectionRequestModal');

    expect(authPageSource).toContain('await supabase.auth.resetPasswordForEmail(email, {');
    for (const componentSource of [authPageSource, referralSource, claimSource]) {
      expect(componentSource).toContain('await supabase.auth.signInWithPassword');
      expect(componentSource).toContain('await supabase.auth.signUp({');
      expect(componentSource).not.toContain('auth.resend');
    }
  });

  test('dismissing the modal returns each signup surface to sign-in state', () => {
    const source = appSource();
    const authPageSource = sourceBetween(source, 'function AuthPage', 'function SignupEmailConfirmationModal');
    const referralSource = sourceBetween(source, 'function ContractorReferralInvitePage', 'function LocalCustomerClaimPage');
    const claimSource = sourceBetween(source, 'function LocalCustomerClaimPage', 'function ContextualConnectionRequestModal');

    for (const componentSource of [authPageSource, referralSource, claimSource]) {
      const modalUsage = sourceBetween(componentSource, '<SignupEmailConfirmationModal', '/>');
      expect(modalUsage).toContain('onPrimary={() => {');
      expect(modalUsage).toContain('setSignupConfirmation(null);');
      expect(modalUsage).toContain("setMode('signin');");
      expect(modalUsage).toContain("setPassword('');");
      expect(modalUsage).toContain('setAcceptedLegal(false);');
    }

    expect(authPageSource).toContain("setMessage('');");
    expect(referralSource).toContain("setAuthMessage('');");
    expect(claimSource).toContain("setAuthMessage('');");
  });
});

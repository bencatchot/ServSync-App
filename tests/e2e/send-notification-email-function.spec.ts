import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FUNCTION_PATH = 'supabase/functions/send-notification-email/index.ts';
const functionSource = readFileSync(FUNCTION_PATH, 'utf8');

const EMAIL_V1_EVENT_TYPES = [
  'homeowner_request',
  'appointment_confirmed',
  'appointment_cancelled',
  'estimate_sent',
  'estimate_accepted',
  'estimate_declined',
  'invoice_sent',
] as const;

const DEFERRED_EVENT_TYPES = [
  'appointment_reschedule_proposed',
  'home_access_invite_submitted',
  'home_access_invite_sent',
] as const;

function sourceFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') return [];
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return sourceFilesUnder(fullPath);
    return stat.isFile() ? [fullPath] : [];
  });
}

test.describe('send-notification-email edge function guardrails', () => {
  test('keeps in-app notifications as the source of truth before email delivery', () => {
    expect(functionSource).toContain('Called by a Supabase database webhook on notifications INSERT');
    expect(functionSource).toContain("if (payload.type !== 'INSERT')");
    expect(functionSource).toContain("if (payload.table !== 'notifications')");
    expect(functionSource).toContain('The in-app row in public.notifications remains the source of');
    expect(functionSource).not.toMatch(/insert\s+into\s+public\.notifications/i);
  });

  test('stays globally disabled unless EMAIL_ENABLED is explicitly true', () => {
    const emailEnabledIndex = functionSource.indexOf("Deno.env.get('EMAIL_ENABLED') === 'true'");
    const disabledReturnIndex = functionSource.indexOf("reason: 'disabled'");
    const webhookSecretIndex = functionSource.indexOf("Deno.env.get('NOTIFICATION_WEBHOOK_SECRET')");
    const parsePayloadIndex = functionSource.indexOf('parseWebhookPayload(req)');

    expect(emailEnabledIndex).toBeGreaterThan(-1);
    expect(disabledReturnIndex).toBeGreaterThan(emailEnabledIndex);
    expect(webhookSecretIndex).toBeGreaterThan(emailEnabledIndex);
    expect(parsePayloadIndex).toBeGreaterThan(disabledReturnIndex);
  });

  test('limits email delivery to the approved transactional notification allowlist', () => {
    for (const eventType of EMAIL_V1_EVENT_TYPES) {
      expect(functionSource).toContain(`${eventType}: {`);
    }

    expect(functionSource).toContain('event_not_in_v1_scope');
    expect(functionSource).toContain('Only add types here after a trusted server-side path already creates');

    for (const eventType of DEFERRED_EVENT_TYPES) {
      expect(functionSource).not.toContain(`${eventType}: {`);
    }
  });

  test('uses recipient email preference and required recipient email checks', () => {
    expect(functionSource).toContain(".select('email, full_name, email_notifications_enabled')");
    expect(functionSource).toContain('user_opted_out');
    expect(functionSource).toContain('missing_recipient_email');
  });

  test('reports provider failure without adding workflow-side mutation logic', () => {
    expect(functionSource).toContain('provider_error');
    expect(functionSource).toContain('return jsonResponse({ sent: false, provider, reason:');
    expect(functionSource).not.toMatch(/servsync_send_|servsync_create_|servsync_homeowner_respond_to_estimate/);
  });

  test('does not expose provider or service-role secrets through frontend source', () => {
    const frontendSource = sourceFilesUnder('src')
      .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');

    expect(frontendSource).not.toContain('RESEND_API_KEY');
    expect(frontendSource).not.toContain('SENDGRID_API_KEY');
    expect(frontendSource).not.toContain('NOTIFICATION_WEBHOOK_SECRET');
    expect(frontendSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  test('does not add SMS, push, marketing, campaign, or bulk delivery behavior', () => {
    expect(functionSource).not.toMatch(/twilio|sms|fcm|apns|push|marketing|campaign|bulk/i);
  });
});

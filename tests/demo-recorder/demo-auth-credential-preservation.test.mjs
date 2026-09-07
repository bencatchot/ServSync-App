import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureAuthUser } from '../../scripts/demo/seed-demo-scenario.mjs';

const metadata = (role) => ({
  servsync_demo_owned: true,
  servsync_demo_scenario: 'water_heater_core_loop',
  servsync_demo_role: role,
});

function serviceWithUsers(users) {
  const calls = { create: [], update: [] };
  return {
    calls,
    auth: {
      admin: {
        async listUsers() {
          return { data: { users }, error: null };
        },
        async createUser(input) {
          calls.create.push(input);
          return {
            data: {
              user: {
                id: 'new-demo-user',
                email: input.email,
                user_metadata: input.user_metadata,
              },
            },
            error: null,
          };
        },
        async updateUserById(...input) {
          calls.update.push(input);
          throw new Error('ordinary fixture preparation must not update an existing Auth user');
        },
      },
    },
  };
}

test('ordinary Demo fixture preparation preserves an existing owned identity password', async () => {
  const existing = {
    id: 'existing-demo-user',
    email: 'contractor@example.test',
    user_metadata: metadata('contractor_owner'),
  };
  const service = serviceWithUsers([existing]);

  const result = await ensureAuthUser(
    service,
    existing.email,
    'different-operator-password',
    'water_heater_core_loop',
    'contractor_owner',
  );

  assert.equal(result, existing);
  assert.equal(service.calls.update.length, 0);
  assert.equal(service.calls.create.length, 0);
});

test('Demo fixture preparation still creates a missing owned identity with the supplied password', async () => {
  const service = serviceWithUsers([]);

  const result = await ensureAuthUser(
    service,
    'homeowner@example.test',
    'initial-password',
    'water_heater_core_loop',
    'homeowner',
  );

  assert.equal(result.id, 'new-demo-user');
  assert.equal(service.calls.create.length, 1);
  assert.equal(service.calls.create[0].password, 'initial-password');
  assert.deepEqual(service.calls.create[0].user_metadata, metadata('homeowner'));
  assert.equal(service.calls.update.length, 0);
});

test('Demo fixture preparation rejects an existing identity with unexpected ownership metadata', async () => {
  const service = serviceWithUsers([{
    id: 'unowned-user',
    email: 'homeowner@example.test',
    user_metadata: {},
  }]);

  await assert.rejects(
    ensureAuthUser(
      service,
      'homeowner@example.test',
      'operator-password',
      'water_heater_core_loop',
      'homeowner',
    ),
    /not marked as ServSync demo-owned/,
  );
  assert.equal(service.calls.update.length, 0);
  assert.equal(service.calls.create.length, 0);
});

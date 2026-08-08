-- Disposable fictional runtime catalog and Work fixtures. No professional
-- content is included and the real skeletal No Cooling work type stays off.

insert into public.trade_pack_trades (id, trade_key, display_name, description) values (
  '60000000-0000-0000-0000-000000000001',
  'fixturetrade', 'Fixture Trade', 'Disposable validation-only trade.'
);
insert into public.trade_pack_capabilities (id, capability_key, display_name, description) values (
  '61000000-0000-0000-0000-000000000001',
  'trade.fixturetrade.workflow.fixture_service',
  'Fixture Service', 'Disposable provider-neutral validation capability.'
);
insert into public.trade_pack_work_types (
  id, work_type_key, trade_id, workflow_family_id, required_capability_id, is_enabled
) values (
  '62000000-0000-0000-0000-000000000001',
  'fixturetrade.fixture_service',
  '60000000-0000-0000-0000-000000000001',
  'bf8d5386-8ddc-4cf3-90bf-658948b32a43',
  '61000000-0000-0000-0000-000000000001', true
);
insert into public.trade_pack_work_type_versions (
  id, work_type_id, version_number, version_status, display_name, description,
  definition_contract, published_at
) values (
  '63000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001', 1, 'published',
  'Fixture Service v1', 'Disposable validation definition.',
  jsonb_build_object(
    'schema_version', 1,
    'section', jsonb_build_object(
      'key', 'fixture_service', 'label', 'Fixture Service',
      'description', null, 'customer_visibility', 'contractor_private'
    ),
    'readings', jsonb_build_array(
      jsonb_build_object(
        'key', 'measurement', 'label', 'Measurement', 'description', null,
        'value_type', 'number', 'unit', 'units', 'required', true,
        'customer_visibility', 'contractor_private', 'options', jsonb_build_array()
      ),
      jsonb_build_object(
        'key', 'observation', 'label', 'Observation', 'description', null,
        'value_type', 'text', 'unit', null, 'required', false,
        'customer_visibility', 'contractor_private', 'options', jsonb_build_array()
      )
    ),
    'tests', jsonb_build_array(
      jsonb_build_object(
        'key', 'verified', 'label', 'Verified', 'description', null,
        'value_type', 'boolean', 'required', true,
        'customer_visibility', 'contractor_private', 'options', jsonb_build_array()
      ),
      jsonb_build_object(
        'key', 'condition', 'label', 'Condition', 'description', null,
        'value_type', 'choice', 'required', false,
        'customer_visibility', 'contractor_private',
        'options', jsonb_build_array('ok', 'review')
      )
    ),
    'findings', jsonb_build_array(
      jsonb_build_object(
        'key', 'finding', 'label', 'Finding', 'description', null,
        'severity_options', jsonb_build_array('low', 'high'),
        'customer_visibility', 'contractor_private'
      )
    ),
    'recommendations', jsonb_build_array(
      jsonb_build_object(
        'key', 'recommendation', 'label', 'Recommendation', 'description', null,
        'customer_visibility', 'contractor_private'
      )
    )
  ),
  timestamptz '2026-08-08 12:00:00+00'
);

insert into public.contractor_trade_pack_capability_grants (
  contractor_id, capability_id, access_mode, granted_by, reason
) values
  ('20000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'active', '00000000-0000-0000-0000-000000000005', 'Disposable validation'),
  ('20000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'active', '00000000-0000-0000-0000-000000000010', 'Disposable validation');

insert into public.contractor_work_drafts (
  id, contractor_id, homeowner_user_id, home_id, status
) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active'),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'active');
insert into public.contractor_work_drafts (
  id, contractor_id, local_contact_id, local_home_id, status
) values (
  '70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'active'
);

insert into public.inspections (
  id, contractor_id, homeowner_user_id, home_id, status, job_status
) values
  ('71000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'draft', 'in_progress'),
  ('71000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'draft', 'in_progress');

insert into public.estimates (
  id, contractor_id, homeowner_user_id, home_id, status
) values
  (
    '72000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'accepted'
  ),
  (
    '72000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'accepted'
  ),
  (
    '72000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'accepted'
  ),
  (
    '72000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'accepted'
  );

insert into public.inspections (
  id, contractor_id, homeowner_user_id, home_id, status, job_status
) values
  (
    '71000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
    'draft', 'in_progress'
  ),
  (
    '71000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    'draft', 'in_progress'
  );

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.servsync_create_property_asset(
  p_home_id => '10000000-0000-0000-0000-000000000002',
  p_asset_kind => 'other',
  p_name => 'Fixture second-property asset'
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public.servsync_create_property_asset(
  p_local_home_id => '41000000-0000-0000-0000-000000000001',
  p_contractor_id => '20000000-0000-0000-0000-000000000001',
  p_asset_kind => 'other',
  p_name => 'Fixture local asset'
);
reset request.jwt.claim.sub;

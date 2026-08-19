# ServSync Homeowner Properties Progressive Disclosure Acceptance

Date: 2026-08-19

Feature: FB-039D

Branch: `codex/fb039d-homeowner-properties-progressive-v1`

Base: `7c4aefb544e430abe4882b3c8215a54cef470947`

Draft PR: [#507](https://github.com/bencatchot/ServSync-App/pull/507)

## Accepted Product Contract

The homeowner Properties workspace now uses four explicit, progressive sections:

1. **Overview** is the default orientation surface. It shows the selected property, room/system counts, concise current service and financial attention, and direct Request service, Home Map, and Home History handoffs.
2. **Home Map** owns the established map entry and builder. Existing room, asset, system, layout, autosave, and manager/read-only behavior is unchanged.
3. **Access** owns Home Access invitations, memberships, incoming invitations, shared-home privacy shells, shared rooms/maps/assets, and read-only reminder shells.
4. **Property Settings** owns homeowner profile and property editing. Optional setup progress is collapsed by default and no future-feature explanation dominates the working screen.

One-property users see the selected home directly without a collection chooser. Multi-property users retain deterministic selection through a compact selector and collection surface. Historical documents, completed work, and finalized reports remain in Documents and Home History rather than being duplicated in Properties.

## Preservation Boundaries

- Home Map opens the same established full-screen builder and returns to the Home Map section.
- Existing room, asset, layout, privacy, shared-admin, member, viewer, invite, ownership, and RLS behavior is reused without new authority.
- Shared homes remain separate privacy-limited shells and do not become selectable owner records.
- Request service, current Estimate/Invoice context, Documents, and Home History handoffs retain their existing destinations and property scope.
- The browser remembers only the active Properties section through a new presentation-only local-storage key.
- No SQL, schema, RLS, RPC, authentication, permission, storage, environment, provider, or Production-data change is included.

## Validation Evidence

### Automated

- Focused Properties/Home Map source and authenticated UI contracts: 33 passed.
- Homeowner 390x844 Properties/Home Access smoke: 1 passed with zero horizontal overflow.
- Resettable Sandbox Home Access invite/accept/decline/revoke contracts: 2 passed; cleanup completed.
- Resettable Sandbox shared-home security and UI contracts: 6 passed, covering property scoping, non-reciprocity, member/viewer presentation, and direct mutation denial; cleanup completed.
- Resettable Sandbox shared reminder presentation: 2 passed; cleanup completed.
- TypeScript: passed.
- Production build: passed with the existing chunk-size advisory only.
- ESLint: passed at the existing 80-warning budget with no new warning.
- `src/App.tsx` architecture baseline reduced from 50,934 to 50,913 lines by extracting the workspace into its owning homeowner feature module.

### Authenticated presentation

- Fictional Demo homeowner at desktop: Overview, Home Map, Access, and Property Settings rendered as separate ownership surfaces; browser/page errors 0; horizontal overflow 0.
- Fictional Demo homeowner at 390x844: all four sections remained readable and usable; browser/page errors 0; horizontal overflow 0.
- Fictional Sandbox shared member and viewer fixtures: Access rendered only privacy-approved shared-home details and read-only actions; owner-only controls remained absent.
- Full-frame mobile review confirmed that the section control, property summary, actions, Home Map entry, Access boundaries, and collapsed setup progress do not overlap the homeowner navigation.

### Exact-head Preview

- Application-bearing head: `f6fb8e687ef3574e4ca853f4f18fc7f3c89dae42`.
- Protected ServSync Demo Preview: `READY` and authenticated with the approved fictional homeowner credential.
- Desktop: all four sections, Home Map Builder return, saved-section reload, Home History handoff, and Properties return passed.
- 390x844: all four sections and Home Access remained readable with zero horizontal overflow.
- Browser console/page errors: 0.
- The separate Sandbox Preview requires a project-specific protection bypass that was unavailable. No deployment protection was changed. Shared member/viewer presentation and denial behavior instead passed against the same exact application source and resettable Sandbox backend; all temporary membership/reminder fixtures were cleaned up.

## Remaining FB-039 Work

FB-039 remains active. Owner review and explicit merge approval remain for this bounded Phase 0.3 slice. After merge, the next assignment is Phase 0.4: atomic loading, useful empty states, actionable recovery/error handling, and duplicate-safe core transitions. Field-critical mobile density remains Phase 0.5.

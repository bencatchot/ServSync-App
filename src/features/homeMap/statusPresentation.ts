import { readableStatusLabel, type StatusPresentation, statusToneClass } from '../status/statusPresentation';

export type HomeMapDraftStatusPresentation = 'draft' | 'submitted' | 'accepted' | 'declined' | 'revoked';

export function homeMapDraftStatusPresentation(status: HomeMapDraftStatusPresentation | string | null | undefined): StatusPresentation {
  const presentations: Partial<Record<HomeMapDraftStatusPresentation, StatusPresentation>> = {
    draft: { label: 'Draft', tone: 'neutral' },
    submitted: { label: 'Submitted for Homeowner Review', tone: 'info' },
    accepted: { label: 'Approved by Homeowner', tone: 'success' },
    declined: { label: 'Declined by Homeowner', tone: 'danger' },
    revoked: { label: 'Revoked', tone: 'muted' },
  };

  return presentations[status as HomeMapDraftStatusPresentation] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function homeMapDraftStatusClass(status: HomeMapDraftStatusPresentation | string | null | undefined) {
  return statusToneClass(homeMapDraftStatusPresentation(status).tone);
}

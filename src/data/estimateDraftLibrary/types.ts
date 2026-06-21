import type { EstimateLineSupplyStatus, EstimateLineType } from '../../types';

export type EstimateDraftLibraryTrade = 'hvac' | 'plumbing' | 'electrical' | 'carpentry' | 'other';

export type EstimateDraftLibraryWorkCategory = 'install' | 'repair' | 'replace' | 'inspect' | 'service';

export type EstimateDraftLibraryReviewFlag =
  | 'code'
  | 'permit'
  | 'safety'
  | 'licensing'
  | 'electrical'
  | 'gas'
  | 'refrigerant'
  | 'structural'
  | 'manufacturer'
  | 'regional';

export interface ScopeWordingHelper {
  id: string;
  label: string;
  text: string;
  contractor_review_required?: boolean;
  review_flags?: EstimateDraftLibraryReviewFlag[];
}

export interface NotesTermsCandidate {
  id: string;
  text: string;
  contractor_review_required?: boolean;
  review_flags?: EstimateDraftLibraryReviewFlag[];
}

export interface ContractorReviewReminder {
  id: string;
  label: string;
  detail: string;
  review_flags: EstimateDraftLibraryReviewFlag[];
}

export interface EstimateDraftLibraryItem {
  id: string;
  title: string;
  line_type: EstimateLineType;
  unit: string;
  quantity?: string;
  customer_description?: string;
  model_spec?: string;
  supply_status?: EstimateLineSupplyStatus;
  match_terms?: string[];
  contractor_review_required?: boolean;
  review_flags?: EstimateDraftLibraryReviewFlag[];
  editor_note?: string;
}

export interface EstimateDraftLibrarySection {
  id: string;
  title: string;
  description?: string;
  items: EstimateDraftLibraryItem[];
}

export interface EstimateDraftLibraryBundle {
  trade: EstimateDraftLibraryTrade;
  work_category: EstimateDraftLibraryWorkCategory;
  job_bundle: string;
  display_name: string;
  aliases: string[];
  scope_summary: string;
  sections: EstimateDraftLibrarySection[];
  scope_wording_helpers: ScopeWordingHelper[];
  customer_note_candidates: NotesTermsCandidate[];
  terms_candidates: NotesTermsCandidate[];
  contractor_review_reminders: ContractorReviewReminder[];
  excluded_items: string[];
}

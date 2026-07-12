import type { Estimate } from '../../types';
import { estimateStatusPresentation, statusToneClass } from '../status/statusPresentation';

export function estimateStatusLabel(status: Estimate['status']) {
  return estimateStatusPresentation(status).label;
}

export function estimateStatusClass(status: Estimate['status']) {
  return statusToneClass(estimateStatusPresentation(status).tone);
}

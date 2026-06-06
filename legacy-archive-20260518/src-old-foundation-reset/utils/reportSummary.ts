import { Customer, Finding } from '../types';

function joinList(items: string[], max = 3) {
  const shown = items.slice(0, max);
  if (shown.length === 0) return '';
  if (shown.length === 1) return shown[0];
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`;
  return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`;
}

function roomFindingLabel(finding: Finding) {
  return `${finding.room}: ${finding.title}`;
}

function findingText(finding: Finding) {
  return `${finding.title} ${finding.description} ${finding.action}`.toLowerCase();
}

function costSavingsDetails(findings: Finding[]) {
  const details: string[] = [];
  const text = findings.map(findingText).join(' ');

  if (text.match(/leak|drip|moisture|water|drain|sink|toilet|shower|tub|disposal|p-trap|supply/)) {
    details.push('Plumbing/moisture items were addressed or identified early, which can help avoid cabinet damage, flooring damage, mold-related cleanup, drywall repairs, and emergency plumbing rates. Small leaks are typically far less costly to correct before they spread into hidden materials.');
  }
  if (text.match(/gutter|downspout|roof|flashing|grading|drainage|foundation|siding|caulk|sealant|window|door/)) {
    details.push('Exterior water-management items were documented to help prevent water from entering the structure. Keeping drainage, flashing, sealants, and exterior openings maintained can reduce the risk of rot, foundation moisture, interior staining, and larger envelope repairs.');
  }
  if (text.match(/hvac|filter|thermostat|furnace|condenser|air handler|condensate/)) {
    details.push('HVAC-related maintenance can support system efficiency and reduce strain on equipment. Addressing filters, drainage, airflow, and visible wear early may help prevent avoidable service calls and premature component failure.');
  }
  if (text.match(/gfci|outlet|electrical|breaker|panel|switch|spark|polarity/)) {
    details.push('Electrical items were noted because early correction can reduce safety risk and prevent smaller device or connection issues from becoming more serious hazards.');
  }
  if (text.match(/pest|rodent|termite|ants|nest|droppings|insect/)) {
    details.push('Pest-related observations can help limit damage by prompting earlier treatment or exclusion before nesting, chewing, moisture attraction, or structural damage becomes more extensive.');
  }

  if (details.length === 0) {
    details.push('The preventative value of this visit comes from documenting small maintenance conditions early, allowing them to be handled during routine service instead of becoming larger, more disruptive repairs later.');
  }
  return details;
}

export function buildProfessionalReportSummary(customer: Customer) {
  const allFindings = Object.values(customer.findings).flat();
  const urgent = allFindings.filter(f => f.status === 'Urgent');
  const fixed = allFindings.filter(f => f.status === 'Fixed On Site');
  const followUps = allFindings.filter(f => f.status === 'Needs Repair' || f.status === 'Monitor');
  const needsRepair = allFindings.filter(f => f.status === 'Needs Repair');
  const monitor = allFindings.filter(f => f.status === 'Monitor');
  const passed = allFindings.filter(f => f.status === 'Pass');

  const intro = `This home maintenance inspection for ${customer.name} focused on identifying active concerns, completing practical on-site corrections where appropriate, and documenting items that should be monitored or scheduled for follow-up. ${passed.length > 0 ? `${passed.length} inspected item${passed.length !== 1 ? 's were' : ' was'} documented as passing at the time of the visit.` : 'The report below documents the current inspection findings and maintenance recommendations.'}`;

  const urgentText = urgent.length > 0
    ? `${urgent.length} urgent item${urgent.length !== 1 ? 's require' : ' requires'} priority attention: ${joinList(urgent.map(roomFindingLabel), 5)}. These items should be addressed first because delaying correction may increase the risk of property damage, safety concerns, or higher repair costs.`
    : 'No urgent items were documented during this inspection.';

  const fixedText = fixed.length > 0
    ? `On-site work was completed for ${joinList(fixed.map(roomFindingLabel), 5)}. These corrections were handled during the visit and should be monitored at the next service to confirm the condition remains stable.`
    : 'No on-site fixes were recorded during this inspection.';

  const followUpText = followUps.length > 0
    ? `Recommended follow-up includes ${needsRepair.length} repair item${needsRepair.length !== 1 ? 's' : ''} and ${monitor.length} monitor item${monitor.length !== 1 ? 's' : ''}. Priority should be given to items marked Needs Repair, while Monitor items should be reviewed during the next scheduled maintenance visit.`
    : 'No open follow-up repairs or monitor items were recorded.';

  const savingsDetails = costSavingsDetails([...fixed, ...followUps, ...urgent]);
  const savingsText = `The work performed and items documented during this visit may help reduce long-term ownership costs by catching small issues before they become larger repairs.`;

  return {
    intro,
    urgentText,
    fixedText,
    followUpText,
    savingsText,
    savingsDetails,
    urgent,
    fixed,
    followUps,
  };
}

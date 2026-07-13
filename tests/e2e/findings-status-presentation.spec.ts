import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FINDING_STATUS_ORDER,
  findingStatusAccentClass,
  findingStatusBorderColor,
  findingStatusDotClass,
  findingStatusPresentation,
  findingStatusSelectedButtonClass,
} from '../../src/features/findings/statusPresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Findings condition/status presentation', () => {
  test('defines canonical presentation for the five existing finding values', () => {
    expect(FINDING_STATUS_ORDER).toEqual(['Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent']);

    expect(findingStatusPresentation('Pass')).toMatchObject({ label: 'Pass', tone: 'success', dotClass: 'bg-emerald-500' });
    expect(findingStatusPresentation('Monitor')).toMatchObject({ label: 'Monitor', tone: 'info', dotClass: 'bg-blue-500' });
    expect(findingStatusPresentation('Fixed On Site')).toMatchObject({ label: 'Fixed On Site', tone: 'violet', dotClass: 'bg-violet-500' });
    expect(findingStatusPresentation('Needs Repair')).toMatchObject({ label: 'Needs Repair', tone: 'warning', dotClass: 'bg-amber-500' });
    expect(findingStatusPresentation('Urgent')).toMatchObject({ label: 'Urgent', tone: 'danger', dotClass: 'bg-red-500' });

    expect(findingStatusAccentClass('Urgent')).toContain('bg-red-50');
    expect(findingStatusSelectedButtonClass('Needs Repair')).toContain('bg-amber-50');
    expect(findingStatusDotClass('Fixed On Site')).toBe('bg-violet-500');
    expect(findingStatusBorderColor('Urgent')).toBe('#dc2626');
  });

  test('falls back safely for unknown runtime finding values', () => {
    expect(findingStatusPresentation('Needs Review')).toMatchObject({ label: 'Needs Review', tone: 'neutral' });
    expect(findingStatusPresentation('deferred-item')).toMatchObject({ label: 'Deferred Item', tone: 'neutral' });
    expect(findingStatusPresentation('mixed_case')).toMatchObject({ label: 'Mixed Case', tone: 'neutral' });
    expect(findingStatusPresentation('')).toMatchObject({ label: 'Unknown', tone: 'neutral' });
    expect(findingStatusPresentation(null)).toMatchObject({ label: 'Unknown', tone: 'neutral' });
    expect(findingStatusPresentation(undefined)).toMatchObject({ label: 'Unknown', tone: 'neutral' });
  });

  test('migrates finding editor presentation while preserving interactive controls', () => {
    const source = sourceFile('src/App.tsx');
    const editor = sourceBetween(source, 'activeWorkRoom.items.map(item => {', '/* Right sidebar: Job Assistant */');

    expect(source).toContain("from './features/findings/statusPresentation';");
    expect(editor).toContain('FINDING_STATUS_ORDER.map(st => {');
    expect(editor).toContain('const statusPresentation = findingStatusPresentation(st);');
    expect(editor).toContain('findingStatusSelectedButtonClass(st)');
    expect(editor).toContain('findingStatusBorderColor(status)');
    expect(editor).toContain('type="button"');
    expect(editor).toContain('aria-label={`Mark ${item} as ${st}`}');
    expect(editor).toContain("data-testid={st === 'Needs Repair' ? 'inspection-finding-status-needs-repair' : undefined}");
    expect(editor).toContain("setLocalFindings(prev => ({ ...prev, [key]: { ...current, status: st } }))");
    expect(editor).not.toContain('FINDING_STATUS_CONFIG');
  });

  test('migrates finding cards, report summaries, and count chips without changing count formulas', () => {
    const source = sourceFile('src/App.tsx');
    const report = sourceBetween(source, "inspectionSubTab === 'report'", 'Right action sidebar');
    const roomSummary = sourceBetween(source, '<h3 className="font-semibold text-slate-800 text-sm mb-3">Room Summary</h3>', 'reportSentAndCompleted');

    expect(report).toContain('FINDING_STATUS_ORDER.map(s => [s, allReportFindings.filter(f => f.status === s).length])');
    expect(report).toContain("allReportFindings.filter(f => f.status === 'Urgent')");
    expect(report).toContain("allReportFindings.filter(f => f.status === 'Needs Repair')");
    expect(report).toContain("allReportFindings.filter(f => f.status === 'Fixed On Site')");
    expect(report).toContain("<StatusBadge label={`${statusCounts.Urgent} Urgent`} tone={findingStatusPresentation('Urgent').tone} size=\"md\" />");
    expect(report).toContain("<StatusBadge label=\"Urgent Items Included\" tone={findingStatusPresentation('Urgent').tone}");
    expect(report).toContain('<StatusBadge {...findingStatusPresentation(f.status)} className="flex-shrink-0" />');
    expect(report).toContain('style={{ borderLeftColor: findingStatusBorderColor(f.status) }}');

    expect(roomSummary).toContain("const rUrgent = r.findings.some(f => f.status === 'Urgent');");
    expect(roomSummary).toContain("const rIssues = r.findings.filter(f => f.status !== 'Pass' && f.status !== 'Fixed On Site').length;");
    expect(roomSummary).toContain("const rFixed = r.findings.filter(f => f.status === 'Fixed On Site').length;");
    expect(roomSummary).toContain("findingStatusPresentation(rUrgent ? 'Urgent' : 'Needs Repair').tone");
    expect(roomSummary).toContain("findingStatusPresentation('Fixed On Site').tone");
  });

  test('keeps finding business logic on raw persisted values', () => {
    const source = sourceFile('src/App.tsx');
    const helper = sourceFile('src/features/findings/statusPresentation.ts');

    expect(source).toContain("if (finding.status === 'Urgent') return 'Diagnostic';");
    expect(source).toContain("const taskComplete = row.finding.status === 'Fixed On Site';");
    expect(source).toContain("const taskComplete = item.status === 'Fixed On Site';");
    expect(source).toContain("finding.status !== 'Fixed On Site'");
    expect(source).toContain("finding.status === 'Fixed On Site'");
    expect(source).not.toContain("statusPresentation.label === 'Urgent'");
    expect(source).not.toContain("findingStatusPresentation(finding.status).label === 'Urgent'");

    expect(helper).not.toContain('buildRepairEstimateLineDraft');
    expect(helper).not.toContain('jobWorkItem');
    expect(helper).not.toContain('localDraftFromNote');
    expect(helper).not.toContain('supabase');
    expect(helper).not.toContain('.from(');
    expect(helper).not.toContain('.rpc(');
    expect(helper).not.toContain('Date(');
  });

  test('preserves finding-slice scope boundaries', () => {
    const appSource = sourceFile('src/App.tsx');
    const pdfSource = sourceFile('src/utils/pdfDocuments.ts');

    expect(appSource).not.toContain('const FINDING_STATUS_CONFIG');
    expect(appSource).toContain("from './features/reminders/statusPresentation';");
    expect(appSource).not.toContain("from './features/projects/statusPresentation'");
    expect(appSource).not.toContain('SeverityBadge');
    expect(appSource).not.toContain('resolved_at');

    expect(pdfSource).toContain('STATUS_PDF');
    expect(pdfSource).toContain('Fixed On Site');
    expect(pdfSource).toContain('Needs Repair');
    expect(pdfSource).toContain('Urgent');
  });
});

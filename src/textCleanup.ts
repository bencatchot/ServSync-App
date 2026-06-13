import type { FocusEvent } from 'react';

const HUMAN_TEXT_ACRONYMS = [
  'HVAC',
  'GFCI',
  'GFI',
  'PVC',
  'PEX',
  'PSI',
  'BTU',
  'AC',
  'DC',
  'AFCI',
  'LED',
  'GPM',
  'CFM',
  'CO',
  'CO2',
] as const;

const HUMAN_TEXT_RUN_ON_STARTERS = [
  'customer wants',
  'customer said',
  'homeowner wants',
  'homeowner said',
  'client wants',
  'client said',
  'recommend replacing',
  'recommend repair',
  'recommend',
  'needs replacement',
  'needs repair',
  'needs service',
  'needs follow up',
  'needs follow-up',
  'no issues',
] as const;

function restoreHumanTextTradeTerms(value: string) {
  return HUMAN_TEXT_ACRONYMS.reduce((text, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), term);
  }, value);
}

function normalizeHumanTextSpacing(value: string) {
  return restoreHumanTextTradeTerms(value)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=\S)/g, '$1 ')
    .replace(/\s+([”")\]])/g, '$1')
    .trim();
}

function splitSafeHumanTextRunOns(value: string) {
  return HUMAN_TEXT_RUN_ON_STARTERS.reduce((text, starter) => {
    const escaped = starter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return text.replace(new RegExp(`([^.!?])\\s+(${escaped}\\b)`, 'gi'), (_match, previous: string, next: string) => `${previous}. ${next}`);
  }, value);
}

function capitalizeHumanSentence(value: string) {
  return value.replace(/(^|[.!?]\s+)([a-z])/, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function punctuateHumanText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function cleanHumanTextLine(value: string) {
  const normalized = normalizeHumanTextSpacing(splitSafeHumanTextRunOns(value));
  if (!normalized) return '';
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map(part => punctuateHumanText(capitalizeHumanSentence(normalizeHumanTextSpacing(part))))
    .join(' ');
}

export function cleanHumanWrittenText(value: string) {
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return '';
  return trimmed
    .split('\n')
    .map(rawLine => {
      const line = rawLine.trim();
      if (!line) return '';
      const bulletMatch = line.match(/^([-*•]\s+|\d+[.)]\s+)(.*)$/);
      if (bulletMatch) {
        return `${bulletMatch[1]}${cleanHumanTextLine(bulletMatch[2])}`;
      }
      return cleanHumanTextLine(line);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function setNativeTextInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function cleanHumanTextInputOnBlur(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const element = event.currentTarget;
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (['email', 'password', 'tel', 'url', 'number', 'date', 'datetime-local', 'time', 'search'].includes(type)) return;
    if (element.dataset.proseCleanup !== 'true') return;
  }
  const cleaned = cleanHumanWrittenText(element.value);
  if (cleaned && cleaned !== element.value) {
    setNativeTextInputValue(element, cleaned);
  }
}

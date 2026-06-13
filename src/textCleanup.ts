import type { FocusEvent, KeyboardEvent } from 'react';

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

const HUMAN_TEXT_CONTRACTIONS: Record<string, string> = {
  isnt: "isn't",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  cant: "can't",
  wont: "won't",
  wouldnt: "wouldn't",
  couldnt: "couldn't",
  shouldnt: "shouldn't",
  im: "I'm",
  ive: "I've",
  ill: "I'll",
  id: "I'd",
  thats: "that's",
  theres: "there's",
  whats: "what's",
};

const EXCLUDED_HUMAN_TEXT_INPUT_TYPES = ['email', 'password', 'tel', 'url', 'number', 'date', 'datetime-local', 'time', 'search'];
const LOWERCASE_STANDALONE_LIVE_CONTRACTIONS = new Set([
  "isn't",
  "don't",
  "doesn't",
  "didn't",
  "can't",
  "won't",
  "wouldn't",
  "couldn't",
  "shouldn't",
  "that's",
  "there's",
  "what's",
]);

function containsUrlOrEmailLikeText(value: string) {
  return /\b(?:https?:\/\/|www\.)\S+/i.test(value) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value);
}

function restoreHumanTextTradeTerms(value: string) {
  const withAcronyms = HUMAN_TEXT_ACRONYMS.reduce((text, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), term);
  }, value);
  return withAcronyms.replace(/\b(\d+(?:\.\d+)?)(\s*)(v|a|psi|btu|cfm|gpm)\b/gi, (_match, amount: string, separator: string, unit: string) => {
    return `${amount}${separator}${unit.toUpperCase()}`;
  });
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
  if (containsUrlOrEmailLikeText(value)) {
    return value.replace(/[ \t]+/g, ' ').trim();
  }
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

function applyHumanTextLiveContractions(value: string) {
  const contractionPattern = Object.keys(HUMAN_TEXT_CONTRACTIONS).join('|');
  return value.replace(new RegExp(`(^|[^A-Za-z])(${contractionPattern})(?=\\s|[.!?,;:]|$)`, 'gi'), (_match, prefix: string, word: string) => {
    return `${prefix}${HUMAN_TEXT_CONTRACTIONS[word.toLowerCase()] ?? word}`;
  });
}

function capitalizeHumanTextLiveSentences(value: string) {
  const trimmed = value.trim();
  if (value.endsWith(' ') && LOWERCASE_STANDALONE_LIVE_CONTRACTIONS.has(trimmed)) {
    return value;
  }
  return value
    .replace(/(^\s*(?:[-*•]\s+|\d+[.)]\s+)?)([a-z])/, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
    .replace(/([.!?]\s+)([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function cleanHumanTextLiveLine(value: string) {
  if (containsUrlOrEmailLikeText(value)) {
    return value.replace(/[ \t]{2,}/g, ' ');
  }
  const spaced = value
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .replace(/([.!?])(?=[A-Za-z])/g, '$1 ');
  return capitalizeHumanTextLiveSentences(restoreHumanTextTradeTerms(applyHumanTextLiveContractions(spaced)));
}

export function cleanHumanWrittenTextLive(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => cleanHumanTextLiveLine(line))
    .join('\n');
}

function setNativeTextInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function shouldCleanHumanTextElement(element: HTMLInputElement | HTMLTextAreaElement) {
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    if (EXCLUDED_HUMAN_TEXT_INPUT_TYPES.includes(type)) return false;
    if (element.dataset.proseCleanup !== 'true') return false;
  }
  return true;
}

export function cleanHumanTextInputOnBlur(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const element = event.currentTarget;
  if (!shouldCleanHumanTextElement(element)) return;
  const cleaned = cleanHumanWrittenText(element.value);
  if (cleaned && cleaned !== element.value) {
    setNativeTextInputValue(element, cleaned);
  }
}

export function cleanHumanTextInputOnKeyUp(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const element = event.currentTarget;
  if (!shouldCleanHumanTextElement(element)) return;
  if (event.nativeEvent.isComposing) return;
  if (event.key.length > 1 && !['Backspace', 'Delete'].includes(event.key)) return;
  const selectionStart = element.selectionStart;
  const selectionEnd = element.selectionEnd;
  if (selectionStart === null || selectionEnd === null || selectionStart !== selectionEnd) return;
  const cleaned = cleanHumanWrittenTextLive(element.value);
  if (cleaned === element.value) return;
  const nextSelectionStart = cleanHumanWrittenTextLive(element.value.slice(0, selectionStart)).length;
  setNativeTextInputValue(element, cleaned);
  element.setSelectionRange(nextSelectionStart, nextSelectionStart);
}

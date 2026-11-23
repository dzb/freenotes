import type { ReactNode } from 'react';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface HighlightTextProps {
  text: string;
  terms: string[];
}

export function HighlightText({ text, terms }: HighlightTextProps): ReactNode {
  const usefulTerms = terms.filter(Boolean).sort((a, b) => b.length - a.length);
  if (usefulTerms.length === 0) return text;

  const pattern = usefulTerms.map(escapeRegExp).join('|');
  const splitter = new RegExp(`(${pattern})`, 'gi');
  const matcher = new RegExp(`^(?:${pattern})$`, 'i');
  const parts = text.split(splitter);

  return parts.map((part, index) =>
    part && matcher.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  );
}

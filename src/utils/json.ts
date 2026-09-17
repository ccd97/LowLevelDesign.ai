import { jsonrepair } from 'jsonrepair';

export function stripCodeFences(s: string, languages?: string[]): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (!trimmed.includes('```')) return trimmed;
  const langs = languages?.length ? `(?:${languages.join('|')})?` : '';
  if (trimmed.startsWith('```')) {
    const cleaned = trimmed.replace(new RegExp(`^\`\`\`${langs}\\s*`, 'i'), '');
    const last = cleaned.lastIndexOf('```');
    return (last !== -1 ? cleaned.substring(0, last) : cleaned).trim();
  }
  const m = s.match(new RegExp(`\`\`\`${langs}\\s*([\\s\\S]*?)\\s*\`\`\``, 'i'));
  if (m) return m[1].trim();
  return trimmed.replace(/```\s*$/i, '').trim();
}

export function cleanJsonString(raw: string): string {
  const fenced = stripCodeFences(raw.trim(), ['json']);
  const first = fenced.indexOf('{');
  const last = fenced.lastIndexOf('}');
  const sliced = first !== -1 && last > first ? fenced.substring(first, last + 1) : fenced;
  try {
    return jsonrepair(sliced);
  } catch {
    return sliced;
  }
}

export function tryParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(jsonrepair(text));
    } catch {
      return null;
    }
  }
}

export function extractJsonStringValue(raw: string, key: string): string | null {
  const parsed = tryParseJson(stripCodeFences(raw, ['json']) || raw);
  if (parsed && typeof parsed[key] === 'string') return parsed[key];
  const repaired = tryParseJson(cleanJsonString(raw));
  if (repaired && typeof repaired[key] === 'string') return repaired[key];
  return null;
}

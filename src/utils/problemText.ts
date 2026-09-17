import { cleanJsonString, extractJsonStringValue, stripCodeFences, tryParseJson } from './json';
export { addAiGeneratedNotice } from './codeAnalysis';

export function limitTitleWords(title: string, maxWords: number = 5): string {
  if (!title) return '';
  let clean = title.trim().replace(/^(?:design|implement|build)\s+(?:a|an|the)\s+/i, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clean;
  let truncated = words.slice(0, maxWords).join(' ').replace(/[,;:\-–—\./\\|]+$/, '').trim();
  truncated = truncated.replace(/\s+(?:with|and|for|in|of|to|or|a|an|the|by|at|on|from)$/i, '');
  return truncated.replace(/[,;:\-–—\./\\|]+$/, '').trim();
}

export function stripTagsFromTitle(title: string, maxWords: number = 5): string {
  if (!title) return '';
  let clean = title
    .replace(/\[\s*(?:easy|medium|hard|python|java|ambiguous|detailed|spec|lld)[^\]]*\]/gi, '')
    .replace(/\(\s*(?:easy|medium|hard|python|java|ambiguous|detailed|spec|lld)[^)]*\)/gi, '')
    .replace(/^\[.*?\]\s*/, '')
    .replace(/\s*\[.*?\]$/, '')
    .replace(/^\(.*?\)\s*/, '')
    .replace(/\s*\(.*?\)$/, '')
    .trim();
  clean = clean
    .replace(/^#+\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(?:title|problem)\s*:\s*/i, '')
    .replace(/^#+\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  return limitTitleWords(clean, maxWords);
}

export function stripLeadingTitle(statement: string, title?: string): string {
  if (!statement) return '';
  let clean = statement.trim().replace(/^#\s+[^\n]*\n*/i, '').trim();
  if (title) {
    const cleanTitle = title.trim().toLowerCase();
    const lines = clean.split('\n');
    const firstLine = lines[0].trim().replace(/^[\*#\s_\-]+|[\*#\s_\-]+$/g, '').toLowerCase();
    if (
      firstLine === cleanTitle ||
      firstLine === 'title' ||
      firstLine === 'overview' ||
      (cleanTitle.length >= 10 && firstLine.startsWith(cleanTitle)) ||
      (firstLine.length >= 10 && cleanTitle.startsWith(firstLine))
    ) {
      clean = lines.slice(1).join('\n').trim();
    }
  }
  return clean;
}

export function stripMetaInstructions(statement: string): string {
  if (!statement) return '';
  return statement
    .replace(/\ban\s+in-memory\s+object-oriented\s+/gi, 'an object-oriented ')
    .replace(/\ban\s+in-memory\s+/gi, 'a ')
    .replace(/\bin-memory\s+/gi, '');
}

export function sanitizeProblemStatement(raw: string, title?: string): { title?: string; statement: string } {
  if (!raw) return { statement: '' };
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && (trimmed.includes('"problemStatement"') || trimmed.includes('"statement"'))) {
    const parsed = tryParseJson(stripCodeFences(trimmed, ['json']) || trimmed) ?? tryParseJson(cleanJsonString(trimmed));
    if (parsed) {
      const extractedTitle = parsed.title ? stripTagsFromTitle(parsed.title) : title;
      const rawStmt = parsed.problemStatement || parsed.statement || parsed.description || trimmed;
      if (typeof rawStmt === 'string') {
        return {
          title: extractedTitle,
          statement: stripMetaInstructions(stripLeadingTitle(rawStmt, extractedTitle)),
        };
      }
    }
    const extractedTitle = extractJsonStringValue(trimmed, 'title') ?? title;
    const stmt = extractJsonStringValue(trimmed, 'problemStatement');
    if (stmt) {
      return {
        title: extractedTitle ? stripTagsFromTitle(extractedTitle) : title,
        statement: stripMetaInstructions(stripLeadingTitle(stmt, extractedTitle ?? undefined)),
      };
    }
  }
  return { statement: stripMetaInstructions(stripLeadingTitle(trimmed, title)) };
}

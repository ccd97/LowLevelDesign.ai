import { FileItem, Language } from '../types/session';

export function checkCodeCompleteness(
  files: FileItem[]
): { isPracticallyEmpty: boolean; meaningfulLines: number; reason?: string } {
  let meaningfulLines = 0;
  let nonTestFileCount = 0;

  for (const f of files) {
    if (f.isDirectory) continue;
    if (!f.path.toLowerCase().includes('test')) nonTestFileCount++;
    const isTestFile = f.path.toLowerCase().includes('test');
    const content = f.content.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('"""') ||
        trimmed.startsWith("'''") ||
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.startsWith('package ')
      ) {
        continue;
      }
      if (
        trimmed === 'pass' ||
        trimmed.includes('TODO') ||
        trimmed === '...' ||
        trimmed === 'return True' ||
        trimmed === 'return False' ||
        trimmed === 'return true;' ||
        trimmed === 'return false;' ||
        trimmed === 'return 0;' ||
        trimmed === 'return 0.0;' ||
        trimmed === 'return null;' ||
        trimmed === 'return None' ||
        trimmed === '{' ||
        trimmed === '}' ||
        trimmed === 'class Solution:' ||
        trimmed === 'public class Solution {' ||
        trimmed === 'public Solution() {' ||
        trimmed === 'def __init__(self):' ||
        trimmed === 'def execute(self):' ||
        trimmed === 'public boolean execute() {' ||
        trimmed === 'public static void main(String[] args) {' ||
        trimmed === 'if __name__ == "__main__":' ||
        trimmed === 'app = Solution()' ||
        trimmed === 'app.execute()' ||
        trimmed.startsWith('print("Hello') ||
        trimmed.startsWith('System.out.println("Running') ||
        trimmed.startsWith('System.out.println("Hello')
      ) {
        continue;
      }
      if (!isTestFile) meaningfulLines++;
    }
  }

  if (meaningfulLines < 5 || nonTestFileCount === 0) {
    return {
      isPracticallyEmpty: true,
      meaningfulLines,
      reason:
        meaningfulLines === 0
          ? 'No implementation code was written. The project only contains starter templates or test skeletons.'
          : 'Only minimal skeleton/placeholder code was detected with no real domain logic.',
    };
  }
  return { isPracticallyEmpty: false, meaningfulLines };
}

export function detectSnippetLanguage(code: string): 'python' | 'java' | 'unknown' {
  if (!code || code.trim().length < 10) return 'unknown';
  const text = code;
  let javaScore = 0;
  let pythonScore = 0;
  if (/^\s*import\s+java\./m.test(text)) javaScore += 3;
  if (/\bpublic\s+(class|interface|enum|static|void)\b/.test(text)) javaScore += 2;
  if (/\bprivate\s+(final\s+)?(String|int|long|double|boolean|void|Map|List)\b/.test(text)) javaScore += 2;
  if (/System\.out\.println|new\s+[A-Z]\w+\s*\(.*\)\s*;/.test(text)) javaScore += 2;
  if (/;\s*(\n|$)/.test(text) && /[{}]/.test(text)) javaScore += 1;
  if (/^\s*@(Override|Test)\b/m.test(text)) javaScore += 2;
  if (/^\s*(def\s+\w+\s*\(|from\s+\S+\s+import\s+|import\s+[a-z_][\w.]*\s*(\n|$))/m.test(text)) pythonScore += 3;
  if (/\bself\b/.test(text)) pythonScore += 2;
  if (/\b(None|True|False)\b/.test(text)) pythonScore += 1;
  if (/print\s*\(/.test(text) && !/System\.out/.test(text)) pythonScore += 1;
  if (/^\s*class\s+\w+(\s*\(.*\))?\s*:/m.test(text)) pythonScore += 2;
  if (/^\s*def\s+__init__\s*\(/m.test(text)) pythonScore += 2;
  if (javaScore === 0 && pythonScore === 0) return 'unknown';
  if (javaScore === pythonScore) return 'unknown';
  return javaScore > pythonScore ? 'java' : 'python';
}

export function ensureSnippetLanguage(
  snippet: string | undefined,
  expected: Language
): string | undefined {
  if (!snippet || !snippet.trim()) return undefined;
  const detected = detectSnippetLanguage(snippet);
  if (detected !== 'unknown' && detected !== expected) return undefined;
  return snippet;
}

export function extractJavaClassName(filePath: string, content: string): string {
  const packageMatch = content.match(/package\s+([a-zA-Z0-9_.]+);/);
  const packagePrefix = packageMatch ? `${packageMatch[1]}.` : '';
  const classMatch = content.match(/public\s+(?:class|enum|interface)\s+([a-zA-Z0-9_]+)/);
  if (classMatch) return `${packagePrefix}${classMatch[1]}`;
  return filePath.split('/').pop()?.replace(/\.java$/, '') || 'Solution';
}

export function addAiGeneratedNotice(content: string, language: Language): string {
  const line =
    language === 'python'
      ? '# NOTE: AI-generated code - may be wrong. Verify before use.'
      : '// NOTE: AI-generated code - may be wrong. Verify before use.';
  if (content.startsWith(line)) return content;
  return `${line}\n${content}`;
}

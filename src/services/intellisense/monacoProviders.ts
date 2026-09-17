import type { FileItem } from '../../types/session';
import { LRUCache } from 'lru-cache';
import pTimeout from 'p-timeout';

// Global toggle state
let isIntellisenseEnabled = true;

export function setStlIntellisenseEnabled(enabled: boolean) {
  isIntellisenseEnabled = enabled;
}

let enabledLibIds: string[] = [];

export function setStlEnabledLibs(ids: string[]) {
  enabledLibIds = Array.isArray(ids) ? [...ids] : [];
}

let currentProjectFiles: Array<{ path: string; content: string }> = [];

export function setProjectFiles(files: FileItem[]) {
  currentProjectFiles = (files || [])
    .filter((f) => !f.isDirectory)
    .map((f) => ({ path: f.path, content: f.content }));
  clientCompletionCache.clear();
}

// Client-side LRU memory cache for instant hits
const clientHoverCache = new LRUCache<string, any>({ max: 500 });
const clientCompletionCache = new LRUCache<string, any>({ max: 300 });
let isRegistered = false;

function mapKind(kindName: string, monaco: any) {
  switch (kindName) {
    case 'Function':
      return monaco.languages.CompletionItemKind.Function;
    case 'Class':
      return monaco.languages.CompletionItemKind.Class;
    case 'Module':
      return monaco.languages.CompletionItemKind.Module;
    case 'Variable':
      return monaco.languages.CompletionItemKind.Variable;
    case 'Field':
      return monaco.languages.CompletionItemKind.Field;
    case 'Property':
      return monaco.languages.CompletionItemKind.Property;
    case 'Keyword':
      return monaco.languages.CompletionItemKind.Keyword;
    case 'Method':
    default:
      return monaco.languages.CompletionItemKind.Method;
  }
}

function parseParamsFromSignature(sig: string): Array<{ label: string }> {
  const open = sig.indexOf('(');
  const close = sig.lastIndexOf(')');
  if (open === -1 || close === -1 || close <= open + 1) return [];
  const rawParams = sig.substring(open + 1, close);
  return rawParams
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && p !== '/' && p !== '*')
    .map((label) => ({ label }));
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return pTimeout(p, { milliseconds: ms, fallback: () => fallback });
}

function formatItemDocumentation(language: string, signature?: string, doc?: string, detail?: string) {
  const parts: string[] = [];
  const sig = signature || detail;
  if (sig && !doc?.includes(sig)) {
    parts.push(`\`\`\`${language}\n${sig}\n\`\`\``);
  }
  if (doc) {
    parts.push(doc);
  }
  const full = parts.join('\n\n').trim();
  return full ? { value: full } : undefined;
}

/**
 * Registers 100% dynamic IntelliSense providers (Autocomplete, Hover, Signature Help)
 * into Monaco editor, powered by the backend language engines.
 */
export function registerStlIntellisense(monaco: any) {
  if (!monaco || isRegistered) return;
  isRegistered = true;

  ['java', 'python'].forEach((lang) => {
    const language = lang as 'java' | 'python';

    // 1. Hover Provider
    monaco.languages.registerHoverProvider(language, {
      async provideHover(model: any, position: any, token: any) {
        if (!isIntellisenseEnabled) {
          return null;
        }

        const word = model.getWordAtPosition(position);
        if (!word) return null;
        if (token?.isCancellationRequested) return null;

        const lineContent = model.getLineContent(position.lineNumber);
        const textBeforeWord = lineContent.substring(0, word.startColumn - 1).trim();
        const dotMatch = textBeforeWord.match(/([a-zA-Z0-9_]+)\.$/);
        const context = dotMatch ? dotMatch[1] : '';

        const cacheKey = `${language}:${context}:${word.word}:${enabledLibIds.join(',')}`;
        if (clientHoverCache.has(cacheKey)) {
          return clientHoverCache.get(cacheKey);
        }

        try {
          const res: any = await withTimeout<any>(
            window.electronAPI.getIntellisenseHover({
              language,
              symbol: word.word,
              context,
              fileContent: model.getValue(),
              cursorLine: position.lineNumber,
              projectFiles: currentProjectFiles,
              enabledLibIds,
            }),
            1200,
            null
          );

          if (token?.isCancellationRequested) return null;

          if (res && (res.signature || res.doc)) {
            const sigBlock = res.signature ? `\`\`\`${language}\n${res.signature}\n\`\`\`\n\n` : '';
            const docText = res.doc && res.doc !== res.signature ? res.doc : '';
            const markdownValue = `${sigBlock}${docText}`.trim();

            const hover = {
              range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
              contents: [{ value: markdownValue }],
            };

            clientHoverCache.set(cacheKey, hover);
            return hover;
          }
        } catch (err) {
          console.error(`Error querying ${language} hover:`, err);
        }

        return null;
      },
    });

    // 2. Completion Item Provider
    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', '@'],
      async provideCompletionItems(model: any, position: any, ctx: any, token: any) {
        if (!isIntellisenseEnabled) {
          return { suggestions: [] };
        }

        const lineContent = model.getLineContent(position.lineNumber);
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        );

        const textBeforeWord = lineContent.substring(0, word.startColumn - 1);
        const dotMatch = textBeforeWord.match(/([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)\s*\.\s*$/);
        const quoteDotMatch = textBeforeWord.match(/(?:"[^"]*"|'[^']*')\s*\.\s*$/);

        let isDot = Boolean(dotMatch || quoteDotMatch);
        let context = dotMatch ? dotMatch[1] : (quoteDotMatch ? (language === 'python' ? 'str' : 'String') : '');

        const textUntilPos = lineContent.substring(0, position.column - 1);
        const atMatch = textUntilPos.match(/(?:^|[^\w])@\s*([a-zA-Z0-9_]*)$/);
        const isAnnotation = Boolean(atMatch);
        const annotationPrefix = atMatch ? atMatch[1] : '';

        let annotationRange: any = null;
        if (isAnnotation) {
          const atIndex = textUntilPos.lastIndexOf('@');
          const atColumn = atIndex + 1; // 1-indexed column of '@'
          annotationRange = new monaco.Range(
            position.lineNumber,
            atColumn,
            position.lineNumber,
            position.column
          );
        }

        // If not dot, not annotation, not typing a word, and preceded by space: skip unless manually invoked
        const isManualInvoke = ctx?.triggerKind === monaco.languages.CompletionTriggerKind?.Invoke;
        if (!isDot && !isAnnotation && !word.word && (textUntilPos.endsWith(' ') || textUntilPos.endsWith('\t')) && !isManualInvoke) {
          return { suggestions: [] };
        }

        const cacheKey = `${language}:${context}:${isDot ? '1' : '0'}:${isAnnotation ? '1' : '0'}:${word.word || ''}:${enabledLibIds.join(',')}`;
        if (clientCompletionCache.has(cacheKey)) {
          const cached = clientCompletionCache.get(cacheKey);
          return {
            suggestions: cached.map((it: any) => ({
              ...it,
              range: isAnnotation && annotationRange ? annotationRange : range,
            })),
            incomplete: true,
          };
        }

        if (token?.isCancellationRequested) return { suggestions: [] };

        try {
          const res = await withTimeout(
            window.electronAPI.getIntellisenseCompletions({
              language,
              fileContent: model.getValue(),
              cursorLine: position.lineNumber,
              cursorColumn: position.column,
              prefix: isAnnotation ? annotationPrefix : word.word,
              context,
              isDot,
              isAnnotation,
              projectFiles: currentProjectFiles,
              enabledLibIds,
            }),
            3500,
            { items: [] }
          );

          if (token?.isCancellationRequested) return { suggestions: [] };

          const suggestions = (res?.items || []).map((it: any) => {
            const hasDetailedDoc = Boolean(
              it.doc &&
              it.doc.length > 50 &&
              !it.doc.startsWith('From `') &&
              !it.doc.startsWith('Java Standard Library class in') &&
              !it.doc.startsWith('External library')
            );

            const label = isAnnotation
              ? (it.name.startsWith('@') ? it.name : `@${it.name}`)
              : it.name;
            const insertText = isAnnotation ? label : (it.insertText || it.name);
            const filterText = isAnnotation ? label : undefined;
            const itemRange = isAnnotation && annotationRange ? annotationRange : range;

            return {
              label,
              kind: isAnnotation ? monaco.languages.CompletionItemKind.Interface : mapKind(it.kind, monaco),
              detail: it.detail || it.name,
              documentation: formatItemDocumentation(language, it.signature, it.doc, it.detail),
              insertText,
              filterText,
              sortText: it.sortText || `0_${it.name}`,
              range: itemRange,
              _symbol: it.name,
              _context: context,
              _language: language,
              _signature: it.signature || it.detail,
              _hasDetailedDoc: hasDetailedDoc,
            };
          });

          if (suggestions.length > 0) {
            clientCompletionCache.set(cacheKey, suggestions);
          }

          return { suggestions, incomplete: true };
        } catch (err) {
          console.error(`Error querying ${language} completions:`, err);
          return { suggestions: [] };
        }
      },

      async resolveCompletionItem(item: any, token: any) {
        if (token?.isCancellationRequested) return item;
        if (item._hasDetailedDoc || item._resolved) return item;

        try {
          const api = window.electronAPI;
          if (!api?.getIntellisenseHover) return item;

          const rawSymbol = item._symbol || (typeof item.label === 'string' ? item.label : item.label?.label) || '';
          const cleanSymbol = rawSymbol.replace(/^@/, '');

          const hover: any = await withTimeout<any>(
            api.getIntellisenseHover({
              language: item._language,
              symbol: cleanSymbol,
              context: item._context || '',
              cursorLine: 1,
              projectFiles: currentProjectFiles,
              enabledLibIds,
            }),
            800,
            null
          );

          if (hover && (hover.doc || hover.signature)) {
            const sig = hover.signature || item._signature || item.detail;
            const sigBlock = sig ? `\`\`\`${item._language}\n${sig}\n\`\`\`\n\n` : '';
            const docText = hover.doc && hover.doc !== sig ? hover.doc : '';
            const full = `${sigBlock}${docText}`.trim();
            if (full) {
              item.documentation = { value: full };
            }
            if (hover.signature) {
              item.detail = hover.signature;
            }
            item._resolved = true;
          }
        } catch {}

        return item;
      },
    });

    // 3. Signature Help Provider
    monaco.languages.registerSignatureHelpProvider(language, {
      signatureHelpTriggerCharacters: ['(', ','],
      async provideSignatureHelp(model: any, position: any, token: any) {
        if (!isIntellisenseEnabled) {
          return null;
        }
        if (token?.isCancellationRequested) return null;

        const lineContent = model.getLineContent(position.lineNumber);
        const textBefore = lineContent.substring(0, position.column - 1);

        const openParenIndex = textBefore.lastIndexOf('(');
        if (openParenIndex === -1) return null;

        const callText = textBefore.substring(0, openParenIndex);
        const match = callText.match(/([a-zA-Z0-9_]+)$/);
        if (!match) return null;

        const funcName = match[1];
        const preCallText = callText.substring(0, callText.length - funcName.length).trim();
        const dotMatch = preCallText.match(/([a-zA-Z0-9_]+)\.$/);
        const context = dotMatch ? dotMatch[1] : '';

        try {
          const api = window.electronAPI;
          let res: any = null;

          if (api.getIntellisenseSignatureHelp) {
            res = await withTimeout<any>(
              api.getIntellisenseSignatureHelp({
                language,
                funcName,
                context,
                fileContent: model.getValue(),
                projectFiles: currentProjectFiles,
                enabledLibIds,
              }),
              1000,
              null
            );
          }

          if (!res) {
            res = await withTimeout<any>(
              api.getIntellisenseHover({
                language,
                symbol: funcName,
                context,
                fileContent: model.getValue(),
                cursorLine: position.lineNumber,
                projectFiles: currentProjectFiles,
                enabledLibIds,
              }),
              1000,
              null
            );
          }

          if (token?.isCancellationRequested || !res || !res.signature) return null;

          const params = res.parameters || parseParamsFromSignature(res.signature);
          const argsText = textBefore.substring(openParenIndex + 1);
          const commaCount = (argsText.match(/,/g) || []).length;

          return {
            value: {
              signatures: [
                {
                  label: res.signature,
                  documentation: res.doc,
                  parameters: params.map((p: any) => ({
                    label: p.label,
                    documentation: p.doc,
                  })),
                },
              ],
              activeSignature: 0,
              activeParameter: Math.min(commaCount, Math.max(0, params.length - 1)),
            },
            dispose: () => {},
          };
        } catch {
          return null;
        }
      },
    });
  });
}

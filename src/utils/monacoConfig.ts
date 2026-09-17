import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Local Vite worker bundles (no CDN in Electron)
(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });

export const LLD_DARK_THEME = 'lld-dark';
export const LLD_LIGHT_THEME = 'lld-light';

export function defineLldThemes(monacoInstance: any) {
  if (!monacoInstance?.editor?.defineTheme) return;
  monacoInstance.editor.defineTheme(LLD_DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#141417',
      'editorGutter.background': '#141417',
      'editor.lineHighlightBackground': '#18181c',
      'editor.lineHighlightBorder': '#00000000',
      'editorLineNumber.foreground': '#52525b',
      'editorLineNumber.activeForeground': '#a1a1aa',
      'editorCursor.foreground': '#60a5fa',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#264f7855',
      'editorIndentGuide.background1': '#27272a',
      'editorIndentGuide.activeBackground1': '#3f3f46',
      'editorWidget.background': '#18181b',
      'editorWidget.border': '#27272a',
      'editorSuggestWidget.background': '#18181b',
      'editorSuggestWidget.border': '#27272a',
      'editorSuggestWidget.selectedBackground': '#27272a',
      'editorHoverWidget.background': '#18181b',
      'editorHoverWidget.border': '#27272a',
      'editorBracketMatch.background': '#3b82f633',
      'editorBracketMatch.border': '#3b82f680',
      'editorRuler.foreground': '#27272a',
      'scrollbarSlider.background': '#3f3f4666',
      'scrollbarSlider.hoverBackground': '#52525b88',
      'scrollbarSlider.activeBackground': '#52525baa',
    },
  });
  monacoInstance.editor.defineTheme(LLD_LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#ffffff',
      'editor.lineHighlightBackground': '#f1f5f9',
    },
  });
}

// Eagerly register on the bundled monaco instance used via loader.config.
defineLldThemes(monaco);

export { monaco };

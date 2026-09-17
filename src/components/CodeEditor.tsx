import React, { useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { LLD_DARK_THEME, LLD_LIGHT_THEME, defineLldThemes } from '../utils/monacoConfig';
import { X, FileCode, Sparkles } from 'lucide-react';
import { FileItem } from '../types/session';
import { getFileLanguage } from '../utils/fileTree';
import {
  registerStlIntellisense,
  setStlIntellisenseEnabled,
  setStlEnabledLibs,
  setProjectFiles,
} from '../services/intellisense/monacoProviders';
import { attachMonacoFastScroll } from '../utils/monacoFastScroll';

interface CodeEditorProps {
  files: FileItem[];
  openFilePaths: string[];
  activeFilePath?: string;
  onSelectFile: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCodeChange: (path: string, newContent: string) => void;
  fontSize?: number;
  onGenerateTests?: () => void;
  isGeneratingTests?: boolean;
  theme?: 'dark' | 'light';
  enableStlIntellisense?: boolean;
  enabledLibIds?: string[];
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  files,
  openFilePaths,
  activeFilePath,
  onSelectFile,
  onCloseTab,
  onCodeChange,
  fontSize = 14,
  onGenerateTests,
  isGeneratingTests,
  theme = 'dark',
  enableStlIntellisense = true,
  enabledLibIds = [],
}) => {
  const fastScrollCleanupRef = React.useRef<(() => void) | null>(null);

  useEffect(() => {
    setStlIntellisenseEnabled(Boolean(enableStlIntellisense));
  }, [enableStlIntellisense]);

  useEffect(() => {
    setStlEnabledLibs(enabledLibIds || []);
  }, [enabledLibIds]);

  useEffect(() => {
    setProjectFiles(files || []);
  }, [files]);

  useEffect(() => {
    return () => {
      if (fastScrollCleanupRef.current) {
        fastScrollCleanupRef.current();
        fastScrollCleanupRef.current = null;
      }
    };
  }, []);

  const activeFile = files.find((f) => f.path === activeFilePath && !f.isDirectory);
  const language = activeFilePath ? getFileLanguage(activeFilePath) : 'plaintext';
  // Defensive: never render directory paths as tabs (legacy openFilePaths may contain them).
  const fileByPath = new Map(files.map((f) => [f.path, f]));
  const visibleOpenPaths = openFilePaths.filter((p) => {
    const f = fileByPath.get(p);
    return f && !f.isDirectory;
  });

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#141417] overflow-hidden select-none">
      {/* Tab Bar */}
      <div className="h-9 shrink-0 flex items-stretch bg-[#f5f7fa] dark:bg-[#18181c] border-b border-slate-200/80 dark:border-white/[0.06]">
        <div className="flex items-stretch overflow-x-auto no-scrollbar flex-1 min-w-0">
        {visibleOpenPaths.map((filePath) => {
          const fileName = filePath.split('/').pop() || filePath;
          const isActive = activeFilePath === filePath;
          const isTestFile = fileName.toLowerCase().includes('test');

          return (
            <div
              key={filePath}
              onClick={() => onSelectFile(filePath)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseTab(filePath);
                }
              }}
              className={`group flex items-center gap-1.5 px-3 py-2 text-xs border-r border-slate-200/80 dark:border-white/[0.06] cursor-pointer transition-colors ${
                isActive
                  ? 'bg-white dark:bg-[#141417] text-slate-900 dark:text-white border-t-2 border-t-blue-500 font-medium'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-200/40 dark:hover:bg-white/[0.03]'
              }`}
            >
              <FileCode
                className={`w-3.5 h-3.5 shrink-0 ${
                  isTestFile
                    ? 'text-purple-600 dark:text-purple-400'
                    : fileName.endsWith('.py')
                    ? 'text-amber-600 dark:text-yellow-400'
                    : fileName.endsWith('.java')
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-slate-500 dark:text-zinc-400'
                }`}
              />
              <span className="truncate max-w-[140px]">{fileName}</span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(filePath);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white rounded transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {visibleOpenPaths.length === 0 && (
          <div className="px-4 py-2 text-xs text-slate-400 dark:text-zinc-500 italic">No files open</div>
        )}
        </div>

        {/* Pinned editor action: AI test generation */}
        {onGenerateTests && (
          <div className="flex items-center px-2 border-l border-slate-200/80 dark:border-white/[0.06] shrink-0">
            <button
              onClick={onGenerateTests}
              disabled={isGeneratingTests}
              title="Generate unit tests for your code with AI"
              className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-300 hover:bg-slate-200/50 dark:hover:bg-white/[0.04] rounded text-[11px] font-normal transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {isGeneratingTests ? (
                <div className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-500 dark:border-white/30 dark:border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              <span>{isGeneratingTests ? 'Generating...' : 'Generate Tests'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Editor Surface */}
      <div className="flex-1 overflow-hidden relative">
        {activeFile ? (
          <Editor
            height="100%"
            theme={theme === 'light' ? LLD_LIGHT_THEME : LLD_DARK_THEME}
            language={language}
            value={activeFile.content}
            onChange={(val) => onCodeChange(activeFile.path, val || '')}
            loading={
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500 text-xs space-y-2">
                <div className="w-5 h-5 border-2 border-slate-300 dark:border-zinc-600 border-t-blue-500 rounded-full animate-spin" />
                <span>Loading editor...</span>
              </div>
            }
            beforeMount={(monaco) => {
              defineLldThemes(monaco);
              registerStlIntellisense(monaco);
            }}
            onMount={(editor, monaco) => {
              (window as any).monaco = monaco;
              (window as any).monacoEditor = editor;
              defineLldThemes(monaco);
              registerStlIntellisense(monaco);
              if (fastScrollCleanupRef.current) {
                fastScrollCleanupRef.current();
              }
              fastScrollCleanupRef.current = attachMonacoFastScroll(editor);
            }}
            options={{
              fontSize,
              fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
              minimap: { enabled: false },
              scrollBeyondLastLine: true,
              fixedOverflowWidgets: true,
              automaticLayout: true,
              tabSize: 4,
              insertSpaces: true,
              lineNumbers: 'on',
              folding: true,
              suggestOnTriggerCharacters: true,
              wordBasedSuggestions: 'off',
              quickSuggestions: { other: true, comments: false, strings: false },
              quickSuggestionsDelay: 10,
              parameterHints: { enabled: true, cycle: false },
              hover: { enabled: true, delay: 600, sticky: false },
              suggest: {
                showMethods: true,
                showFunctions: true,
                showClasses: true,
                showModules: true,
                showVariables: true,
                showWords: false,
                preview: true,
                showStatusBar: true,
                showInlineDetails: true,
                filterGraceful: true,
                localityBonus: true,
                shareSuggestSelections: true,
              },
              wordWrap: 'on',
              formatOnType: false,
              formatOnPaste: false,
              smoothScrolling: false,
              cursorBlinking: 'blink',
              selectionClipboard: false,
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500 text-xs space-y-2">
            <FileCode className="w-8 h-8 text-slate-300 dark:text-zinc-600" />
            <span>Select a file from the explorer on the left to start editing</span>
          </div>
        )}
      </div>
    </div>
  );
};

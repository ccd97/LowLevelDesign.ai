export type IntellisenseLanguage = 'python' | 'java';

export interface ProjectFile {
  path: string;
  content: string;
}

export interface IntellisenseCompletionQuery {
  language: IntellisenseLanguage;
  fileContent: string;
  filePath?: string;
  cursorLine: number;
  cursorColumn: number;
  prefix?: string;
  context?: string;
  isDot?: boolean;
  isAnnotation?: boolean;
  projectFiles?: ProjectFile[];
  enabledLibIds?: string[];
}

export interface IntellisenseCompletionItem {
  name: string;
  kind: 'Method' | 'Function' | 'Class' | 'Module' | 'Property' | 'Variable' | 'Field' | 'Keyword';
  detail?: string;
  doc?: string;
  signature?: string;
  insertText?: string;
  sortText?: string;
}

export interface IntellisenseCompletionResult {
  items: IntellisenseCompletionItem[];
}

export interface IntellisenseHoverQuery {
  language: IntellisenseLanguage;
  symbol: string;
  context?: string;
  fileContent?: string;
  filePath?: string;
  cursorLine?: number;
  projectFiles?: ProjectFile[];
  enabledLibIds?: string[];
}

export interface IntellisenseHoverResult {
  signature: string;
  doc: string;
  detail?: string;
  moduleOrClass?: string;
}

export interface IntellisenseSignatureHelpQuery {
  language: IntellisenseLanguage;
  funcName: string;
  context?: string;
  fileContent?: string;
  filePath?: string;
  projectFiles?: ProjectFile[];
  enabledLibIds?: string[];
}

export interface IntellisenseSignatureHelpResult {
  signature: string;
  doc?: string;
  parameters: Array<{ label: string; doc?: string }>;
}

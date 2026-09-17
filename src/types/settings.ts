export interface Settings {
  openRouterApiKey: string;
  openRouterModel: string;
  autoSave: boolean;
  fontSize: number;
  theme: 'dark' | 'light';
  enableStlIntellisense: boolean;
  pythonPath?: string;
  javaPath?: string;
  terminalShellPath?: string;
  externalLibraries?: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  openRouterApiKey: '',
  openRouterModel: 'nex-agi/nex-n2.5-mini:free',
  autoSave: true,
  fontSize: 14,
  theme: 'dark',
  enableStlIntellisense: true,
  pythonPath: '',
  javaPath: '',
  terminalShellPath: '',
  externalLibraries: {},
};

import type { Language } from '../types/session';

export interface ExternalLibraryDef {
  id: string;
  language: 'java' | 'python';
  kind: 'java-jar' | 'python-pip';
  name: string;
  description: string;
  defaultEnabled: boolean;
}

export const EXTERNAL_LIBRARIES: ExternalLibraryDef[] = [
  {
    id: 'lombok',
    language: 'java',
    kind: 'java-jar',
    name: 'Lombok',
    description: 'Annotations like @Data, @Builder, @Value to cut boilerplate.',
    defaultEnabled: false,
  },
  {
    id: 'gson',
    language: 'java',
    kind: 'java-jar',
    name: 'Gson',
    description: 'Google JSON serialization library.',
    defaultEnabled: false,
  },
  {
    id: 'pandas',
    language: 'python',
    kind: 'python-pip',
    name: 'pandas',
    description: 'DataFrame / data-analysis library (auto pip-installed).',
    defaultEnabled: false,
  },
  {
    id: 'requests',
    language: 'python',
    kind: 'python-pip',
    name: 'requests',
    description: 'HTTP client library (auto pip-installed).',
    defaultEnabled: false,
  },
];

export function isLibEnabled(
  id: string,
  settingsLibs?: Record<string, boolean>,
  sessionLibs?: Record<string, boolean>
): boolean {
  if (sessionLibs && id in sessionLibs) return Boolean(sessionLibs[id]);
  if (settingsLibs && id in settingsLibs) return Boolean(settingsLibs[id]);
  return EXTERNAL_LIBRARIES.find((l) => l.id === id)?.defaultEnabled ?? false;
}

export function getEnabledLibraryIds(
  language: Language,
  settingsLibs?: Record<string, boolean>,
  sessionLibs?: Record<string, boolean>
): string[] {
  return EXTERNAL_LIBRARIES.filter(
    (l) => l.language === language && isLibEnabled(l.id, settingsLibs, sessionLibs)
  ).map((l) => l.id);
}

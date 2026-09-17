import fs from 'fs';
import path from 'path';
import { getAppDataDir } from './pathResolver';

export interface SettingsData {
  openRouterApiKey: string;
  openRouterModel: string;
  autoSave: boolean;
  fontSize: number;
  theme?: 'dark' | 'light';
  enableStlIntellisense?: boolean;
  pythonPath?: string;
  javaPath?: string;
  terminalShellPath?: string;
  externalLibraries?: Record<string, boolean>;
}

export type TimeBudget = 45 | 60 | 90 | 120;

export interface SessionSummary {
  id: string;
  title: string;
  language: 'python' | 'java';
  problemMode: 'ambiguous' | 'detailed';
  timeBudget: TimeBudget;
  requireConcurrency?: boolean;
  externalLibraries?: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
  timeSpentSeconds: number;
  overallScore?: number;
}

export interface ProjectFile {
  path: string;
  content: string;
  isDirectory?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface SessionData {
  id: string;
  title: string;
  language: 'python' | 'java';
  problemMode: 'ambiguous' | 'detailed';
  timeBudget: TimeBudget;
  requireConcurrency?: boolean;
  externalLibraries?: Record<string, boolean>;
  problemStatement: string;
  requirementsSummary?: string;
  files: ProjectFile[];
  activeFilePath?: string;
  clarificationMessages: ChatMessage[];
  timeSpentSeconds: number;
  isTimerRunning: boolean;
  lastTestOutput?: string;
  lastTestStatus?: 'passed' | 'failed' | 'error' | 'timeout' | null;
  evaluationReport?: any;
  createdAt: number;
  updatedAt: number;
}

/**
 * Migrates pre-time-budget sessions (which stored `difficulty: Easy|Medium|Hard`)
 * to the closest time budget. New sessions always store `timeBudget`.
 */
function migrateTimeBudget(value: unknown): TimeBudget {
  if (value === 45 || value === 60 || value === 90 || value === 120) return value;
  if (value === 'Easy') return 45;
  if (value === 'Medium') return 60;
  if (value === 'Hard') return 120;
  return 60;
}

class StorageManager {
  private baseDir: string;
  private sessionsDir: string;
  private settingsFile: string;
  private sessionsIndexFile: string;

  constructor() {
    this.baseDir = getAppDataDir();
    this.sessionsDir = path.join(this.baseDir, 'sessions');
    this.settingsFile = path.join(this.baseDir, 'settings.json');
    this.sessionsIndexFile = path.join(this.baseDir, 'sessions_index.json');
    this.ensureDirs();
  }

  private ensureDirs() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  public getSettings(): SettingsData {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (!parsed.externalLibraries) parsed.externalLibraries = {};
        return parsed;
      }
    } catch (err) {
      console.error('Error reading settings:', err);
    }
    return {
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
  }

  public saveSettings(settings: SettingsData): boolean {
    try {
      this.ensureDirs();
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('Error saving settings:', err);
      return false;
    }
  }

  public getSessionsList(): SessionSummary[] {
    try {
      if (fs.existsSync(this.sessionsIndexFile)) {
        const raw = fs.readFileSync(this.sessionsIndexFile, 'utf-8');
        const list: SessionSummary[] = JSON.parse(raw);
        return list
          .map((s: any) => ({ ...s, timeBudget: migrateTimeBudget(s.timeBudget ?? s.difficulty) }))
          .sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch (err) {
      console.error('Error reading sessions index:', err);
    }
    return [];
  }

  public getSession(id: string): SessionData | null {
    try {
      const file = path.join(this.sessionsDir, `${id}.json`);
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf-8');
        const session = JSON.parse(raw);
        session.timeBudget = migrateTimeBudget(session.timeBudget ?? session.difficulty);
        return session;
      }
    } catch (err) {
      console.error(`Error reading session ${id}:`, err);
    }
    return null;
  }

  public saveSession(session: SessionData): boolean {
    try {
      this.ensureDirs();
      session.updatedAt = Date.now();
      const file = path.join(this.sessionsDir, `${session.id}.json`);
      fs.writeFileSync(file, JSON.stringify(session, null, 2), 'utf-8');

      const list = this.getSessionsList();
      const existingIdx = list.findIndex((s) => s.id === session.id);
      const summary: SessionSummary = {
        id: session.id,
        title: session.title,
        language: session.language,
        problemMode: session.problemMode,
        timeBudget: migrateTimeBudget((session as any).timeBudget ?? (session as any).difficulty),
        requireConcurrency: (session as any).requireConcurrency,
        externalLibraries: (session as any).externalLibraries,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        timeSpentSeconds: session.timeSpentSeconds,
        overallScore: session.evaluationReport?.overallScore,
      };

      if (existingIdx >= 0) {
        list[existingIdx] = summary;
      } else {
        list.unshift(summary);
      }

      fs.writeFileSync(this.sessionsIndexFile, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`Error saving session ${session.id}:`, err);
      return false;
    }
  }

  public deleteSession(id: string): boolean {
    try {
      const file = path.join(this.sessionsDir, `${id}.json`);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      let list = this.getSessionsList();
      list = list.filter((s) => s.id !== id);
      fs.writeFileSync(this.sessionsIndexFile, JSON.stringify(list, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error(`Error deleting session ${id}:`, err);
      return false;
    }
  }
}

export const storage = new StorageManager();
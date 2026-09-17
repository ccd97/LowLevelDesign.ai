import { EvaluationReport } from './evaluation';

export type ProblemMode = 'ambiguous' | 'detailed';
export type Language = 'python' | 'java';

/** Target solve time in minutes. Generation scope scales with it. */
export type TimeBudget = 45 | 60 | 90 | 120;

export const TIME_BUDGETS: TimeBudget[] = [45, 60, 90, 120];

export interface FileItem {
  path: string; // e.g. "models/Vehicle.py" or "src/services/ParkingLot.java"
  content: string;
  isDirectory?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // Optional LLM-suggested addition to the problem statement.
  // Only present on assistant messages where the LLM decided the
  // clarification is worth folding into the problem.
  suggestedProblemUpdate?: string;
  problemUpdateApplied?: boolean;
}

export interface SessionSummary {
  id: string;
  title: string;
  language: Language;
  problemMode: ProblemMode;
  timeBudget: TimeBudget;
  /** Whether the candidate must handle concurrent access (thread-safety). Default false. */
  requireConcurrency?: boolean;
  externalLibraries?: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
  timeSpentSeconds: number;
  overallScore?: number;
}

export interface SessionData {
  id: string;
  title: string;
  language: Language;
  problemMode: ProblemMode;
  timeBudget: TimeBudget;
  /** Whether the candidate must handle concurrent access (thread-safety). Default false. */
  requireConcurrency?: boolean;
  externalLibraries?: Record<string, boolean>;
  problemStatement: string;
  clarificationMessages: ChatMessage[];
  files: FileItem[];
  activeFilePath?: string;
  timeSpentSeconds: number;
  isTimerRunning: boolean;
  lastTestOutput?: string;
  lastTestStatus?: 'passed' | 'failed' | 'error' | 'timeout' | null;
  evaluationReport?: EvaluationReport;
  createdAt: number;
  updatedAt: number;
}

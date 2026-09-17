export interface CriteriaScore {
  score: number; // 0 - 20
  feedback: string;
  keyTakeaway?: string;
}

export interface StrengthItem {
  area: string;
  description: string;
  codeSnippet?: string;
}

export interface ImprovementItem {
  area: string;
  category?:
    | 'Problem Analysis'
    | 'Class Design'
    | 'Code Quality'
    | 'Extensibility & Maintainability'
    | 'Concurrency & Edge Cases'
    | 'Testing & Correctness'
    | string;
  suggestion: string;
  whyItMatters?: string;
  codeSnippet?: string;
  diagram?: string;
  diagramType?: 'mermaid' | 'text';
}

export interface EvaluationCriteria {
  // Core LLD Interview Pillars
  problemAnalysis?: CriteriaScore;
  classDesign?: CriteriaScore;
  codeQuality?: CriteriaScore;
  extensibility?: CriteriaScore;
  concurrencyAndEdgeCases?: CriteriaScore;
  testingAndCorrectness?: CriteriaScore;

  // Legacy mappings for backward compatibility
  solidAndCleanCode?: CriteriaScore;
  designPatterns?: CriteriaScore;
  classModeling?: CriteriaScore;
}

export interface EvaluationReport {
  overallScore: number; // 0 - 100
  seniorityLevel: 'Junior SDE' | 'Mid-level SDE' | 'Senior SDE' | 'Staff / Principal Engineer';
  summary: string;
  criteria: EvaluationCriteria;
  strengths: Array<string | StrengthItem>;
  improvements: ImprovementItem[];
  evaluatedAt: number;
}

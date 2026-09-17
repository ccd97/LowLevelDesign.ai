import { FileItem, Language, ProblemMode } from '../types/session';
import { EvaluationReport, ImprovementItem } from '../types/evaluation';
import { getGenericStarterFiles, getBlankStarterFiles } from '../services/templates';
import { z } from 'zod';
import { cleanJsonString, extractJsonStringValue, stripCodeFences, tryParseJson } from './json';
import {
  addAiGeneratedNotice,
  sanitizeProblemStatement,
  stripLeadingTitle,
  stripTagsFromTitle,
} from './problemText';
import { ensureSnippetLanguage } from './codeAnalysis';

const problemFileSchema = z.object({ path: z.string(), content: z.string().optional() });
const problemSchema = z.object({
  title: z.string().optional(),
  problemStatement: z.string().optional(),
  statement: z.string().optional(),
  description: z.string().optional(),
  files: z.array(problemFileSchema).optional(),
});

function mapProblemParsed(parsed: any, language: Language, customPrompt: string | undefined, mode: ProblemMode | undefined) {
  const sanitized = sanitizeProblemStatement(parsed.problemStatement || parsed.statement || '');
  const rawTitle = parsed.title || sanitized.title || customPrompt || 'LLD Problem';
  const cleanTitle = stripTagsFromTitle(rawTitle);
  const llmFiles = Array.isArray(parsed.files) ? parsed.files : [];
  return {
    title: cleanTitle,
    problemStatement: sanitized.statement || parsed.description || 'No description provided.',
    files:
      mode === 'ambiguous'
        ? getBlankStarterFiles(language)
        : llmFiles.length > 0
          ? llmFiles.map((f: any) => ({ path: f.path, content: addAiGeneratedNotice(f.content ?? '', language) }))
          : getGenericStarterFiles(language, cleanTitle),
  };
}

export function safeParseProblemJson(
  raw: string,
  language: Language,
  customPrompt?: string,
  mode?: ProblemMode
): { title: string; problemStatement: string; files: FileItem[] } {
  for (const text of [stripCodeFences(raw, ['json']) || raw, cleanJsonString(raw)]) {
    const parsed = tryParseJson(text);
    const checked = parsed ? problemSchema.safeParse(parsed) : null;
    if (checked?.success && (checked.data.problemStatement || checked.data.statement || checked.data.title)) {
      return mapProblemParsed(checked.data, language, customPrompt, mode);
    }
    if (parsed && (parsed.problemStatement || parsed.title)) {
      return mapProblemParsed(parsed, language, customPrompt, mode);
    }
  }

  const extractedTitle = extractJsonStringValue(raw, 'title');
  const extractedStmt = extractJsonStringValue(raw, 'problemStatement');
  const title = stripTagsFromTitle(extractedTitle || customPrompt || 'Low-Level Design Problem');
  let statement = extractedStmt || stripCodeFences(raw, ['json']);
  if (statement.startsWith('{')) statement = '';

  if (!statement.trim() || (statement.trim().startsWith('{') && statement.includes('"problemStatement"'))) {
    throw new Error('The model returned malformed data (unparseable JSON). Please re-generate the question.');
  }

  return {
    title,
    problemStatement: stripLeadingTitle(statement.trim(), title),
    files: mode === 'ambiguous' ? getBlankStarterFiles(language) : getGenericStarterFiles(language, title),
  };
}

const clarifySchema = z.object({
  reply: z.string().optional(),
  answer: z.string().optional(),
  response: z.string().optional(),
  content: z.string().optional(),
});

export function safeParseClarifyJson(raw: string): { reply: string } {
  for (const text of [stripCodeFences(raw, ['json']) || raw, cleanJsonString(raw)]) {
    const parsed = tryParseJson(text);
    if (!parsed) continue;
    const checked = clarifySchema.safeParse(parsed);
    if (checked.success) {
      const reply = checked.data.reply ?? checked.data.answer ?? checked.data.response ?? checked.data.content;
      if (reply?.trim()) return { reply: reply.trim() };
    }
  }
  const plain = stripCodeFences(raw, ['json']).trim();
  return { reply: plain || raw.trim() };
}

export function safeParseEvaluationJson(raw: string, expectedLanguage?: Language): EvaluationReport {
  const buildReport = (parsed: any): EvaluationReport => {
    const overallScore = Math.max(0, Math.min(100, Number(parsed.overallScore) || 0));
    let seniorityLevel: EvaluationReport['seniorityLevel'] = 'Junior SDE';
    if (overallScore >= 88) seniorityLevel = 'Staff / Principal Engineer';
    else if (overallScore >= 72) seniorityLevel = 'Senior SDE';
    else if (overallScore >= 50) seniorityLevel = 'Mid-level SDE';

    const cleanText = (txt: any): string => {
      if (!txt) return '';
      return typeof txt !== 'string' ? JSON.stringify(txt) : txt;
    };
    const cleanDiagram = (diag: any): string | undefined => {
      if (!diag || typeof diag !== 'string') return undefined;
      const text = stripCodeFences(diag.trim(), ['mermaid']).trim();
      return text.length > 5 ? text : undefined;
    };

    const crit = parsed.criteria || {};
    const defaultScore = Math.round(overallScore / 5);
    const problemAnalysis = {
      score: Number(crit.problemAnalysis?.score ?? crit.classModeling?.score) || defaultScore,
      feedback: cleanText(crit.problemAnalysis?.feedback || crit.classModeling?.feedback || 'Evaluated problem framing and entity decomposition.'),
    };
    const classDesign = {
      score: Number(crit.classDesign?.score ?? crit.designPatterns?.score) || defaultScore,
      feedback: cleanText(crit.classDesign?.feedback || crit.designPatterns?.feedback || 'Evaluated class modeling, boundaries, and design patterns.'),
    };
    const codeQuality = {
      score: Number(crit.codeQuality?.score ?? crit.solidAndCleanCode?.score) || defaultScore,
      feedback: cleanText(crit.codeQuality?.feedback || crit.solidAndCleanCode?.feedback || 'Evaluated SOLID principles, encapsulation, and code hygiene.'),
    };
    const extensibility = {
      score: Number(crit.extensibility?.score ?? crit.designPatterns?.score) || defaultScore,
      feedback: cleanText(crit.extensibility?.feedback || crit.designPatterns?.feedback || 'Evaluated maintainability and adaptability to follow-up changes.'),
    };
    const concurrencyAndEdgeCases = {
      score: Number(crit.concurrencyAndEdgeCases?.score) || defaultScore,
      feedback: cleanText(crit.concurrencyAndEdgeCases?.feedback || 'Evaluated validations, boundary handling, and thread safety.'),
    };
    const testingAndCorrectness = {
      score: Number(crit.testingAndCorrectness?.score) || defaultScore,
      feedback: cleanText(crit.testingAndCorrectness?.feedback || 'Reviewed test execution and test coverage.'),
    };

    const strengths: Array<string | { area: string; description: string; codeSnippet?: string }> = [];
    if (Array.isArray(parsed.strengths)) {
      for (const item of parsed.strengths) {
        if (typeof item === 'string') {
          strengths.push(cleanText(item));
        } else if (item && typeof item === 'object') {
          const rawSnippet = item.codeSnippet ? cleanText(item.codeSnippet) : undefined;
          strengths.push({
            area: cleanText(item.area || item.title || 'Architectural Strength'),
            description: cleanText(item.description || item.feedback || item.detail || ''),
            codeSnippet: expectedLanguage && rawSnippet ? ensureSnippetLanguage(rawSnippet, expectedLanguage) : rawSnippet,
          });
        }
      }
    }
    if (strengths.length === 0) {
      strengths.push({ area: 'Problem Exploration', description: 'Initiated structured domain modeling for the problem.' });
    }

    const improvements: ImprovementItem[] = [];
    if (Array.isArray(parsed.improvements)) {
      for (const imp of parsed.improvements) {
        if (!imp || typeof imp !== 'object') continue;
        const area = cleanText(imp.area || imp.title || 'System Refinement');
        let suggestion = cleanText(imp.suggestion || imp.feedback || imp.description || '');
        const whyItMatters = imp.whyItMatters ? cleanText(imp.whyItMatters) : undefined;
        let codeSnippet = imp.codeSnippet ? cleanText(imp.codeSnippet) : undefined;
        let diagram = cleanDiagram(imp.diagram || imp.mermaid || imp.chart || imp.mermaidDiagram);

        if (!diagram && suggestion.includes('```mermaid')) {
          const match = suggestion.match(/```mermaid\s*([\s\S]*?)\s*```/i);
          if (match) {
            diagram = cleanDiagram(match[0]);
            suggestion = suggestion.replace(/```mermaid\s*[\s\S]*?\s*```/i, '').trim();
          }
        }
        if (!codeSnippet && (suggestion.includes('```python') || suggestion.includes('```java') || suggestion.includes('```\n'))) {
          const codeMatch = suggestion.match(/```(?:python|java)?\s*([\s\S]*?)\s*```/i);
          if (codeMatch) {
            codeSnippet = cleanText(codeMatch[1]);
            suggestion = suggestion.replace(/```(?:python|java)?\s*[\s\S]*?\s*```/i, '').trim();
          }
        }
        if (expectedLanguage && codeSnippet) codeSnippet = ensureSnippetLanguage(codeSnippet, expectedLanguage);
        const category = imp.category ? cleanText(imp.category) : undefined;
        const isDiagramCategory = Boolean(category) && (/class\s*design/i.test(category!) || /extensibility/i.test(category!));
        if (!isDiagramCategory) {
          diagram = undefined;
        } else if (diagram) {
          const text = `${area} ${suggestion}`.toLowerCase();
          if (
            /\b(null\s*check|guard\s*clause|validate\s*(input|id|parameter|argument|value)|boundary\s*check|boundary\s*handling)\b/i.test(text) &&
            !/\b(interface|abstract\s*class|strategy|factory|observer|service\s*class|decorator|adapter|singleton|repository)\b/i.test(text)
          ) {
            diagram = undefined;
          }
        }
        improvements.push({ area, category, suggestion, whyItMatters, codeSnippet, diagram, diagramType: diagram ? 'mermaid' : undefined });
      }
    }

    return {
      overallScore,
      seniorityLevel: parsed.seniorityLevel || seniorityLevel,
      summary: cleanText(parsed.summary || 'Code evaluated successfully.'),
      criteria: {
        problemAnalysis,
        classDesign,
        codeQuality,
        extensibility,
        concurrencyAndEdgeCases,
        testingAndCorrectness,
        solidAndCleanCode: codeQuality,
        designPatterns: classDesign,
        classModeling: problemAnalysis,
      },
      strengths,
      improvements,
      evaluatedAt: Date.now(),
    };
  };

  for (const text of [stripCodeFences(raw, ['json']) || raw, cleanJsonString(raw)]) {
    const parsed = tryParseJson(text);
    if (parsed?.overallScore !== undefined || parsed?.criteria) return buildReport(parsed);
  }

  const scoreMatch = raw.match(/"overallScore"\s*:\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 35;
  return buildReport({
    overallScore: score,
    summary: 'The implementation was reviewed against standard LLD interview rubrics.',
    criteria: {
      problemAnalysis: { score: Math.round(score / 5), feedback: 'Reviewed the main classes and problem setup.' },
      classDesign: { score: Math.round(score / 5), feedback: 'Reviewed how classes interact with each other.' },
      codeQuality: { score: Math.round(score / 5), feedback: 'Reviewed clean code and data encapsulation.' },
      extensibility: { score: Math.round(score / 5), feedback: 'Reviewed how easily new features can be added.' },
      concurrencyAndEdgeCases: { score: Math.round(score / 5), feedback: 'Reviewed error handling and edge cases.' },
      testingAndCorrectness: { score: Math.round(score / 5), feedback: 'Reviewed test cases and assertions.' },
    },
    strengths: [{ area: 'Initial Class Structure', description: 'You identified the main objects needed to start solving the problem.' }],
    improvements: [
      {
        area: 'Break Large Classes into Smaller Ones',
        category: 'Class Design',
        suggestion: 'Avoid putting all the logic into one large class. Split your code into simple data classes and small service classes that each have one clear job.',
        whyItMatters: 'Interviewers like clean, focused classes that are easy to read and test.',
        diagram: 'classDiagram\n    class OrderService {\n        +processOrder()\n    }\n    class PaymentProcessor {\n        <<interface>>\n        +pay()\n    }\n    OrderService --> PaymentProcessor : uses',
      },
    ],
  });
}

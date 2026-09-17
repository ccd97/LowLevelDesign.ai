import { pythonEngine } from './intellisense/pythonEngine';
import { javaEngine } from './intellisense/javaEngine';
import type {
  IntellisenseCompletionQuery,
  IntellisenseCompletionResult,
  IntellisenseHoverQuery,
  IntellisenseHoverResult,
  IntellisenseSignatureHelpQuery,
  IntellisenseSignatureHelpResult,
} from './intellisense/types';

export * from './intellisense/types';

class IntellisenseService {
  public async getCompletions(query: IntellisenseCompletionQuery): Promise<IntellisenseCompletionResult> {
    try {
      if (query.language === 'python') {
        return await pythonEngine.getCompletions(query);
      } else if (query.language === 'java') {
        return await javaEngine.getCompletions(query);
      }
    } catch (err) {
      console.error(`Error in IntelliSense getCompletions for ${query.language}:`, err);
    }
    return { items: [] };
  }

  public async getHover(query: IntellisenseHoverQuery): Promise<IntellisenseHoverResult | null> {
    try {
      if (query.language === 'python') {
        return await pythonEngine.getHover(query);
      } else if (query.language === 'java') {
        return await javaEngine.getHover(query);
      }
    } catch (err) {
      console.error(`Error in IntelliSense getHover for ${query.language}:`, err);
    }
    return null;
  }

  public async getSignatureHelp(query: IntellisenseSignatureHelpQuery): Promise<IntellisenseSignatureHelpResult | null> {
    try {
      if (query.language === 'python') {
        return await pythonEngine.getSignatureHelp(query);
      } else if (query.language === 'java') {
        return await javaEngine.getSignatureHelp(query);
      }
    } catch (err) {
      console.error(`Error in IntelliSense getSignatureHelp for ${query.language}:`, err);
    }
    return null;
  }

  public prewarm(): void {
    setTimeout(() => {
      pythonEngine.prewarm();
      javaEngine.prewarm();
    }, 1500);
  }

  public shutdown(): void {
    pythonEngine.shutdown();
  }

  public clearCache(): void {
    javaEngine.clearCache();
  }
}

export const intellisenseService = new IntellisenseService();

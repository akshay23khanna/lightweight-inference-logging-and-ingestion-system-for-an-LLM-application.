import { GoogleGenAI } from '@google/genai';
import { LogIngestionPayload } from '../src/types.js';

// Setup GoogleGenAI client lazily to prevent crashing if GEMINI_API_KEY doesn't exist on server start.
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined. Please add it in the Secrets or Environment variables panel.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export class LlmLoggerSdk {
  private ingestionUrl: string;

  constructor() {
    // Falls back to direct injection or local host URL
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    this.ingestionUrl = `${appUrl}/api/logs/ingest`;
  }

  /**
   * Triggers background logging transmission to imitate standard SDK real-time collection.
   */
  private async transmitLog(payload: LogIngestionPayload): Promise<void> {
    try {
      // Send a real POST request to our ingestion pipeline.
      // If we are server-side in the same node process, we also handle failures gracefully
      // and print feedback. This showcases a true distributed SDK-to-ingester workflow.
      const response = await fetch(this.ingestionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SDK-Version': '1.0.0-llm-logger'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn(`SDK transport got non-OK from ingestion point: ${response.status} ${response.statusText}`);
      }
    } catch (err: any) {
      // In early-start states or local debug if ports match differently, fallback to direct module call
      console.warn(`SDK transport failed to connect directly via HTTP: ${err?.message || err}. Falling back to internal ingestion pipeline directly.`);
      try {
        // We import db dynamically to avoid circular dependencies
        const { db } = await import('./db.js');
        const id = Math.random().toString(36).substring(2, 11);
        db.saveLog({
          id,
          conversationId: payload.conversationId,
          model: payload.model,
          provider: payload.provider,
          latencyMs: new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime(),
          tokenUsage: {
            promptTokens: payload.tokenUsage?.promptTokens || Math.ceil(payload.input.length / 4),
            completionTokens: payload.tokenUsage?.completionTokens || Math.ceil(payload.output.length / 4),
            totalTokens: (payload.tokenUsage?.promptTokens || Math.ceil(payload.input.length / 4)) + 
                         (payload.tokenUsage?.completionTokens || Math.ceil(payload.output.length / 4))
          },
          timestamp: payload.endTime,
          status: payload.status,
          errorMsg: payload.errorMsg || null,
          inputPreview: payload.input.slice(0, 300) + (payload.input.length > 300 ? '...' : ''),
          outputPreview: payload.output.slice(0, 300) + (payload.output.length > 300 ? '...' : '')
        });
      } catch (innerErr) {
        console.error('Fatal: Failed to ingestion-log locally as fallback', innerErr);
      }
    }
  }

  /**
   * Helper to estimate token counts should the API fail to return usage statistics
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 3.8));
  }

  /**
   * Safe chat helper wrapping the standard Gemini call to track and intercept metrics.
   */
  async chatWithLogging(inputs: {
    conversationId: string;
    model: string;
    prompt: string;
    systemInstruction?: string;
    history?: { role: 'user' | 'model'; parts: { text: string }[] }[];
  }): Promise<string> {
    const startTimeStr = new Date().toISOString();
    const startTimePerf = performance.now();
    let responseText = '';
    let status: 'success' | 'error' = 'success';
    let errorMsg: string | null = null;
    let promptTokens = 0;
    let completionTokens = 0;

    const selectedModel = inputs.model || 'gemini-1.5-flash';

    try {
      const client = getAiClient();

      // Structure historical contents
      const contentsList: any[] = [];
      if (inputs.history && inputs.history.length > 0) {
        inputs.history.forEach(item => {
          contentsList.push({
            role: item.role,
            parts: item.parts,
          });
        });
      }
      contentsList.push({
        role: 'user',
        parts: [{ text: inputs.prompt }]
      });

      const response = await client.models.generateContent({
        model: selectedModel,
        contents: contentsList,
        config: inputs.systemInstruction ? {
          systemInstruction: inputs.systemInstruction
        } : undefined
      });

      responseText = response.text || '';
      
      // Extract exact tokens returned by Google GenAI
      if (response.usageMetadata) {
        promptTokens = response.usageMetadata.promptTokenCount || 0;
        completionTokens = response.usageMetadata.candidatesTokenCount || 0;
      } else {
        promptTokens = this.estimateTokens(inputs.prompt);
        completionTokens = this.estimateTokens(responseText);
      }

      return responseText;
    } catch (err: any) {
      status = 'error';
      errorMsg = err?.message || String(err);
      
      promptTokens = this.estimateTokens(inputs.prompt);
      completionTokens = 0;
      
      responseText = `An execution or configuration error occurred. Please verify your GEMINI_API_KEY. Details: ${errorMsg}`;
      throw err;
    } finally {
      const completionTimePerf = performance.now();
      const endTimeStr = new Date().toISOString();
      const calculatedDuration = Math.round(completionTimePerf - startTimePerf);

      const payload: LogIngestionPayload = {
        conversationId: inputs.conversationId,
        model: selectedModel,
        provider: 'Google Gemini',
        startTime: startTimeStr,
        endTime: endTimeStr,
        input: inputs.prompt,
        output: responseText,
        status,
        errorMsg,
        tokenUsage: {
          promptTokens,
          completionTokens
        }
      };

      // Near real-time transmission asynchronously so it won't block the prompt response.
      this.transmitLog(payload).catch(logErr => {
        console.error('Async log transport task failed:', logErr);
      });
    }
  }
}

export const sdk = new LlmLoggerSdk();

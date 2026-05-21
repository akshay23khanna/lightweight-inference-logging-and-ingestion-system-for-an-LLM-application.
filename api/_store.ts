import { GoogleGenAI } from '@google/genai';

type Role = 'user' | 'model';
type Status = 'success' | 'error';

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  timestamp: string;
}

export interface InferenceLog {
  id: string;
  conversationId: string;
  model: string;
  provider: string;
  latencyMs: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: string;
  status: Status;
  errorMsg: string | null;
  inputPreview: string;
  outputPreview: string;
}

export interface LogIngestionPayload {
  conversationId: string;
  model: string;
  provider: string;
  startTime: string;
  endTime: string;
  input: string;
  output: string;
  status: Status;
  errorMsg?: string | null;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface Store {
  messages: ChatMessage[];
  logs: InferenceLog[];
}

declare global {
  var __llmInferenceStore: Store | undefined;
}

export function store(): Store {
  if (!globalThis.__llmInferenceStore) {
    globalThis.__llmInferenceStore = { messages: [], logs: [] };
  }

  return globalThis.__llmInferenceStore;
}

export function id(prefix = '') {
  return `${prefix}${Math.random().toString(36).substring(2, 11)}`;
}

export function estimateTokens(text: string) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

export function parseLog(payload: LogIngestionPayload): InferenceLog {
  const latencyMs = new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime();
  const promptTokens = payload.tokenUsage?.promptTokens ?? Math.ceil(payload.input.length / 4);
  const completionTokens = payload.tokenUsage?.completionTokens ?? Math.ceil(payload.output.length / 4);

  return {
    id: id('log_'),
    conversationId: payload.conversationId,
    model: payload.model,
    provider: payload.provider,
    latencyMs,
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    timestamp: payload.endTime,
    status: payload.status,
    errorMsg: payload.errorMsg || null,
    inputPreview: payload.input.slice(0, 200) + (payload.input.length > 200 ? '...' : ''),
    outputPreview: payload.output.slice(0, 200) + (payload.output.length > 200 ? '...' : ''),
  };
}

export function validateLogPayload(payload: Partial<LogIngestionPayload>) {
  const errors: string[] = [];

  if (!payload.conversationId) errors.push('Missing conversationId');
  if (!payload.model) errors.push('Missing model identifier');
  if (!payload.provider) errors.push('Missing provider');
  if (!payload.startTime) errors.push('Missing startTime');
  if (!payload.endTime) errors.push('Missing endTime');
  if (typeof payload.input !== 'string') errors.push('Input must be a string');
  if (typeof payload.output !== 'string') errors.push('Output must be a string');
  if (!payload.status || !['success', 'error'].includes(payload.status)) {
    errors.push('Status must set "success" or "error"');
  }

  return errors;
}

export function getSessions() {
  const sessionsMap = new Map<string, { lastActive: string; messageCount: number }>();

  for (const msg of store().messages) {
    const existing = sessionsMap.get(msg.conversationId);
    if (existing) {
      sessionsMap.set(msg.conversationId, {
        lastActive: new Date(msg.timestamp) > new Date(existing.lastActive) ? msg.timestamp : existing.lastActive,
        messageCount: existing.messageCount + 1,
      });
    } else {
      sessionsMap.set(msg.conversationId, {
        lastActive: msg.timestamp,
        messageCount: 1,
      });
    }
  }

  return Array.from(sessionsMap.entries())
    .map(([sessionId, stats]) => ({ id: sessionId, ...stats }))
    .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
}

export function getStats() {
  const data = store();
  const totalRequests = data.logs.length;
  const successCount = data.logs.filter(log => log.status === 'success').length;
  const errorCount = totalRequests - successCount;
  const modelDistribution: Record<string, number> = {};

  let totalLatency = 0;
  let totalTokens = 0;

  for (const log of data.logs) {
    totalLatency += log.latencyMs;
    totalTokens += log.tokenUsage.totalTokens;
    modelDistribution[log.model] = (modelDistribution[log.model] || 0) + 1;
  }

  return {
    totalRequests,
    successRate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 1000) / 10 : 100,
    avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
    totalTokens,
    errorRate: totalRequests > 0 ? Math.round((errorCount / totalRequests) * 1000) / 10 : 0,
    activeSessions: new Set(data.messages.map(msg => msg.conversationId)).size,
    modelDistribution,
    latencyHistory: data.logs.map(log => ({ timestamp: log.timestamp, latencyMs: log.latencyMs })).slice(-30),
    errorGrowth: data.logs.filter(log => log.status === 'error').map(log => ({ timestamp: log.timestamp, count: 1 })).slice(-30),
    tokenGrowth: data.logs.map(log => ({ timestamp: log.timestamp, count: log.tokenUsage.totalTokens })).slice(-30),
  };
}

export async function runGeminiChat(input: {
  conversationId: string;
  model: string;
  prompt: string;
  history: ChatMessage[];
}) {
  const startTime = new Date().toISOString();
  const startMs = performance.now();
  let responseText = '';
  let status: Status = 'success';
  let errorMsg: string | null = null;
  let promptTokens = estimateTokens(input.prompt);
  let completionTokens = 0;

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in the deployment environment.');
    }

    const client = new GoogleGenAI({ apiKey });
    const contents = [
      ...input.history.map(message => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),
      {
        role: 'user',
        parts: [{ text: input.prompt }],
      },
    ];

    const response = await client.models.generateContent({
      model: input.model || 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction: 'You are an intelligent engineering assistant helper configured to explain LLM system internals.',
      },
    });

    responseText = response.text || '';
    promptTokens = response.usageMetadata?.promptTokenCount || promptTokens;
    completionTokens = response.usageMetadata?.candidatesTokenCount || estimateTokens(responseText);
  } catch (err: any) {
    status = 'error';
    errorMsg = err?.message || String(err);
    responseText = `Communication failed: ${errorMsg}`;
  }

  const endTime = new Date().toISOString();
  const log = parseLog({
    conversationId: input.conversationId,
    model: input.model || 'gemini-3.5-flash',
    provider: 'Google Gemini',
    startTime,
    endTime,
    input: input.prompt,
    output: responseText,
    status,
    errorMsg,
    tokenUsage: {
      promptTokens,
      completionTokens,
    },
  });

  log.latencyMs = Math.round(performance.now() - startMs);
  store().logs.push(log);

  return responseText;
}

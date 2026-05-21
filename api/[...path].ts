type Role = 'user' | 'model';
type Status = 'success' | 'error';

interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  timestamp: string;
}

interface InferenceLog {
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

interface Store {
  messages: ChatMessage[];
  logs: InferenceLog[];
}

declare global {
  var __llmInferenceStore: Store | undefined;
}

function store(): Store {
  if (!globalThis.__llmInferenceStore) {
    globalThis.__llmInferenceStore = { messages: [], logs: [] };
  }

  return globalThis.__llmInferenceStore;
}

function id(prefix = '') {
  return `${prefix}${Math.random().toString(36).substring(2, 11)}`;
}

function estimateTokens(text: string) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

function parseLog(payload: any): InferenceLog {
  const promptTokens = payload.tokenUsage?.promptTokens ?? Math.ceil(String(payload.input || '').length / 4);
  const completionTokens = payload.tokenUsage?.completionTokens ?? Math.ceil(String(payload.output || '').length / 4);

  return {
    id: id('log_'),
    conversationId: payload.conversationId,
    model: payload.model,
    provider: payload.provider,
    latencyMs: new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime(),
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    timestamp: payload.endTime,
    status: payload.status,
    errorMsg: payload.errorMsg || null,
    inputPreview: String(payload.input || '').slice(0, 200) + (String(payload.input || '').length > 200 ? '...' : ''),
    outputPreview: String(payload.output || '').slice(0, 200) + (String(payload.output || '').length > 200 ? '...' : ''),
  };
}

function getSessions() {
  const sessionsMap = new Map<string, { lastActive: string; messageCount: number }>();

  for (const msg of store().messages) {
    const existing = sessionsMap.get(msg.conversationId);
    sessionsMap.set(msg.conversationId, {
      lastActive: existing && new Date(existing.lastActive) > new Date(msg.timestamp) ? existing.lastActive : msg.timestamp,
      messageCount: (existing?.messageCount || 0) + 1,
    });
  }

  return Array.from(sessionsMap.entries())
    .map(([sessionId, stats]) => ({ id: sessionId, ...stats }))
    .sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
}

function getStats() {
  const data = store();
  const totalRequests = data.logs.length;
  const successCount = data.logs.filter(log => log.status === 'success').length;
  const errorCount = totalRequests - successCount;
  const modelDistribution: Record<string, number> = {};
  let totalLatency = 0;
  let totalTokens = 0;

  for (const log of data.logs) {
    totalLatency += Number.isFinite(log.latencyMs) ? log.latencyMs : 0;
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

function validateLogPayload(payload: any) {
  const errors: string[] = [];
  if (!payload.conversationId) errors.push('Missing conversationId');
  if (!payload.model) errors.push('Missing model identifier');
  if (!payload.provider) errors.push('Missing provider');
  if (!payload.startTime) errors.push('Missing startTime');
  if (!payload.endTime) errors.push('Missing endTime');
  if (typeof payload.input !== 'string') errors.push('Input must be a string');
  if (typeof payload.output !== 'string') errors.push('Output must be a string');
  if (!payload.status || !['success', 'error'].includes(payload.status)) errors.push('Status must set "success" or "error"');
  return errors;
}

async function runChat(body: any) {
  const data = store();
  const conversationId = body.conversationId;
  const prompt = body.prompt;
  const model = body.model || 'gemini-1.5-flash';
  const startTime = new Date().toISOString();
  const startMs = Date.now();

  data.messages.push({
    id: id(),
    conversationId,
    role: 'user',
    content: prompt,
    timestamp: startTime,
  });

  let reply = '';
  let status: Status = 'success';
  let errorMsg: string | null = null;
  let promptTokens = estimateTokens(prompt);
  let completionTokens = 0;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured in Vercel Environment Variables.');
    }

    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const history = data.messages
      .filter(message => message.conversationId === conversationId)
      .slice(-8)
      .map(message => ({
        role: message.role,
        parts: [{ text: message.content }],
      }));

    const response = await client.models.generateContent({
      model,
      contents: history,
      config: {
        systemInstruction: 'You are an intelligent engineering assistant helper configured to explain LLM system internals.',
      },
    });

    reply = response.text || '';
    promptTokens = response.usageMetadata?.promptTokenCount || promptTokens;
    completionTokens = response.usageMetadata?.candidatesTokenCount || estimateTokens(reply);
  } catch (err: any) {
    status = 'error';
    errorMsg = err?.message || String(err);
    reply = `Communication failed: ${errorMsg}`;
  }

  const endTime = new Date().toISOString();
  data.messages.push({
    id: id(),
    conversationId,
    role: 'model',
    content: reply,
    timestamp: endTime,
  });

  const log = parseLog({
    conversationId,
    model,
    provider: 'Google Gemini',
    startTime,
    endTime,
    input: prompt,
    output: reply,
    status,
    errorMsg,
    tokenUsage: { promptTokens, completionTokens },
  });
  log.latencyMs = Date.now() - startMs;
  data.logs.push(log);

  return { reply };
}

function routeParts(req: any) {
  const raw = req.query?.path;
  return Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
}

export default async function handler(req: any, res: any) {
  try {
    const parts = routeParts(req);
    const route = parts.join('/');

    if (req.method === 'GET' && route === 'sessions') {
      return res.status(200).json(getSessions());
    }

    if (req.method === 'GET' && route === 'stats') {
      return res.status(200).json(getStats());
    }

    if (req.method === 'GET' && route === 'logs') {
      const { model, status, search, limit = '50' } = req.query || {};
      let logs = [...store().logs];

      if (model && model !== 'all') logs = logs.filter(log => log.model === model);
      if (status && status !== 'all') logs = logs.filter(log => log.status === status);
      if (search) {
        const query = String(search).toLowerCase();
        logs = logs.filter(log =>
          log.conversationId.toLowerCase().includes(query) ||
          log.inputPreview.toLowerCase().includes(query) ||
          log.outputPreview.toLowerCase().includes(query) ||
          Boolean(log.errorMsg?.toLowerCase().includes(query))
        );
      }

      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return res.status(200).json({ total: logs.length, logs: logs.slice(0, parseInt(String(limit), 10)) });
    }

    if (req.method === 'GET' && parts[0] === 'messages' && parts[1]) {
      return res.status(200).json(store().messages.filter(message => message.conversationId === parts[1]));
    }

    if (req.method === 'POST' && route === 'clear') {
      globalThis.__llmInferenceStore = { messages: [], logs: [] };
      return res.status(200).json({ message: 'Database reset succeeded' });
    }

    if (req.method === 'POST' && route === 'logs/ingest') {
      const errors = validateLogPayload(req.body || {});
      if (errors.length > 0) {
        return res.status(400).json({ status: 'rejected', reason: 'Schema validation failed', errors });
      }

      const log = parseLog(req.body);
      store().logs.push(log);
      return res.status(201).json({ status: 'ingested', id: log.id, latencyMs: log.latencyMs, totalTokens: log.tokenUsage.totalTokens });
    }

    if (req.method === 'POST' && route === 'chat') {
      const { conversationId, prompt } = req.body || {};
      if (!conversationId) return res.status(400).json({ error: 'Missing conversationId' });
      if (!prompt) return res.status(400).json({ error: 'Missing user prompt' });
      return res.status(200).json(await runChat(req.body));
    }

    return res.status(404).json({ error: `Unknown API route: /api/${route}` });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Function invocation failed',
      stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    });
  }
}

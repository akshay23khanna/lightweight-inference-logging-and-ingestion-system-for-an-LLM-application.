import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';
import { sdk } from './server/llmSdk.js';
import { LogIngestionPayload } from './src/types.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON payload parsing up to 10MB to facilitate rich text uploads
  app.use(express.json({ limit: '10mb' }));

  // --- API ROUTE: CHATBOT INFERENCE ROUTE ---
  app.post('/api/chat', async (req, res) => {
    try {
      const { conversationId, prompt, model } = req.body;

      if (!conversationId) {
        return res.status(400).json({ error: 'Missing conversationId' });
      }
      if (!prompt) {
        return res.status(400).json({ error: 'Missing user prompt' });
      }

      // 1. Persist the user message first
      const userMessageId = Math.random().toString(36).substring(2, 11);
      const userMessage = {
        id: userMessageId,
        conversationId,
        role: 'user' as const,
        content: prompt,
        timestamp: new Date().toISOString()
      };
      db.saveMessage(userMessage);

      // 2. Hydrate session history from local database file to build high quality context
      const chatHistory = db.getMessages(conversationId);
      // Map it into the structure the SDK expects, ensuring we skip the very last message we just saved to avoid duplication
      const historyFormatted = chatHistory
        .filter(m => m.id !== userMessageId)
        .map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }));

      // 3. Trigger the wrapper SDK which encapsulates both inference & async telemetry ingestion
      let reply = '';
      try {
        reply = await sdk.chatWithLogging({
          conversationId,
          model: model || 'gemini-3.5-flash',
          prompt,
          history: historyFormatted,
          systemInstruction: 'You are an intelligent engineering assistant helper configured to explain LLM system internals.'
        });
      } catch (sdkErr: any) {
        // Log the error message cleanly. The SDK has already asynchronously sent an error log payload.
        reply = `Communication failed: ${sdkErr?.message || sdkErr}. Please make sure you have supplied a valid GEMINI_API_KEY in secrets variables.`;
      }

      // 4. Save response to chat history
      const responseMessage = {
        id: Math.random().toString(36).substring(2, 11),
        conversationId,
        role: 'model' as const,
        content: reply,
        timestamp: new Date().toISOString()
      };
      db.saveMessage(responseMessage);

      return res.json({ reply });
    } catch (err: any) {
      console.error('API /api/chat error:', err);
      return res.status(500).json({ error: err?.message || 'Server error' });
    }
  });

  // --- API ROUTE: LOG INGESTION ENDPOINT ---
  app.post('/api/logs/ingest', (req, res) => {
    try {
      const payload = req.body as LogIngestionPayload;

      // Pipeline Validation & Parsing
      const errors: string[] = [];
      if (!payload.conversationId) errors.push('Missing conversationId');
      if (!payload.model) errors.push('Missing model identifier');
      if (!payload.provider) errors.push('Missing provider');
      if (!payload.startTime) errors.push('Missing startTime');
      if (!payload.endTime) errors.push('Missing endTime');
      if (typeof payload.input !== 'string') errors.push('Input must be a string');
      if (typeof payload.output !== 'string') errors.push('Output must be a string');
      if (!['success', 'error'].includes(payload.status)) errors.push('Status must set "success" or "error"');

      if (errors.length > 0) {
        return res.status(400).json({
          status: 'rejected',
          reason: 'Schema validation failed',
          errors,
        });
      }

      // Extract metadata values
      const latencyMs = new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime();
      
      const pTokens = payload.tokenUsage?.promptTokens ?? Math.ceil(payload.input.length / 4);
      const cTokens = payload.tokenUsage?.completionTokens ?? Math.ceil(payload.output.length / 4);
      const totalTokens = pTokens + cTokens;

      const logId = `log_${Math.random().toString(36).substring(2, 11)}`;
      
      const parsedLog = {
        id: logId,
        conversationId: payload.conversationId,
        model: payload.model,
        provider: payload.provider,
        latencyMs,
        tokenUsage: {
          promptTokens: pTokens,
          completionTokens: cTokens,
          totalTokens
        },
        timestamp: payload.endTime,
        status: payload.status,
        errorMsg: payload.errorMsg || null,
        inputPreview: payload.input.slice(0, 200) + (payload.input.length > 200 ? '...' : ''),
        outputPreview: payload.output.slice(0, 200) + (payload.output.length > 200 ? '...' : '')
      };

      // Store in database
      db.saveLog(parsedLog);

      return res.status(201).json({
        status: 'ingested',
        id: logId,
        latencyMs,
        totalTokens
      });
    } catch (err: any) {
      console.error('Ingestion Pipeline failed:', err);
      return res.status(500).json({ error: 'Ingestion malfunction: ' + err.message });
    }
  });

  // --- API ROUTE: FETCH LOGS (PAGINATED & FILTERED) ---
  app.get('/api/logs', (req, res) => {
    try {
      const { model, status, search, limit = 50 } = req.query;
      let logs = db.getLogs();

      // Apply filter criteria
      if (model && model !== 'all') {
        logs = logs.filter(l => l.model === model);
      }
      if (status && status !== 'all') {
        logs = logs.filter(l => l.status === status);
      }
      if (search) {
        const query = (search as string).toLowerCase();
        logs = logs.filter(
          l => 
            l.conversationId.toLowerCase().includes(query) ||
            l.inputPreview.toLowerCase().includes(query) ||
            l.outputPreview.toLowerCase().includes(query) ||
            (l.errorMsg && l.errorMsg.toLowerCase().includes(query))
        );
      }

      // Sort with latest first (newest logs shown on dashboard feed)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Limit results size
      const maxLogs = parseInt(limit as string, 10);
      res.json({
        total: logs.length,
        logs: logs.slice(0, maxLogs)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API ROUTE: REAL-TIME CONVERSATION CHATS ---
  app.get('/api/messages/:conversationId', (req, res) => {
    try {
      const messages = db.getMessages(req.params.conversationId);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API ROUTE: CONVERSATION SESSIONS TIMELINE ---
  app.get('/api/sessions', (req, res) => {
    try {
      const sessions = db.getSessions();
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API ROUTE: AGGREGATE SUMMARY ANALYTICS ---
  app.get('/api/stats', (req, res) => {
    try {
      const stats = db.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- API ROUTE: CLEAR ALL DATA FOR RESET ---
  app.post('/api/clear', (req, res) => {
    try {
      db.clear();
      res.json({ message: 'Database reset succeeded' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Load the built files in production, or hook Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind exclusively to 0.0.0.0 and port 3000 to comply with Cloud Run reverse-proxy rules
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SYS] Logging ingestion server bound to http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[FATAL] Failed to bootstrap custom express server:', err);
});

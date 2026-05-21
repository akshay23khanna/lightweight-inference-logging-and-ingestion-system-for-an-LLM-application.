import fs from 'fs';
import path from 'path';
import { ChatMessage, InferenceLog, SystemStats } from '../src/types.js';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

interface Schema {
  messages: ChatMessage[];
  logs: InferenceLog[];
}

function initDb(): Schema {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialData: Schema = { messages: [], logs: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }

  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading DB, resetting database', err);
    const initialData: Schema = { messages: [], logs: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    return initialData;
  }
}

function saveDb(data: Schema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to database file:', err);
  }
}

export const db = {
  getMessages(conversationId?: string): ChatMessage[] {
    const data = initDb();
    if (!conversationId) {
      return data.messages;
    }
    return data.messages.filter(m => m.conversationId === conversationId);
  },

  getAllMessages(): ChatMessage[] {
    const data = initDb();
    return data.messages;
  },

  saveMessage(msg: ChatMessage) {
    const data = initDb();
    data.messages.push(msg);
    saveDb(data);
  },

  getLogs(): InferenceLog[] {
    const data = initDb();
    return data.logs;
  },

  saveLog(log: InferenceLog) {
    const data = initDb();
    data.logs.push(log);
    saveDb(data);
  },

  getSessions(): { id: string; lastActive: string; messageCount: number }[] {
    const data = initDb();
    const sessionsMap = new Map<string, { lastActive: string; messageCount: number }>();
    
    data.messages.forEach(msg => {
      const existing = sessionsMap.get(msg.conversationId);
      if (existing) {
        sessionsMap.set(msg.conversationId, {
          lastActive: new Date(msg.timestamp) > new Date(existing.lastActive) ? msg.timestamp : existing.lastActive,
          messageCount: existing.messageCount + 1
        });
      } else {
        sessionsMap.set(msg.conversationId, {
          lastActive: msg.timestamp,
          messageCount: 1
        });
      }
    });

    return Array.from(sessionsMap.entries()).map(([id, stats]) => ({
      id,
      ...stats
    })).sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
  },

  getStats(): SystemStats & {
    modelDistribution: Record<string, number>;
    latencyHistory: { timestamp: string; latencyMs: number }[];
    errorGrowth: { timestamp: string; count: number }[];
    tokenGrowth: { timestamp: string; count: number }[];
  } {
    const data = initDb();
    const logs = data.logs;
    const totalRequests = logs.length;
    const successCount = logs.filter(l => l.status === 'success').length;
    const errorCount = totalRequests - successCount;
    
    const activeSessions = new Set(data.messages.map(m => m.conversationId)).size;

    let totalLatency = 0;
    let totalTokens = 0;
    const modelDistribution: Record<string, number> = {};

    logs.forEach(l => {
      totalLatency += l.latencyMs;
      totalTokens += l.tokenUsage.totalTokens;
      modelDistribution[l.model] = (modelDistribution[l.model] || 0) + 1;
    });

    const avgLatencyMs = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    // Latency history for standard plots (sorted by timestamp)
    const latencyHistory = logs
      .map(l => ({ timestamp: l.timestamp, latencyMs: l.latencyMs }))
      .slice(-30); // show last 30 requests to keep graph responsive

    // Map token count and error growth
    const tokenGrowth = logs
      .map(l => ({ timestamp: l.timestamp, count: l.tokenUsage.totalTokens }))
      .slice(-30);

    const errorGrowth = logs
      .filter(l => l.status === 'error')
      .map(l => ({ timestamp: l.timestamp, count: 1 }))
      .slice(-30);

    return {
      totalRequests,
      successRate: Math.round(successRate * 10) / 10,
      avgLatencyMs,
      totalTokens,
      errorRate: Math.round(errorRate * 10) / 10,
      activeSessions,
      modelDistribution,
      latencyHistory,
      errorGrowth,
      tokenGrowth
    };
  },

  clear() {
    const initialData: Schema = { messages: [], logs: [] };
    saveDb(initialData);
  }
};

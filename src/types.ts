export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface InferenceMetadata {
  model: string;
  provider: string;
  latencyMs: number;
  tokenUsage: TokenUsage;
  timestamp: string;
  status: 'success' | 'error';
  errorMsg: string | null;
  conversationId: string;
  inputPreview: string;
  outputPreview: string;
}

export interface InferenceLog extends InferenceMetadata {
  id: string;
}

export interface SystemStats {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  errorRate: number;
  activeSessions: number;
}

// Payload schema for SDInbound ingestion
export interface LogIngestionPayload {
  conversationId: string;
  model: string;
  provider: string;
  startTime: string;
  endTime: string;
  input: string;
  output: string;
  status: 'success' | 'error';
  errorMsg?: string | null;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

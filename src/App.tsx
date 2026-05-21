import React, { useState, useEffect } from 'react';
import { 
  Terminal, 
  Database, 
  RefreshCw, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight, 
  ChevronDown, 
  HelpCircle, 
  FileJson, 
  Settings, 
  X,
  Play
} from 'lucide-react';
import ChatbotPanel from './components/ChatbotPanel';
import DashboardStats from './components/DashboardStats';
import { InferenceLog, SystemStats } from './types';

export default function App() {
  const [activeSessionId, setActiveSessionId] = useState(`session_${Math.random().toString(36).substring(2, 8)}`);
  const [sessions, setSessions] = useState<{ id: string; lastActive: string; messageCount: number }[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<InferenceLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<InferenceLog | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters State
  const [filterModel, setFilterModel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch functions
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchTelemetry = async () => {
    try {
      setIsRefreshing(true);
      
      // Fetch stats
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Fetch actual ingestion log records
      const queryParams = new URLSearchParams();
      if (filterModel !== 'all') queryParams.append('model', filterModel);
      if (filterStatus !== 'all') queryParams.append('status', filterStatus);
      if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());
      
      const logsRes = await fetch(`/api/logs?${queryParams.toString()}`);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData.logs);
      }
    } catch (err) {
      console.error('Failed to sync telemetry feeds:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Reset database helper
  const handleClearDb = async () => {
    if (!window.confirm('Are you sure you want to clear all database entities, session tracks, and telemetry records? This restores a fresh state.')) {
      return;
    }
    try {
      await fetch('/api/clear', { method: 'POST' });
      setActiveSessionId(`session_${Math.random().toString(36).substring(2, 8)}`);
      setLogs([]);
      setSelectedLog(null);
      await Promise.all([fetchSessions(), fetchTelemetry()]);
    } catch (err) {
      console.error('Clear DB failed:', err);
    }
  };

  // Run initial state load
  useEffect(() => {
    fetchSessions();
    fetchTelemetry();
  }, [filterModel, filterStatus]);

  // Handle live incremental refresh simulation
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchSessions();
      fetchTelemetry();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, filterModel, filterStatus, searchQuery]);

  // Prompt injector demo helper to see failure modes
  const handleTriggerSimulatedError = async () => {
    // Send a faulty log ingestion payload directly to test the robust pipeline parsing schema
    try {
      const startTime = new Date(Date.now() - 4100).toISOString();
      const endTime = new Date().toISOString();
      const faultyPayload = {
        conversationId: activeSessionId,
        model: 'unsupported-hyper-neural-net-9',
        provider: 'Mock Error Simulation Corp',
        startTime,
        endTime,
        input: 'User issued an API query bypass override commands.',
        output: '',
        status: 'error',
        errorMsg: 'Blocked by target service rate limits (HTTP 429: Too Many Requests).',
        tokenUsage: {
          promptTokens: 82,
          completionTokens: 0
        }
      };

      const res = await fetch('/api/logs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(faultyPayload)
      });

      if (res.ok) {
        fetchTelemetry();
        alert('Simulated Error Ingested successfully into pipeline telemetry! Check the logs stream below.');
      }
    } catch (err: any) {
      alert('Simulation error pipeline write: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Top Banner Branding / Header Panel */}
      <header className="bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 rounded-lg shadow-inner">
              <Terminal className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                LLM Inference Logger & Ingestion Engine
                <span className="bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Ingester Live
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time SDK logging wrappers, metadata validation pipeline, and visual telemetry dashboards.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={handleTriggerSimulatedError}
              className="px-3 py-1.5 bg-rose-950/40 border border-rose-900/60 hover:bg-rose-900/30 rounded-lg text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Simulates a standard downstream network interruption on the SDK client to verify pipeline resilience."
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Simulate SDK Log Error</span>
            </button>

            <button
              onClick={handleClearDb}
              style={{ padding: '6px 12px' }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700/80 text-xs font-semibold text-slate-300 border border-slate-700 rounded-lg transition-all cursor-pointer"
            >
              Reset Telemetry DB
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout Wrapper */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* Core dynamic metrics widgets row */}
        <DashboardStats stats={stats} />

        {/* Side-by-side: Active chat simulator next to recent telemetry log inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Column 1 (Left 5 grid-cols): Beautiful sandbox chat client */}
          <div className="lg:col-span-5 h-full">
            <ChatbotPanel
              activeSessionId={activeSessionId}
              setActiveSessionId={setActiveSessionId}
              sessions={sessions}
              refreshSessions={fetchSessions}
              refreshTelemetry={fetchTelemetry}
            />
          </div>

          {/* Column 2 (Right 7 grid-cols): Live ingested log feed */}
          <div className="lg:col-span-7 space-y-4">
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-full min-h-[600px] md:h-[680px]">
              
              {/* Telemetry log table control header */}
              <div className="bg-slate-950 px-4 py-3.5 border-b border-slate-850 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <Database className="text-indigo-400 w-4 h-4" />
                  <h2 className="text-white font-semibold text-xs sm:text-sm tracking-tight">Active SDK Ingest Stream ({logs.length})</h2>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  {/* Autosync control */}
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400 select-none mr-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>Auto-Poll (5s)</span>
                  </label>

                  <button
                    onClick={fetchTelemetry}
                    className="p-1 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                    <span>Pull</span>
                  </button>
                </div>
              </div>

              {/* Ingress Logs Filters bar */}
              <div className="bg-slate-900/40 p-3 border-b border-slate-850 flex flex-col gap-2.5 sm:grid sm:grid-cols-12 shrink-0">
                
                {/* Search bar */}
                <div className="sm:col-span-6 relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                    <Search className="h-3 w-3 text-slate-500" />
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search logs by Session / Input previews..."
                    className="w-full bg-slate-950 text-[11px] text-slate-200 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 outline-none placeholder:text-slate-600 focus:border-indigo-500/60"
                  />
                </div>

                {/* Model match */}
                <div className="sm:col-span-3 flex items-center bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg">
                  <Filter className="text-slate-500 w-3 h-3 mr-1" />
                  <select
                    value={filterModel}
                    onChange={(e) => setFilterModel(e.target.value)}
                    className="text-[10px] text-slate-300 bg-transparent border-none outline-none w-full font-mono cursor-pointer"
                  >
                    <option value="all">Any Model</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-lite</option>
                    <option value="gemini-3.1-pro-preview">gemini-3.1-pro</option>
                    <option value="unsupported-hyper-neural-net-9">unsupported-hyper-net</option>
                  </select>
                </div>

                {/* Status match */}
                <div className="sm:col-span-3 flex items-center bg-slate-950 border border-slate-850 px-2 py-1 rounded-lg">
                  <Filter className="text-slate-500 w-3 h-3 mr-1" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="text-[10px] text-slate-300 bg-transparent border-none outline-none w-full font-mono cursor-pointer"
                  >
                    <option value="all">Any Status</option>
                    <option value="success">Success only</option>
                    <option value="error">Errors only</option>
                  </select>
                </div>

              </div>

              {/* Logs Stream output listing */}
              <div className="flex-1 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 h-full flex flex-col items-center justify-center">
                    <Database className="w-8 h-8 text-slate-800 mb-2" />
                    <p className="font-medium text-slate-400">No telemetry log lines stored matching current filters.</p>
                    <p className="text-[10px] text-slate-600 mt-1">Prompt the Chatbot or trigger a test event to see incoming payloads stream in live.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-850">
                    {logs.map((log) => {
                      const isSelected = selectedLog?.id === log.id;
                      const hasError = log.status === 'error';
                      return (
                        <div key={log.id} className="transition-colors">
                          
                          {/* Row Summary Toggle line */}
                          <div
                            onClick={() => setSelectedLog(isSelected ? null : log)}
                            className={`p-3 sm:px-4 cursor-pointer hover:bg-slate-850/50 flex items-center justify-between gap-4 text-xs ${
                              isSelected ? 'bg-slate-950/80 border-l-2 border-indigo-500' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${hasError ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-slate-300 truncate font-semibold">
                                    {log.id}
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 font-mono border border-slate-850">
                                    {log.model}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 truncate mt-1">
                                  {hasError ? (
                                    <span className="text-rose-400 font-mono italic">Err: {log.errorMsg}</span>
                                  ) : (
                                    log.inputPreview
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0 text-right">
                              <div className="hidden sm:block">
                                <div className="font-mono text-[11px] text-indigo-300">{log.latencyMs}ms</div>
                                <div className="text-[9px] text-slate-500 font-mono mt-0.5">{log.tokenUsage.totalTokens} tokens</div>
                              </div>
                              {isSelected ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {/* Expanded JSON Inspector & Raw Trace Metadata Card */}
                          {isSelected && (
                            <div className="p-4 bg-slate-950 border-t border-b border-indigo-950/50 text-xs text-slate-300 space-y-4">
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-lg border border-slate-850 text-[11px]">
                                <div>
                                  <span className="text-slate-500 block mb-0.5">Latency Duration</span>
                                  <span className="font-mono font-semibold text-rose-300">{log.latencyMs} ms</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block mb-0.5">Tokens Dispatched</span>
                                  <span className="font-mono font-semibold text-indigo-300">{log.tokenUsage.totalTokens} (<span className="text-slate-500 text-[10px]">{log.tokenUsage.promptTokens} in / {log.tokenUsage.completionTokens} out</span>)</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block mb-0.5">Provider / Gateway</span>
                                  <span className="font-semibold text-slate-200">{log.provider}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block mb-0.5">Session Identification</span>
                                  <span className="font-mono text-indigo-400 overflow-clip truncate block" title={log.conversationId}>{log.conversationId}</span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Input Prompt</div>
                                <div className="p-2.5 bg-slate-900 border border-slate-850 rounded-lg font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap max-h-32">
                                  {log.inputPreview === log.outputPreview ? 'Refer to API failure reason above' : log.inputPreview}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Inference Output Payload</div>
                                <div className="p-2.5 bg-slate-900 border border-slate-850 rounded-lg font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap max-h-32">
                                  {hasError ? (
                                    <span className="text-rose-400 font-semibold">{log.errorMsg}</span>
                                  ) : (
                                    log.outputPreview
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                    <FileJson className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Raw DB Document Payload</span>
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">Timestamp: {log.timestamp}</span>
                                </div>
                                <pre className="p-2 bg-slate-900 border border-indigo-900/20 text-indigo-200 max-h-48 overflow-y-auto rounded-lg text-[10px] font-mono scrollbar-thin">
                                  {JSON.stringify(log, null, 2)}
                                </pre>
                              </div>

                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </main>

      {/* Decorative clean footer status bar with zero technical margin clutter */}
      <footer className="mt-12 bg-slate-900 border-t border-slate-850 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <span>Inference log ingestion middleware dashboard. Perfect for audit tracing and latency analytics.</span>
          <span className="text-indigo-400 font-mono">React v19 + Tailwind v4 + Express</span>
        </div>
      </footer>

    </div>
  );
}

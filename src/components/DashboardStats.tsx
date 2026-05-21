import React from 'react';
import { Activity, Clock, Zap, Coins, CheckCircle, Database } from 'lucide-react';

interface MetricData {
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  errorRate: number;
  activeSessions: number;
  modelDistribution: Record<string, number>;
  latencyHistory: { timestamp: string; latencyMs: number }[];
  tokenGrowth: { timestamp: string; count: number }[];
}

export default function DashboardStats({ stats }: { stats: MetricData | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(idx => (
          <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-xl h-24"></div>
        ))}
      </div>
    );
  }

  // Find max latency to scale custom timeline SVG
  const maxLatency = Math.max(...stats.latencyHistory.map(h => h.latencyMs), 2000);
  const maxTokens = Math.max(...stats.tokenGrowth.map(tg => tg.count), 500);

  // Translate model list for percent view
  const totalModelsCount = Object.values(stats.modelDistribution).reduce((sum, v) => sum + v, 0);

  return (
    <div id="stats-dashboard-container" className="space-y-6">
      
      {/* Top Cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total requests card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3 shadow-md">
          <div className="p-2 border border-indigo-900/40 bg-indigo-950/30 text-indigo-400 rounded-lg shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Total Inferences</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono tracking-tight">
              {stats.totalRequests}
            </div>
            <div className="text-[10px] text-indigo-400 mt-1 flex items-center gap-1">
              <span>{stats.activeSessions} active sessions</span>
            </div>
          </div>
        </div>

        {/* Avg Latency card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3 shadow-md">
          <div className="p-2 border border-pink-900/40 bg-pink-950/30 text-pink-400 rounded-lg shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Avg Latency</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono tracking-tight">
              {stats.avgLatencyMs} <span className="text-xs text-rose-400">ms</span>
            </div>
            <div className="text-[10px] text-pink-400 mt-1">
              <span>SDK-computed round-trip</span>
            </div>
          </div>
        </div>

        {/* Success Rate card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3 shadow-md">
          <div className="p-2 border border-emerald-950/40 bg-emerald-950/30 text-emerald-400 rounded-lg shrink-0">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium">Inference Status</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono tracking-tight">
              {stats.successRate}%
            </div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <span>{stats.errorRate}% runtime errors</span>
            </div>
          </div>
        </div>

        {/* Token consumption card */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-start gap-3 shadow-md">
          <div className="p-2 border border-amber-900/40 bg-amber-950/30 text-amber-400 rounded-lg shrink-0">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] text-slate-400 font-medium font-sans">Token Usage</div>
            <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-mono tracking-tight">
              {stats.totalTokens.toLocaleString()}
            </div>
            <div className="text-[10px] text-amber-400 mt-1">
              <span>Cumulative SDK Ingestion</span>
            </div>
          </div>
        </div>

      </div>

      {/* Embedded Chart Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Plot A: Model distribution percentages & Volume and Database stats */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-slate-200 font-medium text-xs sm:text-sm flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>Model Ingestion Distribution</span>
            </h3>

            <div className="mt-4 space-y-3.5">
              {Object.entries(stats.modelDistribution).map(([model, count]) => {
                const percent = totalModelsCount > 0 ? Math.round((count / totalModelsCount) * 100) : 0;
                return (
                  <div key={model} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-mono text-slate-300 font-medium">{model}</span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        {count} hits ({percent}%)
                      </span>
                    </div>
                    {/* Visual Bar progress outline */}
                    <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-850">
                      <div
                        style={{ width: `${percent}%` }}
                        className="bg-indigo-500 h-full rounded-full transition-all duration-550"
                      />
                    </div>
                  </div>
                );
              })}

              {Object.keys(stats.modelDistribution).length === 0 && (
                <div className="text-center text-xs text-slate-500 py-8">
                  Initiate standard queries to populate models telemetry splits.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-850/60 flex justify-between text-[11px] text-slate-400 font-mono">
            <span>Provider: Google Gemini API</span>
            <span className="text-indigo-400">Database Engine: JSON Storage</span>
          </div>
        </div>


        {/* Plot B: Custom latency history chart via responsive inline-SVG */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md flex flex-col">
          <h3 className="text-slate-200 font-medium text-xs sm:text-sm flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-4">
            <Zap className="w-4 h-4 text-pink-400" />
            <span>Interactive Real-time Latency Sparklines (Last 30 inferences)</span>
          </h3>

          <div className="flex-1 flex flex-col justify-end min-h-[140px] px-1 relative">
            
            {/* SVG graph */}
            {stats.latencyHistory.length > 1 ? (
              <div className="w-full h-[120px] pb-1">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${stats.latencyHistory.length - 1} 100`}>
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2={stats.latencyHistory.length - 1} y2="20" stroke="#1e293b" strokeWidth="0.1" strokeDasharray="1,1" />
                  <line x1="0" y1="55" x2={stats.latencyHistory.length - 1} y2="55" stroke="#1e293b" strokeWidth="0.1" strokeDasharray="1,1" />
                  <line x1="0" y1="80" x2={stats.latencyHistory.length - 1} y2="80" stroke="#1e293b" strokeWidth="0.1" strokeDasharray="1,1" />

                  {/* Gradient Background */}
                  <defs>
                    <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ec4899" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#ec4899" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>

                  {/* Area fill */}
                  <path
                    d={`M 0 100 ${stats.latencyHistory.map((h, idx) => `L ${idx} ${100 - (h.latencyMs / maxLatency) * 85}`).join(' ')} L ${stats.latencyHistory.length - 1} 100 Z`}
                    fill="url(#latencyGradient)"
                  />

                  {/* Smooth line path */}
                  <path
                    d={stats.latencyHistory.map((h, idx) => `${idx === 0 ? 'M' : 'L'} ${idx} ${100 - (h.latencyMs / maxLatency) * 85}`).join(' ')}
                    fill="none"
                    stroke="#ec4899"
                    strokeWidth="0.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Dynamic Hotpoints */}
                  {stats.latencyHistory.map((h, idx) => (
                    <circle
                      key={idx}
                      cx={idx}
                      cy={100 - (h.latencyMs / maxLatency) * 85}
                      r="0.5"
                      fill="#f43f5e"
                      className="transition-all hover:r-1 hover:fill-white"
                    />
                  ))}
                </svg>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-xs text-slate-500 py-8">
                Inference sparklines render live once requests stream through.
              </div>
            )}

            {/* Custom Legend Axis */}
            <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-1 pt-1 border-t border-slate-850">
              <span>Historical Queue Flow</span>
              <span>Max Captured: {maxLatency} ms</span>
            </div>
          </div>
          
        </div>

      </div>

    </div>
  );
}

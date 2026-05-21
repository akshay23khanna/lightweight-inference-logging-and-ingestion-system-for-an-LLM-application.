import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, MessageSquare, Bot, Cpu, History, AlertTriangle } from 'lucide-react';
import { ChatMessage } from '../types.js';

interface ChatbotPanelProps {
  activeSessionId: string;
  setActiveSessionId: (id: string) => void;
  sessions: { id: string; lastActive: string; messageCount: number }[];
  refreshSessions: () => void;
  refreshTelemetry: () => void;
}

export default function ChatbotPanel({
  activeSessionId,
  setActiveSessionId,
  sessions,
  refreshSessions,
  refreshTelemetry
}: ChatbotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-flash');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load chat history for the active session
  useEffect(() => {
    let active = true;
    if (!activeSessionId) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/messages/${activeSessionId}`);
        if (!res.ok) throw new Error('Failed to load message history');
        const data = await res.json();
        if (active) {
          setMessages(data);
          setErrorMsg(null);
        }
      } catch (err: any) {
        console.error('History fetch failed:', err);
      }
    };

    fetchMessages();

    return () => {
      active = false;
    };
  }, [activeSessionId]);

  // Scroll to bottom on updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isTyping) return;

    const query = inputValue;
    setInputValue('');
    setErrorMsg(null);

    // Append local user message optimistically
    const temporaryUserMsg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 11),
      conversationId: activeSessionId,
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, temporaryUserMsg]);
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeSessionId,
          prompt: query,
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error(`Execution error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Update historical stream
      const temporaryAiMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 11),
        conversationId: activeSessionId,
        role: 'model',
        content: data.reply,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, temporaryAiMsg]);

      // Refresh parent telemetries
      refreshSessions();
      setTimeout(refreshTelemetry, 800); // short latency to ensure backend async log fully wrote to database file
    } catch (err: any) {
      console.error('Chat routing error:', err);
      setErrorMsg(err?.message || 'Transaction connection aborted.');
    } finally {
      setIsTyping(false);
    }
  };

  const createNewSession = () => {
    const newId = `session_${Math.random().toString(36).substring(2, 8)}`;
    setActiveSessionId(newId);
    setMessages([]);
    setInputValue('');
    setErrorMsg(null);
  };

  return (
    <div id="chatbot-component" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-[600px] md:h-[680px]">
      
      {/* Header bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="text-indigo-400 w-5 h-5 animate-pulse" />
          <div>
            <h2 className="text-white font-medium text-sm sm:text-base">AI Chatbot Workspace</h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>SDK Ingestion Agent Active</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Model Selector bar */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2 py-1 rounded-lg">
            <Cpu className="text-slate-400 w-3.5 h-3.5" />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs text-slate-200 bg-transparent border-none outline-none pr-6 font-medium cursor-pointer"
            >
              <option value="gemini-1.5-flash" className="bg-slate-900 text-slate-200">Gemini 1.5 Flash</option>
              <option value="gemini-1.5-pro" className="bg-slate-900 text-slate-200">Gemini 1.5 Pro</option>
              <option value="gemini-2.0-flash" className="bg-slate-900 text-slate-200">Gemini 2.0 Flash</option>
            </select>
          </div>

          <button
            onClick={createNewSession}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">New Session</span>
          </button>
        </div>
      </div>

      {/* Main chat layout */}
      <div className="flex flex-1 min-h-0">
        
        {/* Left Side: Sessions History Rail */}
        <div className="w-48 sm:w-56 bg-slate-950/60 border-r border-slate-850 flex flex-col hidden xs:flex">
          <div className="p-3 border-b border-slate-900 flex items-center gap-1.5 text-slate-400 font-medium text-xs">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <span>Chat Sessions ({sessions.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 space-y-1 scrollbar-thin">
            {sessions.map((sess) => (
              <button
                key={sess.id}
                onClick={() => {
                  setActiveSessionId(sess.id);
                  setErrorMsg(null);
                }}
                className={`w-full text-left p-2 rounded-lg transition-all flex items-start gap-2 group cursor-pointer ${
                  sess.id === activeSessionId
                    ? 'bg-indigo-950/40 border border-indigo-900/50 text-indigo-200'
                    : 'border border-transparent text-slate-400 hover:bg-slate-800/55 hover:text-slate-200'
                }`}
              >
                <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${sess.id === activeSessionId ? 'text-indigo-400' : 'text-slate-500'}`} />
                <div className="text-xs truncate min-w-0">
                  <div className="font-medium truncate">{sess.id}</div>
                  <div className="text-[10px] text-slate-500 flex justify-between mt-0.5">
                    <span>{sess.messageCount} msg{sess.messageCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </button>
            ))}

            {sessions.length === 0 && (
              <div className="text-center text-[11px] text-slate-600 mt-8 px-2">
                No archived conversations. Send a prompt to create one!
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Chat Dialog Area */}
        <div className="flex-1 flex flex-col bg-slate-900/40 min-w-0">
          
          {/* Active messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {messages.length === 0 && !isTyping && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-full bg-indigo-950 flex items-center justify-center text-indigo-400 border border-indigo-900/50 mb-3">
                  <Bot className="w-6 h-6" />
                </div>
                <h3 className="text-slate-200 font-semibold text-sm">LLM Telemetry Sandbox</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Start typing to execute a prompt sequence. Every request, latency response, and token breakdown will be captured by the **LlmLoggerSdk** and written to the DB.
                </p>
                <div className="mt-4 bg-slate-950 border border-slate-850 px-3 py-2 rounded-lg text-[10px] text-indigo-300 font-mono text-left w-full space-y-1">
                  <div>Active: {activeSessionId}</div>
                  <div>Output schema: JSON telemetry ready</div>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                }`}
              >
                {/* Avatar icon */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border text-[11px] font-bold ${
                  msg.role === 'user' 
                    ? 'bg-indigo-950 text-indigo-200 border-indigo-800' 
                    : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}>
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>

                <div className="flex flex-col">
                  <div className={`p-3 rounded-xl text-xs sm:text-[13px] leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-950/20'
                      : 'bg-slate-950 text-slate-200 border border-slate-850 rounded-tl-none font-sans'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[9px] text-slate-500 mt-1 font-mono px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 max-w-[85%] mr-auto items-start">
                <div className="w-7 h-7 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-indigo-400">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <div className="flex flex-col">
                  <div className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl rounded-tl-none flex items-center gap-1.5">
                    <span className="text-xs text-indigo-400 font-mono animate-pulse">Model processing request...</span>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce duration-500 delay-100"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce duration-500 delay-200"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce duration-500 delay-300"></span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-rose-950/30 border border-rose-900/40 p-3 rounded-xl flex items-start gap-2 mt-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-rose-200">Integration Configuration Required</div>
                  <div className="text-rose-300 mt-1">{errorMsg}</div>
                  <div className="text-[10px] text-rose-400 mt-1 font-mono">
                    Go to **Settings &gt; Secrets** to register GEMINI_API_KEY.
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Prompt Entry Form */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-850 bg-slate-950/40 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask other model features or systems explanation..."
                disabled={isTyping}
                className="flex-1 bg-slate-950 border border-slate-850 text-slate-100 text-xs sm:text-sm pl-3 pr-2 py-2 rounded-lg outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 placeholder-slate-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isTyping}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-lg transition-colors flex items-center justify-center shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
          
        </div>
      </div>
    </div>
  );
}

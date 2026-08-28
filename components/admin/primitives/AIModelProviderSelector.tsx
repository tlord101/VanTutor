import React, { useState } from 'react';
import type { AppSettings, AIProvider } from '../../../types';
import { createAvelutAI, getResponseText } from '../../../utils/inference';

interface AIModelProviderSelectorProps {
  appSettings: Partial<AppSettings>;
  onChange: (updated: Partial<AppSettings>) => void;
}

export const AIModelProviderSelector: React.FC<AIModelProviderSelectorProps> = ({
  appSettings,
  onChange,
}) => {
  const [testPrompt, setTestPrompt] = useState("Explain Newton's Second Law in 2 concise sentences with an equation.");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; latencyMs: number; error?: string } | null>(null);

  const activeProvider: AIProvider = appSettings.primary_ai_provider || 'gemini';

  const handleTestInference = async () => {
    setIsTesting(true);
    setTestResult(null);
    const startTime = Date.now();

    try {
      const client = createAvelutAI(appSettings as AppSettings, null);
      if (!client) {
        throw new Error('AI client could not be instantiated. Please check API Key.');
      }

      const response = await client.models.generateContent({
        contents: testPrompt,
        config: {
          temperature: 0.7,
        },
      });

      const latencyMs = Date.now() - startTime;
      const text = getResponseText(response);
      setTestResult({ text, latencyMs });
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      setTestResult({ text: '', latencyMs, error: err.message || 'Unknown error' });
    } finally {
      setIsTesting(false);
    }
  };

  const updateFeatureModel = (feature: string, model: string) => {
    const usageSettings = appSettings.usage_settings || ({} as any);
    const featureModels = { ...(usageSettings.feature_models || {}) };
    featureModels[feature] = model;

    onChange({
      ...appSettings,
      usage_settings: {
        ...usageSettings,
        feature_models: featureModels,
      } as any,
    });
  };

  return (
    <div className="bg-white dark:bg-[#0A0A0A] p-6 sm:p-7 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-[#0066FF]">
            <i className="bi bi-cpu-fill text-xl"></i>
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">AI Text & Reasoning Engine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure global LLM provider for Avelut AI Chat, Visual Solver, and Study Guides</p>
          </div>
        </div>

        {/* Global Active Provider Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50">
          <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-pulse"></span>
          <span className="text-xs font-bold text-[#002D62] dark:text-blue-300">
            Active: {activeProvider === 'alibaba_qwen' ? 'Alibaba Qwen (DashScope)' : 'Google Gemini'}
          </span>
        </div>
      </div>

      {/* Provider Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Google Gemini Card */}
        <div
          onClick={() => onChange({ ...appSettings, primary_ai_provider: 'gemini' })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            activeProvider === 'gemini'
              ? 'border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-[#0066FF]/20'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Google AI Studio</span>
            {activeProvider === 'gemini' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-black uppercase tracking-wider">Selected</span>
            )}
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <i className="bi bi-stars text-[#0066FF]"></i> Google Gemini Engine
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Gemini 3.1 Flash-Lite, 2.5 Flash, and 2.5 Pro multimodal reasoning.</p>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-[#0A0A0A] p-2 rounded-lg border border-slate-200 dark:border-white/10">
            Model: {appSettings.primary_gemini_model || 'gemini-3.1-flash-lite'}
          </div>
        </div>

        {/* Alibaba Cloud Qwen Card */}
        <div
          onClick={() => onChange({ ...appSettings, primary_ai_provider: 'alibaba_qwen' })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            activeProvider === 'alibaba_qwen'
              ? 'border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-[#0066FF]/20'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Alibaba Cloud DashScope</span>
            {activeProvider === 'alibaba_qwen' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-black uppercase tracking-wider">Selected</span>
            )}
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <i className="bi bi-cloud-check-fill text-[#0066FF]"></i> Alibaba Qwen Engine
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">High-speed reasoning with Qwen3.7-Flash model studio instance.</p>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-white dark:bg-[#0A0A0A] p-2 rounded-lg border border-slate-200 dark:border-white/10">
            Model: qwen3.7-flash (Hardcoded)
          </div>
        </div>
      </div>

      {/* Provider Credentials & Parameters */}
      <div className="space-y-4 pt-2">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Provider API Keys</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Gemini API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Google Gemini API Key</label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={appSettings.gemini_api_key || ''}
              onChange={(e) => onChange({ ...appSettings, gemini_api_key: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
          </div>

          {/* Gemini Primary Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Gemini Default Model</label>
            <input
              type="text"
              placeholder="gemini-3.1-flash-lite"
              value={appSettings.primary_gemini_model || ''}
              onChange={(e) => onChange({ ...appSettings, primary_gemini_model: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
          </div>

          {/* Alibaba API Key */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Alibaba DashScope / Model Studio API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={appSettings.alibaba_api_key || ''}
              onChange={(e) => onChange({ ...appSettings, alibaba_api_key: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
            <p className="text-[11px] text-slate-400">Can also be supplied via VITE_ALIBABA_API_KEY environment variable.</p>
          </div>
        </div>
      </div>

      {/* Per-Feature Model Overrides */}
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Feature Model Overrides</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { key: 'chat_interaction', label: 'Avelut AI Chat' },
            { key: 'visual_solve', label: 'Visual Solver' },
            { key: 'study_guide_extraction', label: 'Syllabus Extraction' },
            { key: 'ai_quiz_generation', label: 'Quiz Generation' },
            { key: 'flashcard_generation', label: 'Flashcard Gen' },
            { key: 'title_generation', label: 'Title Summaries' },
          ].map((item) => (
            <div key={item.key} className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{item.label}</label>
              <input
                type="text"
                placeholder={activeProvider === 'alibaba_qwen' ? 'qwen-plus' : 'gemini-3.1-flash-lite'}
                value={(appSettings.usage_settings?.feature_models as any)?.[item.key] || ''}
                onChange={(e) => updateFeatureModel(item.key, e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Live AI Test Prompt & Latency Checker */}
      <div className="p-5 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-[#002D62] dark:text-blue-300 flex items-center gap-1.5">
            <i className="bi bi-lightning-charge-fill text-[#0066FF]"></i> Live AI Model Benchmark & Test
          </h4>
          {testResult && (
            <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#0A0A0A] border border-blue-200 dark:border-blue-800/40 text-[10px] font-mono font-bold text-[#0066FF]">
              ⚡ {testResult.latencyMs}ms
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Type a test prompt..."
            className="flex-1 p-3 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
          />
          <button
            type="button"
            onClick={handleTestInference}
            disabled={isTesting}
            className="px-5 py-3 rounded-xl bg-[#0066FF] hover:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <i className={`bi ${isTesting ? 'bi-arrow-repeat animate-spin' : 'bi-send-fill'}`}></i>
            <span>{isTesting ? 'Testing...' : 'Test Response'}</span>
          </button>
        </div>

        {testResult && (
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-xs space-y-1">
            {testResult.error ? (
              <p className="text-rose-600 dark:text-rose-400 font-bold">❌ Error: {testResult.error}</p>
            ) : (
              <div>
                <p className="font-bold text-slate-900 dark:text-white mb-1">Response:</p>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{testResult.text}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

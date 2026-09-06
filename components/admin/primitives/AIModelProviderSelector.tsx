import React, { useState } from 'react';
import type { AppSettings } from '../../../types';
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

  const activeModel = appSettings.alibaba_model || 'qwen3.7-flash';

  const handleTestInference = async () => {
    setIsTesting(true);
    setTestResult(null);
    const startTime = Date.now();

    try {
      const client = createAvelutAI(appSettings as AppSettings, null);
      if (!client) {
        throw new Error('Alibaba DashScope client could not be instantiated. Please verify your Alibaba API Key.');
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
            <h3 className="text-base font-black text-slate-900 dark:text-white">Alibaba Qwen AI Engine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Flagship LLM reasoning for Avelut AI Chat, Visual Solver, and Syllabus Study Guides</p>
          </div>
        </div>

        {/* Active Provider Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50">
          <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-pulse"></span>
          <span className="text-xs font-bold text-[#002D62] dark:text-blue-300">
            Active: Alibaba Qwen (DashScope)
          </span>
        </div>
      </div>

      {/* Provider Card */}
      <div className="p-5 rounded-2xl border-2 border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-[#0066FF]/20">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Alibaba Cloud DashScope</span>
          <span className="px-2 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-black uppercase tracking-wider">Default & Active</span>
        </div>
        <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-1">
          <i className="bi bi-cloud-check-fill text-[#0066FF]"></i> Alibaba Qwen Reasoning & Vision
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          High-performance flagship reasoning and vision analysis powered by Qwen3.7-Flash, Qwen-Plus, Qwen-Max, and Qwen-VL.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {['qwen3.7-flash', 'qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-vl-plus'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...appSettings, alibaba_model: m })}
              className={`px-2.5 py-1 text-xs font-mono rounded-lg transition border cursor-pointer ${
                activeModel === m
                  ? 'bg-[#0066FF] text-white border-[#0066FF]'
                  : 'bg-white dark:bg-[#0A0A0A] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-blue-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Provider Credentials & Parameters */}
      <div className="space-y-4 pt-2">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Alibaba DashScope Credentials</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">DashScope / Model Studio API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={appSettings.alibaba_api_key || ''}
              onChange={(e) => onChange({ ...appSettings, alibaba_api_key: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
            <p className="text-[11px] text-slate-400">Can also be supplied via VITE_ALIBABA_API_KEY environment variable.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Default Model Name</label>
            <input
              type="text"
              placeholder="qwen3.7-flash"
              value={appSettings.alibaba_model || ''}
              onChange={(e) => onChange({ ...appSettings, alibaba_model: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
            <p className="text-[11px] text-slate-400">E.g. qwen3.7-flash, qwen-plus, or qwen-max.</p>
          </div>
        </div>
      </div>

      {/* Per-Feature Model Overrides */}
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Feature Model Overrides (Qwen Models)</h4>
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
                placeholder="qwen-plus"
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
            <i className="bi bi-lightning-charge-fill text-[#0066FF]"></i> Live Alibaba Qwen Benchmark & Test
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

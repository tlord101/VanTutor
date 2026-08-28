import React, { useState } from 'react';
import type { AppSettings, VoiceProvider } from '../../../types';
import { unifiedVoiceRouter } from '../../../services/voice/UnifiedVoiceRouter';

interface VoiceProviderSelectorProps {
  appSettings: Partial<AppSettings>;
  onChange: (updated: Partial<AppSettings>) => void;
}

export const VoiceProviderSelector: React.FC<VoiceProviderSelectorProps> = ({
  appSettings,
  onChange,
}) => {
  const [testText, setTestText] = useState("Hello! Welcome to Avelut. This is a real-time speech preview.");
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [activePlayer, setActivePlayer] = useState<any>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const activeProvider = appSettings.active_voice_provider || 'grok';
  const studyguideProvider = appSettings.studyguide_voice_provider || activeProvider;
  const notebookProvider = appSettings.notebook_voice_provider || activeProvider;

  const handlePlayPreview = (targetProvider: VoiceProvider) => {
    if (isPlayingPreview && activePlayer) {
      activePlayer.stop?.();
      unifiedVoiceRouter.stopAudio();
      setIsPlayingPreview(false);
      setActivePlayer(null);
      setTestStatus(null);
      return;
    }

    setIsPlayingPreview(true);
    setTestStatus(`Synthesizing with ${targetProvider.toUpperCase()}...`);

    const player = unifiedVoiceRouter.playSpeech(testText, {
      provider: targetProvider,
      appSettings: appSettings as AppSettings,
      onStart: () => {
        setTestStatus(`Playing audio with ${targetProvider.toUpperCase()}...`);
      },
      onEnd: () => {
        setIsPlayingPreview(false);
        setActivePlayer(null);
        setTestStatus('Preview completed successfully.');
      },
      onError: (err) => {
        setIsPlayingPreview(false);
        setActivePlayer(null);
        setTestStatus(`Error: ${err.message}`);
      },
    });

    setActivePlayer(player);
  };

  return (
    <div className="bg-white dark:bg-[#0A0A0A] p-6 sm:p-7 rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center text-[#0066FF]">
            <i className="bi bi-soundwave text-xl"></i>
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Voice & Speech Synthesis Providers</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure TTS engines for Study Guide and Notebook audio tutorials</p>
          </div>
        </div>

        {/* Global Active Provider Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50">
          <span className="w-2 h-2 rounded-full bg-[#0066FF] animate-pulse"></span>
          <span className="text-xs font-bold text-[#002D62] dark:text-blue-300">
            Active: {activeProvider === 'grok' ? 'Grok Altair (xAI)' : activeProvider === 'alibaba' ? 'Alibaba CosyVoice' : activeProvider === 'kitten' ? 'KittenML' : 'Browser'}
          </span>
        </div>
      </div>

      {/* Provider Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Grok AI (Altair) */}
        <div
          onClick={() => onChange({ ...appSettings, active_voice_provider: 'grok', studyguide_voice_provider: 'grok', notebook_voice_provider: 'grok' })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            activeProvider === 'grok'
              ? 'border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-[#0066FF]/20'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Current Default</span>
            {activeProvider === 'grok' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-black uppercase tracking-wider">Selected</span>
            )}
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <i className="bi bi-stars text-[#0066FF]"></i> Grok AI (xAI) Altair
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Ultra-natural human cadence, timestamps sync & high emotional range.</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePlayPreview('grok'); }}
            className="w-full py-2 px-3 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <i className={`bi ${isPlayingPreview ? 'bi-stop-fill text-rose-500' : 'bi-play-fill text-[#0066FF]'}`}></i>
            {isPlayingPreview ? 'Stop Test' : 'Test Grok Altair'}
          </button>
        </div>

        {/* Alibaba Cloud (DashScope CosyVoice) */}
        <div
          onClick={() => onChange({ ...appSettings, active_voice_provider: 'alibaba', studyguide_voice_provider: 'alibaba', notebook_voice_provider: 'alibaba' })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            activeProvider === 'alibaba'
              ? 'border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-[#0066FF]/20'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Alibaba Cloud</span>
            {activeProvider === 'alibaba' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-black uppercase tracking-wider">Selected</span>
            )}
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <i className="bi bi-cloud-arrow-up text-[#0066FF]"></i> Alibaba CosyVoice
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">CosyVoice Flash (cosyvoice-v3-flash, Catherine) TTS synthesis.</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePlayPreview('alibaba'); }}
            className="w-full py-2 px-3 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <i className={`bi ${isPlayingPreview ? 'bi-stop-fill text-rose-500' : 'bi-play-fill text-[#0066FF]'}`}></i>
            {isPlayingPreview ? 'Stop Test' : 'Test Alibaba Voice'}
          </button>
        </div>

        {/* KittenML / Local KittenTTS */}
        <div
          onClick={() => onChange({ ...appSettings, active_voice_provider: 'kitten', studyguide_voice_provider: 'kitten', notebook_voice_provider: 'kitten' })}
          className={`p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            activeProvider === 'kitten'
              ? 'border-[#0066FF] bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-2 ring-[#0066FF]/20'
              : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">On-Device / Cloud</span>
            {activeProvider === 'kitten' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0066FF] text-white text-[10px] font-black uppercase tracking-wider">Selected</span>
            )}
          </div>
          <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mb-1">
            <i className="bi bi-cpu text-[#0066FF]"></i> KittenTTS (Bella)
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Lightweight fallback running on-device or KittenML cloud API.</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handlePlayPreview('kitten'); }}
            className="w-full py-2 px-3 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <i className={`bi ${isPlayingPreview ? 'bi-stop-fill text-rose-500' : 'bi-play-fill text-[#0066FF]'}`}></i>
            {isPlayingPreview ? 'Stop Test' : 'Test Kitten Voice'}
          </button>
        </div>
      </div>

      {/* Feature-Level Routing Overrides */}
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-4">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Context Routing Overrides</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Study Guide Voice Tutorials</label>
            <select
              value={studyguideProvider}
              onChange={(e) => onChange({ ...appSettings, studyguide_voice_provider: e.target.value as VoiceProvider })}
              className="w-full p-3 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold outline-none focus:border-[#0066FF]"
            >
              <option value="grok">Grok Altair (xAI)</option>
              <option value="alibaba">Alibaba CosyVoice</option>
              <option value="kitten">KittenTTS</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Notebook Voice Tutorials</label>
            <select
              value={notebookProvider}
              onChange={(e) => onChange({ ...appSettings, notebook_voice_provider: e.target.value as VoiceProvider })}
              className="w-full p-3 rounded-xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold outline-none focus:border-[#0066FF]"
            >
              <option value="grok">Grok Altair (xAI)</option>
              <option value="alibaba">Alibaba CosyVoice</option>
              <option value="kitten">KittenTTS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Provider API Keys & Model Parameters */}
      <div className="space-y-4 pt-2">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Provider Credentials & Parameters</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Alibaba API Key */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Alibaba Cloud DashScope / Model Studio API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              value={appSettings.alibaba_api_key || ''}
              onChange={(e) => onChange({ ...appSettings, alibaba_api_key: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
            <p className="text-[11px] text-slate-400">Can also be supplied via VITE_ALIBABA_API_KEY environment variable.</p>
          </div>

          {/* Grok API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Grok xAI API Key (Optional Override)</label>
            <input
              type="password"
              placeholder="xai-..."
              value={appSettings.grok_api_key || ''}
              onChange={(e) => onChange({ ...appSettings, grok_api_key: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
          </div>

          {/* Grok Voice ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Grok Voice ID</label>
            <input
              type="text"
              placeholder="altair"
              value={appSettings.grok_voice_id || 'altair'}
              onChange={(e) => onChange({ ...appSettings, grok_voice_id: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs outline-none focus:border-[#0066FF]"
            />
          </div>
        </div>
      </div>

      {/* Live Status indicator */}
      {testStatus && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 text-xs font-medium text-[#002D62] dark:text-blue-300 flex items-center gap-2">
          <i className="bi bi-info-circle-fill text-[#0066FF]"></i>
          <span>{testStatus}</span>
        </div>
      )}
    </div>
  );
};

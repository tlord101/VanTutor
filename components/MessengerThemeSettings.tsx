import React from 'react';
import { useTheme, type MessengerTheme } from '../contexts/ThemeContext';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

interface MessengerThemeSettingsProps {
    onNavigate: (route: string) => void;
}

export const MessengerThemeSettings: React.FC<MessengerThemeSettingsProps> = ({ onNavigate }) => {
    const { messengerTheme, setMessengerTheme, mode } = useTheme();

    const themes: { id: MessengerTheme; name: string; senderBg: string; senderFg: string }[] = [
        { id: 'default', name: 'Default App Color', senderBg: 'var(--primary)', senderFg: 'var(--primary-foreground)' },
        { id: 'neon', name: 'Neon Pink', senderBg: '#F0ABFC', senderFg: '#4A044E' },
        { id: 'sunset', name: 'Sunset Orange', senderBg: '#FB923C', senderFg: '#FFF7ED' },
        { id: 'forest', name: 'Forest Green', senderBg: '#4ADE80', senderFg: '#064E3B' },
        { id: 'midnight', name: 'Midnight Indigo', senderBg: '#818CF8', senderFg: '#1E1B4B' },
    ];

    return (
        <div className="p-4 sm:p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 max-w-4xl mx-auto h-full flex flex-col">
            <div className="flex items-center gap-4 mb-2">
                <button 
                    onClick={() => onNavigate('settings')}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Messenger Theme</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Customize your chat experience.</p>
                </div>
            </div>

            {/* Chat Preview */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl p-4 sm:p-6 shadow-sm mb-4">
                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4 uppercase tracking-wider">Live Preview</h3>
                <div className="flex flex-col gap-4 max-w-sm mx-auto bg-slate-50 dark:bg-[#002D62]/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    
                    {/* Receiver Bubble */}
                    <div className="flex items-end gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                        <div 
                            className="px-4 py-2 rounded-2xl rounded-bl-sm max-w-[85%] text-sm"
                            style={{ backgroundColor: 'var(--msg-receiver-bg)', color: 'var(--msg-receiver-fg)' }}
                        >
                            Hey! Have you checked out the new themes yet?
                        </div>
                    </div>

                    {/* Sender Bubble */}
                    <div className="flex justify-end">
                        <div 
                            className="px-4 py-2 rounded-2xl rounded-br-sm max-w-[85%] text-sm font-medium shadow-sm"
                            style={{ backgroundColor: 'var(--msg-sender-bg)', color: 'var(--msg-sender-fg)' }}
                        >
                            Yes! They look absolutely stunning. ✨
                        </div>
                    </div>

                </div>
            </div>

            {/* Theme Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {themes.map((theme) => {
                    const isSelected = messengerTheme === theme.id;
                    return (
                        <button
                            key={theme.id}
                            onClick={() => setMessengerTheme(theme.id)}
                            className={`relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                                isSelected 
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md shadow-purple-500/10 scale-[1.02]' 
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-card hover:border-slate-300 dark:hover:border-slate-600 hover:scale-[1.01]'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-4 w-full">
                                <div className="flex items-center gap-1.5 w-16 h-8 rounded-full p-1" style={{ backgroundColor: 'var(--msg-receiver-bg)' }}>
                                    <div className="w-6 h-6 rounded-full bg-slate-300/50" />
                                    <div className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: theme.id === 'default' ? 'var(--primary)' : theme.senderBg }} />
                                </div>
                                {isSelected && (
                                    <CheckCircle2 className="w-6 h-6 text-purple-500 animate-in zoom-in" />
                                )}
                            </div>
                            <h3 className={`font-bold text-lg ${isSelected ? 'text-purple-700 dark:text-purple-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                {theme.name}
                            </h3>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

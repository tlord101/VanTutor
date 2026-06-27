import React from 'react';
import { useTheme, type AppTheme } from '../contexts/ThemeContext';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

interface AppThemeSettingsProps {
    onNavigate: (route: string) => void;
}

export const AppThemeSettings: React.FC<AppThemeSettingsProps> = ({ onNavigate }) => {
    const { appTheme, setAppTheme } = useTheme();

    const themes: { id: AppTheme; name: string; color: string; hex: string }[] = [
        { id: 'blue', name: 'Ocean Blue', color: 'bg-[#0088CC]', hex: '#0088CC' },
        { id: 'emerald', name: 'Emerald Green', color: 'bg-[#10B981]', hex: '#10B981' },
        { id: 'violet', name: 'Royal Violet', color: 'bg-[#8B5CF6]', hex: '#8B5CF6' },
        { id: 'rose', name: 'Rose Red', color: 'bg-[#F43F5E]', hex: '#F43F5E' },
        { id: 'amber', name: 'Sunset Amber', color: 'bg-[#F59E0B]', hex: '#F59E0B' },
    ];

    return (
        <div className="p-4 sm:p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 max-w-4xl mx-auto h-full flex flex-col">
            <div className="flex items-center gap-4 mb-6">
                <button 
                    onClick={() => onNavigate('settings')}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">App Theme</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">Choose a primary color for the application.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {themes.map((theme) => {
                    const isSelected = appTheme === theme.id;
                    return (
                        <button
                            key={theme.id}
                            onClick={() => setAppTheme(theme.id)}
                            className={`relative flex flex-col p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                                isSelected 
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10 scale-[1.02]' 
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-card hover:border-slate-300 dark:hover:border-slate-600 hover:scale-[1.01]'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className={`w-12 h-12 rounded-full shadow-inner border border-white/20`} style={{ backgroundColor: theme.hex }} />
                                {isSelected && (
                                    <CheckCircle2 className="w-6 h-6 text-blue-500 animate-in zoom-in" />
                                )}
                            </div>
                            <h3 className={`font-bold text-lg ${isSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                {theme.name}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Apply this palette globally.
                            </p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

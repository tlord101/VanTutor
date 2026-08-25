import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
    label: string;
    path: string;
    icon?: React.ReactNode;
}

interface BreadcrumbNavigationProps {
    items: BreadcrumbItem[];
    onNavigate: (path: string) => void;
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({ items, onNavigate }) => {
    return (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 sm:gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm transition-all overflow-x-auto custom-scrollbar">
            <button
                type="button"
                onClick={() => onNavigate('/admin/schools')}
                className="flex items-center gap-1.5 hover:text-amber-500 dark:hover:text-amber-400 transition-colors shrink-0"
            >
                <Home className="w-3.5 h-3.5 text-amber-500" />
                <span>Admin</span>
            </button>

            {items.map((item, index) => {
                const isLast = index === items.length - 1;
                return (
                    <React.Fragment key={item.path || index}>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                        {isLast ? (
                            <span className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white shrink-0 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg">
                                {item.icon}
                                <span className="truncate max-w-[180px] sm:max-w-[240px]">{item.label}</span>
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onNavigate(item.path)}
                                className="flex items-center gap-1.5 hover:text-amber-500 dark:hover:text-amber-400 transition-colors shrink-0"
                            >
                                {item.icon}
                                <span className="truncate max-w-[140px] sm:max-w-[180px]">{item.label}</span>
                            </button>
                        )}
                    </React.Fragment>
                );
            })}
        </nav>
    );
};

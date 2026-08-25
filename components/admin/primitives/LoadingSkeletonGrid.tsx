import React from 'react';

interface LoadingSkeletonGridProps {
    variant?: 'grid' | 'table' | 'studio';
    count?: number;
}

export const LoadingSkeletonGrid: React.FC<LoadingSkeletonGridProps> = ({
    variant = 'grid',
    count = 6,
}) => {
    if (variant === 'table') {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-4 animate-pulse">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="h-6 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
                </div>
                <div className="space-y-3">
                    {Array.from({ length: count }).map((_, idx) => (
                        <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl gap-4">
                            <div className="space-y-2 flex-1">
                                <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                                <div className="h-3 w-1/4 bg-slate-200 dark:bg-slate-700/60 rounded-md" />
                            </div>
                            <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
                            <div className="h-8 w-8 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (variant === 'studio') {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-pulse">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div className="h-6 w-40 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="h-48 bg-slate-100 dark:bg-slate-800/60 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700" />
                    <div className="h-20 bg-slate-50 dark:bg-slate-800/40 rounded-2xl" />
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
                    <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="h-16 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 flex items-center justify-between">
                                <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                                <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {Array.from({ length: count }).map((_, idx) => (
                <div
                    key={idx}
                    className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
                >
                    <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                        <div className="h-6 w-16 bg-slate-100 dark:bg-slate-800/80 rounded-full" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                        <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-800/60 rounded-md" />
                    </div>
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded-md" />
                        <div className="h-8 w-8 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                    </div>
                </div>
            ))}
        </div>
    );
};

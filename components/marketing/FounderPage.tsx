import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import { SEOHead } from '../SEOHead';

interface CoFounder {
    id: string;
    name: string;
    role: string;
    description: string;
    bio: string;
    imageUrl: string;
}

export const FounderPage: React.FC<{ founderId: string }> = ({ founderId }) => {
    const [founder, setFounder] = useState<CoFounder | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFounder = async () => {
            try {
                const docRef = ref(db, `coFounders/${founderId}`);
                const docSnap = await get(docRef);
                if (docSnap.exists()) {
                    setFounder({ id: docSnap.key, ...docSnap.val() } as CoFounder);
                }
            } catch (error) {
                console.error("Error fetching founder:", error);
            } finally {
                setLoading(false);
            }
        };

        if (founderId) {
            fetchFounder();
        }
    }, [founderId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-800 border-t-amber-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!founder) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Founder Not Found</h1>
                <p className="text-slate-600 dark:text-slate-400 mb-8">The founder profile you are looking for does not exist.</p>
                <button 
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/about');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition cursor-pointer"
                >
                    Back to About Us
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-amber-500 selection:text-slate-950">
            <SEOHead 
                title={founder.name}
                description={founder.description}
                url={`https://avelut.xyz/founder/${founderId}`}
                ogImage={founder.imageUrl}
            />
            
            <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">
                <button 
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/about');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }}
                    className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition mb-12 font-bold cursor-pointer"
                >
                    <i className="bi bi-arrow-left text-lg"></i> Back to About Us
                </button>

                <div className="bg-white dark:bg-slate-900 rounded-[32px] p-8 md:p-12 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-12">
                    <div className="w-full md:w-1/3 shrink-0">
                        <div className="w-full aspect-square rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800 relative shadow-inner">
                            {founder.imageUrl ? (
                                <img src={founder.imageUrl} alt={founder.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 space-y-6">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-2">{founder.name}</h1>
                            <p className="text-xl text-amber-500 font-bold">{founder.role}</p>
                        </div>
                        
                        <div className="w-16 h-1 bg-amber-500 rounded-full"></div>
                        
                        <div className="prose prose-lg prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {founder.bio || founder.description}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

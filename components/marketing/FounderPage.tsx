import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { SEOHead } from '../SEOHead';
import { ArrowLeft } from 'lucide-react';

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
                const docRef = doc(db, 'coFounders', founderId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setFounder({ id: docSnap.id, ...docSnap.data() } as CoFounder);
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
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
            </div>
        );
    }

    if (!founder) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
                <h1 className="text-3xl font-bold text-slate-900 mb-4">Founder Not Found</h1>
                <p className="text-slate-600 mb-8">The founder profile you are looking for does not exist.</p>
                <button 
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/about');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }}
                    className="px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition"
                >
                    Back to About Us
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-brand-500 selection:text-white">
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
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition mb-12 font-semibold"
                >
                    <ArrowLeft className="w-5 h-5" /> Back to About Us
                </button>

                <div className="bg-white rounded-[32px] p-8 md:p-12 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col md:flex-row gap-12">
                    <div className="w-full md:w-1/3 shrink-0">
                        <div className="w-full aspect-square rounded-[24px] overflow-hidden bg-slate-100 relative shadow-inner">
                            {founder.imageUrl ? (
                                <img src={founder.imageUrl} alt={founder.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 space-y-6">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-2">{founder.name}</h1>
                            <p className="text-xl text-brand-600 font-bold">{founder.role}</p>
                        </div>
                        
                        <div className="w-16 h-1 bg-brand-500 rounded-full"></div>
                        
                        <div className="prose prose-lg prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {founder.bio || founder.description}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

import { db, get, orderByChild, query, ref } from '@/lib/backend';
import React, { useEffect, useState } from 'react';
import { SEOHead } from '../SEOHead';

interface CoFounder {
    id: string;
    name: string;
    role: string;
    description: string;
    bio: string;
    imageUrl: string;
    order: number;
}

export const AboutUsPage: React.FC = () => {
    const [founders, setFounders] = useState<CoFounder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFounders = async () => {
            try {
                const foundersRef = query(ref(db, 'coFounders'), orderByChild('order'));
                const snapshot = await get(foundersRef);
                if (snapshot.exists()) {
                    const foundersData: CoFounder[] = [];
                    snapshot.forEach((childSnapshot) => {
                        foundersData.push({ id: childSnapshot.key, ...childSnapshot.val() } as CoFounder);
                    });
                    setFounders(foundersData);
                }
            } catch (error) {
                console.error("Error fetching co-founders:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFounders();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-amber-500 selection:text-slate-950">
            <SEOHead 
                title="About Us"
                description="Learn more about Avelut's mission to revolutionize education with AI, and meet the founders behind the vision."
                url="https://avelut.xyz/about"
            />
            
            <div className="max-w-7xl mx-auto px-6 py-12 md:py-20">
                <button 
                    onClick={() => {
                        if (typeof window !== 'undefined') {
                            window.history.pushState(null, '', '/');
                            window.dispatchEvent(new Event('popstate'));
                        }
                    }}
                    className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition mb-12 font-semibold cursor-pointer"
                >
                    <i className="bi bi-arrow-left text-base"></i>
                    <span>Back to Home</span>
                </button>

                <div className="text-center max-w-3xl mx-auto space-y-6 mb-24">
                    <h1 className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight">Our Mission</h1>
                    <p className="text-xl text-slate-600 dark:text-slate-400 leading-relaxed">
                        At Avelut, we believe that personalized education is a fundamental right, not a privilege. We are building the world's most advanced AI ecosystem to ensure every student has a tutor, a guide, and a mentor available 24/7.
                    </p>
                </div>

                <div className="mb-16 text-center">
                    <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">Meet the Founders</h2>
                    <p className="text-lg text-slate-500 dark:text-slate-400">The visionaries powering the future of learning.</p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-800 border-t-amber-500 rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {founders.map((founder) => (
                            <div key={founder.id} className="bg-white dark:bg-slate-900 rounded-[32px] p-6 shadow-xl border border-slate-200 dark:border-slate-800 hover:-translate-y-2 transition duration-300 flex flex-col group">
                                <div className="w-full aspect-square rounded-[24px] overflow-hidden bg-slate-100 dark:bg-slate-800 mb-6 relative">
                                    {founder.imageUrl ? (
                                        <img src={founder.imageUrl} alt={founder.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">{founder.name}</h3>
                                <p className="text-amber-500 font-bold mb-4">{founder.role}</p>
                                <p className="text-slate-600 dark:text-slate-300 mb-8 flex-grow">{founder.description}</p>
                                
                                <button
                                    onClick={() => {
                                        if (typeof window !== 'undefined') {
                                            window.history.pushState(null, '', `/founder/${founder.id}`);
                                            window.dispatchEvent(new Event('popstate'));
                                        }
                                    }}
                                    className="w-full py-4 bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 dark:hover:bg-amber-500 dark:hover:text-slate-950 text-slate-900 dark:text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer"
                                >
                                    <span>Read Full Bio</span>
                                    <i className="bi bi-arrow-right text-sm"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

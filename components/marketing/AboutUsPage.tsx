import React, { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { SEOHead } from '../SEOHead';
import { ArrowLeft, ArrowRight } from 'lucide-react';

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
                const q = query(collection(db, 'coFounders'), orderBy('order', 'asc'));
                const snapshot = await getDocs(q);
                const foundersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CoFounder));
                setFounders(foundersData);
            } catch (error) {
                console.error("Error fetching co-founders:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchFounders();
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-black font-sans selection:bg-brand-500 selection:text-white">
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
                    className="flex items-center gap-2 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white transition mb-12 font-semibold"
                >
                    <ArrowLeft className="w-5 h-5" /> Back to Home
                </button>

                <div className="text-center max-w-3xl mx-auto space-y-6 mb-24">
                    <h1 className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white tracking-tight">Our Mission</h1>
                    <p className="text-xl text-slate-600 leading-relaxed">
                        At Avelut, we believe that personalized education is a fundamental right, not a privilege. We are building the world's most advanced AI ecosystem to ensure every student has a tutor, a guide, and a mentor available 24/7.
                    </p>
                </div>

                <div className="mb-16 text-center">
                    <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-4">Meet the Founders</h2>
                    <p className="text-lg text-slate-500 dark:text-gray-400">The visionaries powering the future of learning.</p>
                </div>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-12 h-12 border-4 border-slate-200 dark:border-white/10 border-t-brand-600 rounded-full animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {founders.map((founder) => (
                            <div key={founder.id} className="bg-white dark:bg-black rounded-[32px] p-6 shadow-xl shadow-slate-200/50 hover:-translate-y-2 transition duration-300 border border-slate-100 flex flex-col group">
                                <div className="w-full aspect-square rounded-[24px] overflow-hidden bg-slate-100 mb-6 relative">
                                    {founder.imageUrl ? (
                                        <img src={founder.imageUrl} alt={founder.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400">No Image</div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-1">{founder.name}</h3>
                                <p className="text-brand-600 font-bold mb-4">{founder.role}</p>
                                <p className="text-slate-600 mb-8 flex-grow">{founder.description}</p>
                                
                                <button
                                    onClick={() => {
                                        if (typeof window !== 'undefined') {
                                            window.history.pushState(null, '', `/founder/${founder.id}`);
                                            window.dispatchEvent(new Event('popstate'));
                                        }
                                    }}
                                    className="w-full py-4 bg-slate-50 dark:bg-black hover:bg-slate-100 text-slate-900 dark:text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition"
                                >
                                    Read Full Bio <ArrowRight className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

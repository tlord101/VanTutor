import React, { useEffect, useState } from 'react';
import { db } from '../../../firebase';
import { ref as dbRef, onValue, set } from 'firebase/database';
import { Search, Globe, Code, Download } from 'lucide-react';
import { useToast } from '../../../hooks/useToast';

interface SEOSettings {
    default_title: string;
    default_description: string;
    default_keywords: string;
    og_image_url: string;
    twitter_handle: string;
}

export const SEOSettingsView: React.FC = () => {
    const { addToast } = useToast();
    const [settings, setSettings] = useState<SEOSettings>({
        default_title: 'Avelut - An Ecosystem of Intelligence',
        default_description: 'Transforming education with AI-powered study guides, visual problem solving, and adaptive learning.',
        default_keywords: 'education, AI, study guide, past questions, learning',
        og_image_url: 'https://avelut.xyz/og-image.jpg',
        twitter_handle: '@avelut'
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [sitemapXml, setSitemapXml] = useState('');

    useEffect(() => {
        const seoRef = dbRef(db, 'seo_settings');
        const unsubscribe = onValue(seoRef, (snapshot) => {
            if (snapshot.exists()) {
                setSettings(prev => ({ ...prev, ...snapshot.val() }));
            }
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await set(dbRef(db, 'seo_settings'), settings);
            addToast('SEO Settings saved successfully', 'success');
        } catch (error: any) {
            addToast('Failed to save SEO settings: ' + error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const generateSitemap = () => {
        const baseUrl = 'https://avelut.xyz';
        const staticRoutes = [
            '/',
            '/about',
            '/contact',
            '/login',
            '/signup',
            '/upload-center'
        ];
        
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticRoutes.map(route => `  <url>
    <loc>${baseUrl}${route}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${route === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
        
        setSitemapXml(xml);
        addToast('Sitemap generated!', 'success');
    };

    const downloadSitemap = () => {
        const blob = new Blob([sitemapXml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sitemap.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return <div className="p-8 text-center text-slate-500 dark:text-[#A0ABC0] font-bold animate-pulse">Loading SEO settings...</div>;
    }

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                        <Search className="w-6 h-6 text-indigo-500" />
                        SEO & Marketing Settings
                    </h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-[#A0ABC0] mt-1">
                        Manage global metadata tags and generate sitemaps for search engines.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Meta Settings */}
                <div className="bg-white dark:bg-[#121A2F] rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm p-6 sm:p-8">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-indigo-500" /> Global Meta Tags
                    </h3>
                    <form onSubmit={handleSave} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Default Page Title</label>
                            <input 
                                type="text" 
                                required
                                value={settings.default_title} 
                                onChange={e => setSettings({...settings, default_title: e.target.value})}
                                className="w-full p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                            <p className="text-[10px] text-slate-400">Used as a fallback if a page doesn't specify its own title.</p>
                        </div>
                        
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Default Meta Description</label>
                            <textarea 
                                required
                                rows={3}
                                value={settings.default_description} 
                                onChange={e => setSettings({...settings, default_description: e.target.value})}
                                className="w-full p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all resize-none"
                            />
                            <p className="text-[10px] text-slate-400">Optimal length is 150-160 characters.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Keywords</label>
                            <input 
                                type="text" 
                                value={settings.default_keywords} 
                                onChange={e => setSettings({...settings, default_keywords: e.target.value})}
                                className="w-full p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                            <p className="text-[10px] text-slate-400">Comma-separated list of keywords.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Open Graph Image URL</label>
                            <input 
                                type="url" 
                                value={settings.og_image_url} 
                                onChange={e => setSettings({...settings, og_image_url: e.target.value})}
                                className="w-full p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                            <p className="text-[10px] text-slate-400">Image shown when sharing links on social media.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">Twitter Handle</label>
                            <input 
                                type="text" 
                                value={settings.twitter_handle} 
                                onChange={e => setSettings({...settings, twitter_handle: e.target.value})}
                                className="w-full p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#0A101F] focus:bg-white dark:bg-[#121A2F] text-sm outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <button 
                                type="submit" 
                                disabled={isSaving}
                                className="w-full px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Meta Settings'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Sitemap Generator */}
                <div className="bg-white dark:bg-[#121A2F] rounded-3xl border border-slate-200 dark:border-white/10 shadow-sm p-6 sm:p-8 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                        <Code className="w-5 h-5 text-indigo-500" /> Sitemap Generator
                    </h3>
                    
                    <p className="text-sm text-slate-600 mb-6">
                        Generate an XML sitemap to help search engines like Google index your website's pages efficiently.
                    </p>

                    <button 
                        onClick={generateSitemap}
                        className="w-full px-6 py-4 bg-slate-100 text-slate-700 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition mb-6"
                    >
                        Generate Sitemap.xml
                    </button>

                    {sitemapXml && (
                        <div className="flex-1 flex flex-col">
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Preview</label>
                            <textarea 
                                readOnly
                                value={sitemapXml}
                                className="w-full flex-1 min-h-[200px] p-4 border border-slate-200 dark:border-white/10 rounded-2xl bg-slate-900 text-emerald-400 font-mono text-xs outline-none resize-none mb-4"
                            />
                            <button 
                                onClick={downloadSitemap}
                                className="w-full px-6 py-4 border-2 border-indigo-600 text-indigo-600 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-indigo-50 transition flex items-center justify-center gap-2"
                            >
                                <Download className="w-4 h-4" /> Download sitemap.xml
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

import { db, onValue, ref as dbRef } from '@/lib/backend';
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
    title?: string;
    description?: string;
    keywords?: string;
    ogImage?: string;
    url?: string;
}

export const SEOHead: React.FC<SEOHeadProps> = ({
    title,
    description,
    keywords,
    ogImage,
    url = 'https://avelut.xyz'
}) => {
    const [seoData, setSeoData] = useState({
        default_title: 'Avelut — Live AI Tutor with Voice, Board & Unlimited Chat',
        default_description: "Avelut teaches, not only summarizes. Live Tutorial: real voice + visual board lessons. Unlimited Avelut AI chat when you're stuck. Study guides, quizzes, scan-to-solve. Free to start at avelut.xyz.",
        default_keywords: 'Avelut, live AI tutor, voice tutorial, study board, unlimited AI chat, study guide, exam practice, visual problem solver, online tutor',
        og_image_url: 'https://avelut.xyz/og-image.jpg',
        twitter_handle: '@avelut'
    });

    useEffect(() => {
        // Prefer Supabase profiles/settings; path shim may no-op until app_kv exists
        const seoRef = dbRef(db, 'seo_settings');
        const unsubscribe = onValue(seoRef, (snapshot) => {
            const val = snapshot.val();
            if (val) {
                setSeoData(prev => ({ ...prev, ...val }));
            }
        });
        return () => unsubscribe();
    }, []);

    const finalTitle = title || seoData.default_title;
    const finalDescription = description || seoData.default_description;
    const finalKeywords = keywords || seoData.default_keywords;
    const finalOgImage = ogImage || seoData.og_image_url;

    const fullTitle = finalTitle.includes('Avelut') ? finalTitle : `${finalTitle} | Avelut`;

    return (
        <Helmet>
            <title>{fullTitle}</title>
            <meta name="title" content={fullTitle} />
            <meta name="description" content={finalDescription} />
            <meta name="keywords" content={finalKeywords} />

            <meta property="og:type" content="website" />
            <meta property="og:url" content={url} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={finalDescription} />
            <meta property="og:image" content={finalOgImage} />
            <meta property="og:site_name" content="Avelut" />

            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content={url} />
            <meta property="twitter:title" content={fullTitle} />
            <meta property="twitter:description" content={finalDescription} />
            <meta property="twitter:image" content={finalOgImage} />
            {seoData.twitter_handle && <meta property="twitter:site" content={seoData.twitter_handle} />}
            {seoData.twitter_handle && <meta property="twitter:creator" content={seoData.twitter_handle} />}

            <link rel="canonical" href={url} />
        </Helmet>
    );
};

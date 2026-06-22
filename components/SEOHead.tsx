import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { db } from '../firebase';
import { ref as dbRef, onValue } from 'firebase/database';

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
        default_title: 'Avelut - AI Tutoring Platform',
        default_description: 'Upload your textbooks, snap a photo of any problem, and let Avelut\'s advanced AI engine guide you to complete mastery in minutes.',
        default_keywords: 'education, AI, study guide, past questions, learning',
        og_image_url: 'https://avelut.xyz/og-image.jpg',
        twitter_handle: '@avelut'
    });

    useEffect(() => {
        const seoRef = dbRef(db, 'seo_settings');
        const unsubscribe = onValue(seoRef, (snapshot) => {
            if (snapshot.exists()) {
                setSeoData(prev => ({ ...prev, ...snapshot.val() }));
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
            {/* Primary Meta Tags */}
            <title>{fullTitle}</title>
            <meta name="title" content={fullTitle} />
            <meta name="description" content={finalDescription} />
            <meta name="keywords" content={finalKeywords} />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content="website" />
            <meta property="og:url" content={url} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={finalDescription} />
            <meta property="og:image" content={finalOgImage} />

            {/* Twitter */}
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:url" content={url} />
            <meta property="twitter:title" content={fullTitle} />
            <meta property="twitter:description" content={finalDescription} />
            <meta property="twitter:image" content={finalOgImage} />
            {seoData.twitter_handle && <meta property="twitter:site" content={seoData.twitter_handle} />}
            {seoData.twitter_handle && <meta property="twitter:creator" content={seoData.twitter_handle} />}
            
            {/* Canonical Link */}
            <link rel="canonical" href={url} />
        </Helmet>
    );
};

import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

export const SEO: React.FC<SEOProps> = ({
  title = "Avelut — Live AI Tutor with Voice, Board & Unlimited Chat",
  description = "Avelut teaches, not only summarizes. Live Tutorial: real voice + visual board lessons (15–60 min). Unlimited Avelut AI chat when you're stuck. Study guides, quizzes, and scan-to-solve in one place. Free to start.",
  keywords = "Avelut, live AI tutor, voice tutorial, study board, unlimited AI chat, study guide, flashcards, exam practice, visual problem solver, online tutor for students, learn with AI",
  image = "https://avelut.xyz/og-image.jpg",
  url = "https://avelut.xyz/",
  type = "website",
}) => {
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "name": "Avelut",
    "url": "https://avelut.xyz",
    "logo": "https://avelut.xyz/logo_icon.png",
    "description": description,
    "sameAs": [
      "https://twitter.com/avelut",
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "email": "support@avelut.xyz"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "NGN",
      "description": "Free plan with unlimited Avelut AI chat"
    }
  };

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="AVELUT" />
      <link rel="canonical" href={url} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="Avelut" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@avelut" />

      <script type="application/ld+json">
        {JSON.stringify(schemaMarkup)}
      </script>
    </Helmet>
  );
};

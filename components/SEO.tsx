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
  title = "Avelut - AI Study Guide & Visual Problem Solver",
  description = "Transforming education with AI-powered study guides, visual problem solving, and adaptive learning.",
  keywords = "education, AI, study guide, past questions, learning, visual problem solver",
  image = "https://avelut.xyz/og-image.jpg",
  url = "https://avelut.xyz/",
  type = "website",
}) => {
  // Advanced JSON-LD Schema for Local Education Organization
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    "name": "Avelut",
    "url": "https://avelut.xyz",
    "logo": "https://avelut.xyz/logo_icon.png",
    "description": description,
    "sameAs": [
      "https://twitter.com/avelut",
      // add other social links here
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer support",
      "email": "support@avelut.xyz"
    }
  };

  return (
    <Helmet>
      {/* Standard SEO Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content="AVELUT Team" />
      <link rel="canonical" href={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:site" content="@avelut" />

      {/* JSON-LD Schema */}
      <script type="application/ld+json">
        {JSON.stringify(schemaMarkup)}
      </script>
    </Helmet>
  );
};

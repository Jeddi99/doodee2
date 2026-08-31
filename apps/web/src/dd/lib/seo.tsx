import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-url";

export const SEO_KEYWORDS = [
  "วิเคราะห์ใบหน้า",
  "วิเคราะห์รูปหน้า",
  "AI วิเคราะห์ใบหน้า",
  "คะแนนหน้าตา",
  "ดูโครงหน้า",
  "สัดส่วนใบหน้า",
  "ก่อนทำหน้า",
  "ก่อนเข้าคลินิก",
  "facial analysis",
  "face aesthetics report",
  "AI face score",
  "Thai Asian face analysis",
];

export function publicUrl(path = "/") {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function publicMetadata({
  title,
  description,
  path,
  keywords = [],
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  return {
    title,
    description,
    keywords: [...SEO_KEYWORDS, ...keywords],
    alternates: { canonical: path },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-snippet": -1,
        "max-image-preview": "large",
        "max-video-preview": -1,
      },
    },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: "DOODEE",
      locale: "th_TH",
      alternateLocale: ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "DOODEE",
    alternateName: ["ดูดี", "doodee", "DooDee", "doodee.app"],
    url: SITE_URL,
    logo: publicUrl("/doodee-logo.webp"),
    description:
      "แพลตฟอร์มวิเคราะห์ใบหน้าด้วย AI สำหรับคนไทยและเอเชีย — รายงานโครงหน้า สัดส่วน ผิว และประเด็นที่ควรถามก่อนปรึกษาคลินิก",
    sameAs: [SITE_URL],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "DOODEE",
    alternateName: ["ดูดี", "doodee", "DooDee", "doodee.app", "ดูดี AI"],
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: ["th-TH", "en-US"],
  };
}

export function webApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "DOODEE",
    url: SITE_URL,
    applicationCategory: "LifestyleApplication",
    operatingSystem: "Web",
    inLanguage: ["th-TH", "en-US"],
    description:
      "AI facial analysis report for Thai and Asian users before cosmetic consultation.",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "THB" },
      { "@type": "Offer", name: "Plus", price: "149", priceCurrency: "THB" },
      { "@type": "Offer", name: "Pro", price: "299", priceCurrency: "THB" },
    ],
  };
}

export function serviceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "DOODEE facial aesthetics report",
    serviceType: "AI facial analysis",
    url: SITE_URL,
    areaServed: { "@type": "Country", name: "Thailand" },
    audience: {
      "@type": "Audience",
      audienceType: "Thai and Asian users researching facial aesthetics",
    },
    provider: {
      "@type": "Organization",
      name: "DOODEE",
      url: SITE_URL,
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: publicUrl(item.path),
    })),
  };
}

export function faqJsonLd(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function articleJsonLd({
  title,
  description,
  path,
  publishedAt,
  category,
}: {
  title: string;
  description: string;
  path: string;
  publishedAt: string;
  category: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: publishedAt,
    dateModified: publishedAt,
    articleSection: category,
    inLanguage: "th-TH",
    image: publicUrl("/opengraph-image"),
    mainEntityOfPage: { "@type": "WebPage", "@id": publicUrl(path) },
    author: { "@type": "Organization", name: "DOODEE", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "DOODEE",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: publicUrl("/doodee-logo.webp"),
      },
    },
  };
}

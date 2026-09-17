import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const lastModified = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: base, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/analyze`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/progress`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/favorites`, lastModified, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/auth/register`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/auth/login`, lastModified, changeFrequency: "monthly", priority: 0.4 },
  ];

  return pages;
}

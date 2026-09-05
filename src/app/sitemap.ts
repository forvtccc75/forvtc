import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { VILLES_SEO } from "@/lib/seo-villes";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// Généré à la demande (jamais au build : la base n'est pas sollicitée pendant
// `next build`). Les nouvelles annonces apparaissent sans redéploiement.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const listings = await db.query.listings.findMany({ where: eq(schema.listings.statut, "publiee") });

  return [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/recherche`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/location-vtc`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/devenir-chauffeur-vtc`, changeFrequency: "monthly", priority: 0.7 },
    ...VILLES_SEO.map((v) => ({
      url: `${BASE}/location-voiture-vtc-${v.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...listings.map((l) => ({
      url: `${BASE}/annonce/${l.id}`,
      lastModified: l.publishedAt ?? l.createdAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}

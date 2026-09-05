import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Espaces privés et API exclus de l'indexation
        disallow: ["/dashboard", "/admin", "/api/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}

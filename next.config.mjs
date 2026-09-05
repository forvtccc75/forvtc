/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
  async rewrites() {
    return [
      // URLs SEO locales : /location-voiture-vtc-paris, /location-voiture-vtc-93…
      { source: "/location-voiture-vtc-:slug", destination: "/seo/ville/:slug" },
    ];
  },
};

export default nextConfig;

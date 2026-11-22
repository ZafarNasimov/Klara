import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev badge sits on top of the mobile composer.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Klara's robot (scene + image fallback) is fetched once and then served from
  // the browser cache, so the live demo's close never waits on the network.
  async headers() {
    return [
      {
        source: "/pitch/:file(klara-robot\\.splinecode|klara-robot\\.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

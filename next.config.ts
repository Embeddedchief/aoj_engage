import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@node-rs/argon2", "exceljs"],
  devIndicators: false, // no Next.js badge; the app shows its own AOJ loader
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
    // Keep visited pages in the browser router cache briefly so back/forward and menu hops are instant.
    staleTimes: { dynamic: 30, static: 300 },
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Email artwork, badges and the logo rarely change: let browsers and email proxies cache them.
      { source: "/email/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      { source: "/icon.png", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;

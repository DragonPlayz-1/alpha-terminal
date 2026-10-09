import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    const productionHeaders = process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : [];
    const scriptSource = process.env.NODE_ENV === "development" ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
      ...productionHeaders,
    ] }];
  },
};

export default nextConfig;

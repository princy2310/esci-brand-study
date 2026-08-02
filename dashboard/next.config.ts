import type { NextConfig } from "next";

// Served from https://princy2310.github.io/esci-brand-study/ on GitHub Pages, so
// production builds need the repo name as a base path. Local dev stays at root.
const basePath = process.env.NODE_ENV === "production" ? "/esci-brand-study" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

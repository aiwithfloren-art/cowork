import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // resvg-js ships native bindings (.node files) that Turbopack can't
  // bundle. Mark it server-external so Node loads it from node_modules
  // at runtime instead.
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;

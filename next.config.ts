import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/canvas",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

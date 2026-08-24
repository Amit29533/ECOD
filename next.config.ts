import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ECOD keeps all persistence behind src/data (DataAdapter interface).
  // Nothing storage-specific leaks into Next config, so swapping the
  // JSON store for Airtable/Postgres is purely an environment change.
  reactStrictMode: true,
};

export default nextConfig;

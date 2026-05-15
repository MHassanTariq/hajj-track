import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // These settings are crucial for your specific offline issue:
  cacheOnFrontEndNav: true, 
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // Keeps dev mode fast
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Any existing config you already had goes here
  reactStrictMode: true,
};

export default withPWA(nextConfig);
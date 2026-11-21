/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.unsplash.com" },
      { protocol: "https", hostname: "**.pexels.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "pixabay.com" },
      { protocol: "https", hostname: "**.pixabay.com" },
      { protocol: "https", hostname: "radarbv.com.br" },
      { protocol: "https", hostname: "www.radarbv.com.br" },
    ],
  },
};

export default nextConfig;

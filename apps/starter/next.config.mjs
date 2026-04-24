/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `standalone` makes `next build` emit a minimal server for Docker.
  output: 'standalone',
  // Transpile workspace packages so their source maps work in dev.
  transpilePackages: ['@proxies-sx/pool-sdk', '@proxies-sx/pool-portal-react'],
  // Keep native/server-only packages out of the client/edge bundle.
  serverExternalPackages: ['pg', 'nodemailer'],
};

export default nextConfig;

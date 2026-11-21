/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdf-parse', 'mammoth'],
  outputFileTracingExcludes: {
    '*': ['./data/**/*']
  }
};
export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async redirects() {
    // The human /docs page is gone: people copy a prompt to their AI, the AI reads skill.md.
    return [{ source: '/docs', destination: '/skill.md', permanent: true }]
  },
}
export default nextConfig

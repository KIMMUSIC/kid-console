/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The K-ID VPC widget is rendered inside an iframe that we load from k-id.com.
  // We only ever *embed* their widget; we never frame our own app elsewhere.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig

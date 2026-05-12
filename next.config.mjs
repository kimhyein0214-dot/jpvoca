const isGitHubPages = process.env.GITHUB_PAGES === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isGitHubPages ? "export" : undefined,
  basePath: isGitHubPages ? "/jpvoca" : undefined,
  assetPrefix: isGitHubPages ? "/jpvoca/" : undefined,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? "/jpvoca" : "",
  },
};

export default nextConfig;

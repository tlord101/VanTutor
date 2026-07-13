import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import Sitemap from 'vite-plugin-sitemap';

export default defineConfig(({ command }) => {
    return {
      // Use './' as base when building for Capacitor (native) so asset paths are relative.
      // Use '/' for Vercel web deployments so dynamic nested routes can load assets.
      base: process.env.VERCEL ? '/' : (command === 'build' ? './' : '/'),
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        Sitemap({
          hostname: 'https://www.avelut.xyz', // Change this to your actual domain
          generateRobotsTxt: false,
          dynamicRoutes: [
            '/',
            '/about',
            '/contact',
            '/t&c',
            '/policy',
            '/admin',
            '/upload-center'
          ]
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        // Ensure source maps are generated for easier debugging
        sourcemap: false,
        // Avoid chunk size warnings for large components
        chunkSizeWarningLimit: 3000,
      }
    };
});

import path from 'path';
import { execSync } from 'child_process';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import Sitemap from 'vite-plugin-sitemap';
import pkg from './package.json';

function getGitCommit(): string {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch {
        return 'dev';
    }
}

function versionManifestPlugin(): Plugin {
    return {
        name: 'vite-plugin-version-manifest',
        generateBundle() {
            const versionData = {
                version: pkg.version || '1.0.0',
                buildTimestamp: Math.floor(Date.now() / 1000),
                commit: getGitCommit()
            };
            this.emitFile({
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify(versionData, null, 2)
            });
        }
    };
}

export default defineConfig(({ command, mode }) => {
    return {
      base: process.env.VERCEL ? '/' : (command === 'build' ? './' : '/'),
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        versionManifestPlugin(),
        Sitemap({
          hostname: 'https://www.avelut.xyz',
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
          // Full Firebase removal: map SDK import paths → Supabase shims
          'firebase/app': path.resolve(__dirname, 'lib/shims/firebase-app.ts'),
          'firebase/auth': path.resolve(__dirname, 'lib/shims/firebase-auth.ts'),
          'firebase/database': path.resolve(__dirname, 'lib/database.ts'),
          'firebase/storage': path.resolve(__dirname, 'lib/shims/firebase-storage.ts'),
          'firebase/functions': path.resolve(__dirname, 'lib/shims/firebase-functions.ts'),
          'firebase/messaging': path.resolve(__dirname, 'lib/shims/firebase-messaging.ts'),
        }
      },
      build: {
        sourcemap: false,
        chunkSizeWarningLimit: 1200,
        cssCodeSplit: true,
        minify: 'esbuild',
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('@supabase')) {
                  return 'vendor-supabase';
                }
                if (id.includes('katex') || id.includes('rehype-katex') || id.includes('remark-math')) {
                  return 'vendor-katex';
                }
                if (id.includes('framer-motion')) {
                  return 'vendor-motion';
                }
                if (id.includes('@capacitor') || id.includes('@capawesome') || id.includes('@capgo')) {
                  return 'vendor-capacitor';
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-icons';
                }
                if (id.includes('html2canvas') || id.includes('jspdf') || id.includes('pdf-lib')) {
                  return 'vendor-docs';
                }
              }
            }
          }
        }
      }
    };
});

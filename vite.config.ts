
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import process from 'process';
import express from 'express';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const uploadsDir = path.resolve(__dirname, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  return {
    plugins: [
      react(),
      {
        name: 'serve-uploads',
        configureServer(server) {
          server.middlewares.use('/uploads', express.static(uploadsDir));
        },
      },
    ],
    define: {
      // No longer exposing API_KEY to the browser for security.
      // AI calls are proxied through the backend.
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom', 'recharts', 'lucide-react'],
          },
        },
      },
    },
    server: {
      host: true,
      port: 3000,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/rest': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});

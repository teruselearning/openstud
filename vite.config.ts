
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import process from 'process';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Explicitly define process.env for standard Node-style libraries
      'process.env': {
        API_KEY: JSON.stringify(env.API_KEY || '')
      },
      // Individual key for direct access
      'process.env.API_KEY': JSON.stringify(env.API_KEY || '')
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
      allowedHosts: [
        'unorderly-sonja-unlevel.ngrok-free.dev'
      ],
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

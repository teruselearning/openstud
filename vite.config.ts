
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Import process explicitly to resolve typing issues in some environments
import process from 'process';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all envs regardless of the `VITE_` prefix.
  // Using process.cwd() requires valid Node types
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Correctly inject the API_KEY from .env
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env': {
        API_KEY: JSON.stringify(env.API_KEY || '')
      }
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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Standard Vite replacement for environment variables
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ''),
    // Polyfill process.env to prevent "process is not defined" errors
    'process.env': {
       API_KEY: JSON.stringify(process.env.API_KEY || '')
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
});

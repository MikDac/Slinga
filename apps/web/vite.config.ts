import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Local dev: route API served by `pnpm --filter @slinga/route-api dev`.
      '/health': 'http://localhost:3000',
      '/v1': 'http://localhost:3000',
    },
  },
});

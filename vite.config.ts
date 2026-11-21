import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: '/pocket-tools/' — GitHub Pages 저장소 하위 경로 배포(https://<user>.github.io/pocket-tools/)에 맞춘다.
// 로컬에서 루트로 확인하려면 VITE_BASE=/ npm run build 처럼 덮어쓴다.
export default defineConfig({
  base: process.env.VITE_BASE || '/pocket-tools/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2019',
    assetsInlineLimit: 0,
  },
  server: { host: true },
  preview: { host: true, port: 4173 },
});

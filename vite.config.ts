
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // ビルド時にAPIキーが空の場合、process.env.API_KEYへのアクセスを完全に無効化せず、
  // 実行環境（ブラウザ）での動的な注入やグローバル変数を参照できるようにします。
  define: {
    // 開発環境や明示的なビルド環境変数を優先しつつ、未定義の場合は実行時参照を残す
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || undefined)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

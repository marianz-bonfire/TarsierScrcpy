import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, Plugin } from 'vite';
import vuetify from 'vite-plugin-vuetify';
import Binary from './plugins/binary-loader.js';
import Markdown from './plugins/md-loader.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    Markdown() as Plugin,
    Binary() as Plugin,
  ],
  base: '/TarsierScrcpy/', // Must match the GitHub repository name (GitHub Pages project site path)
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});

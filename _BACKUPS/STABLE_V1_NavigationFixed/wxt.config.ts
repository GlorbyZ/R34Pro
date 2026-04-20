import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Rule34 WebReframer',
    description: 'Brings a premium, dynamic flowing layout to Rule34.xxx with SPA slideshow and lightbox.',
    permissions: ['downloads'],
    host_permissions: ['*://rule34.xxx/*', '*://*.rule34.xxx/*'],
  },
});

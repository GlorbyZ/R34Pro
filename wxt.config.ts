import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'R34 Pro',
    description: 'A premium, high-fidelity gallery navigation engine for Rule34.xxx with stable slideshow, lightbox, and bulk download.',
    permissions: ['downloads', 'storage', 'tabs'],
    host_permissions: ['*://rule34.xxx/*', '*://*.rule34.xxx/*'],
    icons: {
      "16": "logo.webp",
      "32": "logo.webp",
      "48": "logo.webp",
      "96": "logo.webp",
      "128": "logo.webp"
    },
    action: {
      "default_icon": "logo.webp"
    },
    web_accessible_resources: [
      {
        resources: ['logo.webp'],
        matches: ['*://rule34.xxx/*', '*://*.rule34.xxx/*'],
      },
    ],
  },
});

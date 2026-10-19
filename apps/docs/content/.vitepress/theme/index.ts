// Default VitePress theme plus the PVL banner above the landing-page hero.
// The image is `assets/banner.jpeg` at the repo root, served at `/banner.jpeg`
// through `vite.publicDir` in `../config.ts`.
import DefaultTheme from 'vitepress/theme';
import { h, type VNode } from 'vue';

export default {
  extends: DefaultTheme,
  Layout: (): VNode =>
    h(DefaultTheme.Layout, null, {
      'home-hero-before': () =>
        h('img', {
          src: '/banner.jpeg',
          alt: 'PVL, the Precompiled Validation Library',
          style: 'display: block; width: 100%; height: auto;',
        }),
    }),
};

// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  // SSR: Daten (News, Agenda, Ranglisten) werden pro Request vom Backend geladen
  output: 'server',
  // Dev/Preview auf 4322 – Port 4321 ist für den Test-Container reserviert
  server: { port: 4322 },
  adapter: node({
    mode: 'standalone'
  })
});
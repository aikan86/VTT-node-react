// Temporaneo (screenshot del manuale): stessa app su porte separate, server di prova sulla 3101.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const server = "http://127.0.0.1:3101";

export default defineConfig({
  plugins: [react()],
  server: { port: 5273, strictPort: true, proxy: { "/api": server, "/uploads": server } },
});

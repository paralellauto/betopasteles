import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Deskdog has two windows, so Vite builds two HTML entry points:
//   index.html -> the transparent dog that sits on the desktop
//   panel.html -> the small control panel (timer, stats, buttons)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        dog: resolve(__dirname, "index.html"),
        panel: resolve(__dirname, "panel.html"),
      },
    },
  },
});

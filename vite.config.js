import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Deskdog has two windows, so Vite builds two HTML entry points:
//   index.html -> the transparent dog that sits on the desktop
//   panel.html -> the small control panel (timer, stats, buttons)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,

  // La ventana del perro se abre en cuanto arranca la app, antes de que Vite
  // haya terminado de preparar sus dependencias. Cuando Vite las prepara sobre
  // la marcha cambia las direcciones de los módulos y manda recargar, y el
  // webview de macOS (WebKit) se queda con el gráfico de módulos a medias:
  //
  //   SyntaxError: Importing binding name 'default' cannot be resolved
  //   by star export entries.
  //
  // El panel no lo sufría porque se abre más tarde, cuando ya está todo listo.
  // Declarándolas aquí, Vite las prepara al arrancar el servidor y no hay
  // ninguna recarga a media carga.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
    ],
  },

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

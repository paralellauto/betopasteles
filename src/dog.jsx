// Ventana del perro: una franja transparente pegada al borde inferior de la
// pantalla. Aquí solo vive el dálmata y su globo de diálogo; todo lo demás
// se ve a través.

// TEMPORAL: deja constancia en pantalla de hasta dónde llega el código.
// Esta línea se ejecuta en cuanto el archivo empieza; si el cartel cambia,
// es que el módulo sí se cargó y el problema está más adelante.
const paso = (t) => window.__ddPaso && window.__ddPaso(t);
paso("imports OK");

import React from "react";
import ReactDOM from "react-dom/client";
import Dog, { SPRITE_W } from "./Dog.jsx";
import { useDogState, dog } from "./state.js";
import "./styles.css";

// Tiene que coincidir con GROUND_OFFSET en src-tauri/src/lib.rs
const GROUND_OFFSET = 10;

// TEMPORAL — pinta el contorno de la ventana y un cuadro rojo donde debería
// estar el perro, para ver si la ventana está donde creemos. Poner en false
// cuando el perro ya se vea.
const DEBUG = true;

function DogWindow() {
  const s = useDogState();

  // Al hacer clic en cualquier punto de la franja, el perro camina hasta ahí.
  const handleStripClick = (e) => {
    const pct = (e.clientX / window.innerWidth) * 100;
    dog.walkTo(pct);
  };

  // Al hacer clic en el perro se abre o se cierra el panel de control.
  const handleDogClick = (e) => {
    e.stopPropagation();
    dog.togglePanel();
  };

  return (
    <div
      onClick={handleStripClick}
      style={{
        position: "fixed",
        inset: 0,
        background: DEBUG ? "rgba(0,120,255,0.15)" : "transparent",
        outline: DEBUG ? "3px solid rgba(0,120,255,0.9)" : "none",
        outlineOffset: -3,
        overflow: "hidden",
      }}
    >
      {DEBUG && (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 8,
            fontFamily: "monospace",
            fontSize: 12,
            color: "#fff",
            background: "rgba(0,0,0,0.65)",
            padding: "2px 6px",
            borderRadius: 4,
            pointerEvents: "none",
          }}
        >
          ventana {window.innerWidth}×{window.innerHeight} · perro en{" "}
          {Math.round(s.dogX)}% · {s.activity}
        </div>
      )}
      {s.msg && (
        <div
          style={{
            position: "absolute",
            bottom: GROUND_OFFSET + 158,
            left: `${s.dogX}%`,
            transform: "translateX(-50%)",
            maxWidth: 250,
            background: "#FFFFFF",
            border: "1px solid #E6E2D6",
            borderRadius: 12,
            padding: "8px 14px",
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontSize: 13,
            lineHeight: 1.4,
            color: "#22211E",
            textAlign: "center",
            boxShadow: "0 6px 18px rgba(28,27,24,0.16)",
            transition: `left ${s.walkDur}s linear`,
            pointerEvents: "none",
            whiteSpace: "pre-wrap",
          }}
        >
          {s.msg}
        </div>
      )}

      <div
        onClick={handleDogClick}
        title="Deskdog — clic para abrir el panel"
        style={{
          position: "absolute",
          bottom: GROUND_OFFSET,
          left: `${s.dogX}%`,
          width: SPRITE_W,
          marginLeft: -SPRITE_W / 2,
          transition: `left ${s.walkDur}s linear`,
          cursor: "pointer",
          // Si el recuadro rojo aparece pero el perro no, el problema son las
          // imágenes. Si no aparece ninguno de los dos, es la ventana.
          background: DEBUG ? "rgba(255,0,0,0.35)" : "transparent",
          minHeight: DEBUG ? 148 : undefined,
        }}
      >
        <Dog activity={s.activity} facing={s.facing} />
      </div>
    </div>
  );
}

// TEMPORAL: los carteles van marcando cada paso, para saber exactamente en
// cuál se atasca si algo falla.
paso("antes de montar");

const raiz = document.getElementById("root");
if (!raiz) {
  paso("NO EXISTE #root");
} else {
  ReactDOM.createRoot(raiz).render(
    <React.StrictMode>
      <DogWindow />
    </React.StrictMode>,
  );
  paso("montado");
}

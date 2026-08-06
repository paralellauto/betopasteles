// Ventana del perro: una franja transparente pegada al borde inferior de la
// pantalla. Aquí solo vive el dálmata y su globo de diálogo; todo lo demás
// se ve a través.

import React from "react";
import ReactDOM from "react-dom/client";
import Dog, { SPRITE_W } from "./Dog.jsx";
import { useDogState, dog } from "./state.js";
import "./styles.css";

// Tiene que coincidir con GROUND_OFFSET en src-tauri/src/lib.rs
const GROUND_OFFSET = 10;

function DogWindow() {
  const s = useDogState();
  if (!s) return null;

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
        background: "transparent",
        overflow: "hidden",
      }}
    >
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
        }}
      >
        <Dog activity={s.activity} facing={s.facing} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DogWindow />
  </React.StrictMode>,
);

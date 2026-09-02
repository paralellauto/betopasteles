// Ventana del perro: una franja transparente pegada al borde inferior de la
// pantalla. Aquí solo vive el dálmata y su globo de diálogo; todo lo demás
// se ve a través.

import React from "react";
import ReactDOM from "react-dom/client";
import DogSprite, { SPRITE_W, SPRITE_H } from "./DogSprite.jsx";
import { useDogState, dog } from "./state.js";
import "./styles.css";

// Tiene que coincidir con GROUND_OFFSET en src-tauri/src/lib.rs
const GROUND_OFFSET = 10;
// Ancho máximo del globo de diálogo (el mismo valor que usa su estilo).
const BUBBLE_W = 250;
// Aire mínimo entre el borde de la pantalla y lo que se dibuja.
const MARGEN = 8;

/** Ancho de la ventana, actualizado si cambia la resolución de la pantalla. */
function useAnchoVentana() {
  const [ancho, setAncho] = React.useState(window.innerWidth);
  React.useEffect(() => {
    const alCambiar = () => setAncho(window.innerWidth);
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);
  return ancho;
}

/**
 * Mantiene algo de ancho `w` dentro de la pantalla.
 * Sin esto, si Beto camina hasta un extremo el globo se sale por el lado.
 */
function centrarDentro(centro, w, ancho) {
  const mitad = w / 2 + MARGEN;
  if (ancho < w + MARGEN * 2) return ancho / 2; // pantalla diminuta: al centro
  return Math.min(Math.max(centro, mitad), ancho - mitad);
}

function DogWindow() {
  const s = useDogState();
  const ancho = useAnchoVentana();

  const centro = (s.dogX / 100) * ancho;
  const izqPerro = centrarDentro(centro, SPRITE_W, ancho);
  const izqGlobo = centrarDentro(centro, BUBBLE_W, ancho);

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
            bottom: GROUND_OFFSET + SPRITE_H + 10,
            left: izqGlobo,
            transform: "translateX(-50%)",
            maxWidth: BUBBLE_W,
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
          left: izqPerro,
          width: SPRITE_W,
          marginLeft: -SPRITE_W / 2,
          transition: `left ${s.walkDur}s linear`,
          cursor: "pointer",
        }}
      >
        <DogSprite activity={s.activity} facing={s.facing} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DogWindow />
  </React.StrictMode>,
);

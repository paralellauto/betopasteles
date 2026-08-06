// Panel de control: temporizador, estadísticas y botones.
// Es una ventana pequeña sin barra de título; se arrastra desde la cabecera
// y se abre o cierra desde el icono de la barra del sistema o tocando al perro.

import React from "react";
import ReactDOM from "react-dom/client";
import { useDogState, dog, fmt, INK, ACCENT } from "./state.js";
import "./styles.css";

const FONT = "'Inter', system-ui, -apple-system, sans-serif";

function StatBar({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.4,
          color: "#98937F",
          width: 62,
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          background: "#EAE7DD",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: value < 25 ? ACCENT : INK,
            borderRadius: 2,
            transition: "width 0.5s, background 0.5s",
          }}
        />
      </div>
    </div>
  );
}

const btnBase = {
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontFamily: "inherit",
  fontWeight: 500,
  cursor: "pointer",
};
const btnSolid = {
  ...btnBase,
  flexGrow: 1,
  background: INK,
  color: "#FFFFFF",
  border: `1px solid ${INK}`,
};
const btnGhost = {
  ...btnBase,
  background: "transparent",
  color: INK,
  border: "1px solid #D8D4C6",
};

function Panel() {
  const s = useDogState();
  if (!s) return null;

  const label =
    s.mode === "focus" ? "Enfoque" : s.mode === "break" ? "Descanso" : "Listo";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        background: "#FFFFFF",
        border: "1px solid #E6E2D6",
        borderRadius: 16,
        padding: "14px 20px 18px",
        fontFamily: FONT,
        color: INK,
        boxShadow: "0 10px 30px rgba(28,27,24,0.14)",
        overflow: "hidden",
      }}
    >
      {/* Cabecera: zona para arrastrar la ventana + botón de cerrar */}
      <div
        data-tauri-drag-region
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
          cursor: "grab",
        }}
      >
        <span
          data-tauri-drag-region
          style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}
        >
          deskdog
        </span>
        <button
          onClick={() => dog.hidePanel()}
          title="Ocultar panel"
          style={{
            border: "none",
            background: "transparent",
            color: "#98937F",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 2,
            color: "#98937F",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: "#98937F" }}>
          sesiones · {s.pomodoros}
        </span>
      </div>

      <div
        style={{
          fontSize: 52,
          fontWeight: 300,
          letterSpacing: -1,
          fontVariantNumeric: "tabular-nums",
          color: s.mode === "break" ? ACCENT : INK,
          margin: "4px 0 14px",
          lineHeight: 1,
        }}
      >
        {fmt(s.timeLeft)}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <StatBar label="Hambre" value={s.hambre} />
        <StatBar label="Energía" value={s.energia} />
        <StatBar label="Ánimo" value={s.felicidad} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {s.mode === "idle" ? (
          <button onClick={() => dog.start()} style={btnSolid}>
            Iniciar
          </button>
        ) : (
          <button onClick={() => dog.stop()} style={btnSolid}>
            Detener
          </button>
        )}
        <button onClick={() => dog.feed()} style={btnGhost}>
          Comida
        </button>
        <button onClick={() => dog.treat()} style={btnGhost}>
          Premio
        </button>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginTop: 14,
          fontSize: 11,
          color: "#98937F",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={s.demo}
          onChange={(e) => dog.setDemo(e.target.checked)}
          style={{ accentColor: INK }}
        />
        Modo demo (ciclos de segundos)
      </label>

      <div
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "#98937F",
          lineHeight: 1.5,
        }}
      >
        {s.mode === "focus"
          ? "Duerme mientras te enfocas · recupera energía"
          : "Toca el escritorio para pasearlo"}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Panel />
  </React.StrictMode>,
);

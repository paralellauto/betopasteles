/*
 * ============================================================================
 *  PROTOTIPO ORIGINAL — solo como referencia, no se usa en la app
 * ============================================================================
 *
 *  Este es el prototipo de React que escribió Eduardo, del que salió toda la
 *  lógica de Deskdog. Se guarda aquí para poder comparar comportamientos.
 *
 *  ÚNICO CAMBIO: las tres ilustraciones venían incrustadas en el código como
 *  texto base64 (unos 5 MB de letras y números). Se han sustituido por la ruta
 *  del archivo PNG correspondiente, que ahora vive en src-assets/. La lógica,
 *  los tiempos, los textos y los números están intactos.
 *
 *  Dónde vive cada cosa ahora:
 *    - temporizador, estadísticas, mensajes .... src-tauri/src/lib.rs
 *    - dibujo del perro y animaciones .......... src/Dog.jsx
 *    - panel de control ........................ src/panel.jsx
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";

// En el prototipo esto eran cadenas base64 gigantes.
const DOG_IMAGES = {
  sit: "../src-assets/sit.png",
  sleep: "../src-assets/sleep.png",
  walk: "../src-assets/walk.png",
};

// Alturas de render por pose (px) para que se vean proporcionadas
const POSE_HEIGHT = { sit: 148, sleep: 72, walk: 120 };

// ---------- Constantes ----------
const FOCUS_REAL = 25 * 60;
const BREAK_REAL = 5 * 60;
const FOCUS_DEMO = 20;
const BREAK_DEMO = 12;

const INK = "#22211E";
const PAPER = "#F5F3EC";
const ACCENT = "#C56A45";

const clamp = (v) => Math.max(0, Math.min(100, v));
const fmt = (s) => {
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

// ---------- Perro ----------
function Dog({ activity, facing }) {
  const sleeping = activity === "sleep";
  const walking = activity === "walking";
  const eating = activity === "eating";
  const happy = activity === "happy";

  const poseKey = sleeping ? "sleep" : walking ? "walk" : "sit";
  const src = DOG_IMAGES[poseKey];
  const h = POSE_HEIGHT[poseKey];

  return (
    <div
      style={{
        height: 150,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transform: `scaleX(${facing})`,
        transition: "transform 0.25s",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 40% { transform: translateY(-10px); } }
        @keyframes breathe { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.03); } }
        @keyframes nibble { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-2.5deg); } }
        @media (prefers-reduced-motion: reduce) { .dog-anim { animation: none !important; } }
      `}</style>
      <img
        src={src}
        alt="deskdog"
        className="dog-anim"
        draggable={false}
        style={{
          height: h,
          animation: walking
            ? "bob 0.4s infinite"
            : happy
              ? "bounce 0.55s infinite"
              : eating
                ? "nibble 0.4s infinite"
                : sleeping
                  ? "breathe 3.2s infinite"
                  : "none",
          transformOrigin: "50% 100%",
        }}
      />
      {sleeping && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: -8,
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
            color: "#A39E8F",
            fontSize: 17,
            transform: `scaleX(${facing})`,
            letterSpacing: 2,
          }}
        >
          z z z
        </div>
      )}
      {(happy || eating) && (
        <div
          style={{
            position: "absolute",
            top: happy ? -2 : 10,
            right: -10,
            color: ACCENT,
            fontSize: 16,
            transform: `scaleX(${facing})`,
          }}
        >
          {happy ? "♥" : "…"}
        </div>
      )}
    </div>
  );
}

// ---------- Barra de estado ----------
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

// ---------- App ----------
export default function DesktopDog() {
  const [demo, setDemo] = useState(true);
  const [mode, setMode] = useState("idle");
  const [timeLeft, setTimeLeft] = useState(FOCUS_DEMO);
  const [pomodoros, setPomodoros] = useState(0);

  const [activity, setActivity] = useState("idle");
  const [dogX, setDogX] = useState(50);
  const [facing, setFacing] = useState(1);
  const [walkDur, setWalkDur] = useState(1.2);

  const [hambre, setHambre] = useState(70);
  const [energia, setEnergia] = useState(80);
  const [felicidad, setFelicidad] = useState(75);

  const [msg, setMsg] = useState("Inicia un pomodoro y te acompaño");
  const msgTimer = useRef(null);
  const deskRef = useRef(null);

  const say = useCallback((text, ms = 3500) => {
    setMsg(text);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(""), ms);
  }, []);

  const focusLen = demo ? FOCUS_DEMO : FOCUS_REAL;
  const breakLen = demo ? BREAK_DEMO : BREAK_REAL;

  useEffect(() => {
    if (mode === "idle") return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t > 1) return t - 1;
        if (mode === "focus") {
          setMode("break");
          setActivity("happy");
          setPomodoros((p) => p + 1);
          say("¡Terminaste! Toca el escritorio para pasearme", 6000);
          setTimeout(() => setActivity((a) => (a === "happy" ? "idle" : a)), 2500);
          return breakLen;
        } else {
          setMode("focus");
          setActivity("sleep");
          say("Fin del descanso. Me echo una siesta, tú concéntrate", 5000);
          return focusLen;
        }
      });
    }, 1000);
    return () => clearInterval(id);
  }, [mode, breakLen, focusLen, say]);

  useEffect(() => {
    const id = setInterval(
      () => {
        setHambre((h) => clamp(h - 1));
        if (activity === "sleep") setEnergia((e) => clamp(e + 3));
        else if (activity === "walking") setEnergia((e) => clamp(e - 2));
        else setEnergia((e) => clamp(e - 0.5));
        if (activity !== "walking") setFelicidad((f) => clamp(f - 0.7));
      },
      demo ? 3000 : 12000,
    );
    return () => clearInterval(id);
  }, [activity, demo]);

  const start = () => {
    setMode("focus");
    setTimeLeft(focusLen);
    setActivity("sleep");
    say("A trabajar. Aquí te cuido");
  };

  const stop = () => {
    setMode("idle");
    setActivity("idle");
    setTimeLeft(focusLen);
    say("Sesión detenida. Aquí sigo, sin prisa");
  };

  const feed = () => {
    if (activity === "sleep") return say("Shhh… está dormido. Espera al descanso");
    setActivity("eating");
    setHambre((h) => clamp(h + 35));
    say("Ñam. Gracias");
    setTimeout(() => setActivity((a) => (a === "eating" ? "idle" : a)), 2000);
  };

  const treat = () => {
    if (activity === "sleep") return say("Shhh… está dormido. Espera al descanso");
    setActivity("happy");
    setFelicidad((f) => clamp(f + 20));
    setHambre((h) => clamp(h + 8));
    say("¡Un premio! Eres el mejor humano");
    setTimeout(() => setActivity((a) => (a === "happy" ? "idle" : a)), 2200);
  };

  const handleDeskClick = (e) => {
    if (activity === "sleep")
      return say("Duerme durante el enfoque. En el descanso paseamos");
    if (activity === "eating") return;
    const rect = deskRef.current.getBoundingClientRect();
    const targetPct = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const dist = Math.abs(targetPct - dogX);
    if (dist < 3) return;
    setFacing(targetPct > dogX ? 1 : -1);
    setWalkDur(Math.max(0.5, dist / 28));
    setActivity("walking");
    setDogX(clamp(targetPct));
    setFelicidad((f) => clamp(f + 4));
    setTimeout(
      () => {
        setActivity((a) => (a === "walking" ? "idle" : a));
      },
      Math.max(500, (dist / 28) * 1000),
    );
  };

  const inFocus = mode === "focus";

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', system-ui, sans-serif",
        background: PAPER,
        overflow: "hidden",
        color: INK,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />

      <div
        ref={deskRef}
        onClick={handleDeskClick}
        style={{
          flex: 1,
          position: "relative",
          background: PAPER,
          cursor: activity === "sleep" ? "default" : "pointer",
          userSelect: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 44,
            left: 0,
            right: 0,
            borderBottom: "1px solid #DDD9CC",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 26,
            left: 26,
            display: "flex",
            flexDirection: "column",
            gap: 22,
          }}
        >
          {["Tesis.docx", "Notas", "Proyecto"].map((n) => (
            <div key={n} style={{ textAlign: "center", width: 60, opacity: 0.65 }}>
              <div
                style={{
                  width: 34,
                  height: 42,
                  margin: "0 auto",
                  background: "#FFFFFF",
                  borderRadius: 5,
                  border: "1.5px solid #C9C4B4",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 9,
                    left: 7,
                    right: 7,
                    height: 1.5,
                    background: "#DDD9CC",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 15,
                    left: 7,
                    right: 7,
                    height: 1.5,
                    background: "#DDD9CC",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 21,
                    left: 7,
                    right: 12,
                    height: 1.5,
                    background: "#DDD9CC",
                  }}
                />
              </div>
              <div style={{ fontSize: 11, color: "#8B8677", marginTop: 6 }}>{n}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            top: 26,
            right: 26,
            background: "#FFFFFF",
            border: "1px solid #E6E2D6",
            borderRadius: 16,
            padding: "18px 20px",
            width: 232,
            boxShadow: "0 10px 30px rgba(28,27,24,0.07)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
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
              {mode === "focus" ? "Enfoque" : mode === "break" ? "Descanso" : "Listo"}
            </span>
            <span style={{ fontSize: 11, color: "#98937F" }}>
              sesiones · {pomodoros}
            </span>
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 300,
              letterSpacing: -1,
              fontVariantNumeric: "tabular-nums",
              color: mode === "break" ? ACCENT : INK,
              margin: "4px 0 14px",
              lineHeight: 1,
            }}
          >
            {fmt(timeLeft)}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 16,
            }}
          >
            <StatBar label="Hambre" value={hambre} />
            <StatBar label="Energía" value={energia} />
            <StatBar label="Ánimo" value={felicidad} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {mode === "idle" ? (
              <button onClick={start} style={btnSolid}>
                Iniciar
              </button>
            ) : (
              <button onClick={stop} style={btnSolid}>
                Detener
              </button>
            )}
            <button onClick={feed} style={btnGhost}>
              Comida
            </button>
            <button onClick={treat} style={btnGhost}>
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
              checked={demo}
              onChange={(e) => {
                setDemo(e.target.checked);
                setMode("idle");
                setActivity("idle");
                setTimeLeft(e.target.checked ? FOCUS_DEMO : FOCUS_REAL);
              }}
              style={{ accentColor: INK }}
            />
            Modo demo (ciclos de segundos)
          </label>
        </div>

        {msg && (
          <div
            style={{
              position: "absolute",
              bottom: 208,
              left: `${dogX}%`,
              transform: "translateX(-50%)",
              maxWidth: 250,
              background: "#FFFFFF",
              border: "1px solid #E6E2D6",
              borderRadius: 12,
              padding: "8px 14px",
              fontSize: 13,
              color: INK,
              boxShadow: "0 6px 18px rgba(28,27,24,0.08)",
              transition: `left ${walkDur}s linear`,
              pointerEvents: "none",
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {msg}
          </div>
        )}

        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: `${dogX}%`,
            transform: "translateX(-50%)",
            transition: `left ${walkDur}s linear`,
          }}
        >
          <Dog activity={activity} facing={facing} />
          <div
            style={{
              width: 110,
              height: 8,
              margin: "-2px auto 0",
              background: "rgba(28,27,24,0.10)",
              borderRadius: "50%",
              filter: "blur(3px)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          height: 42,
          background: "#FFFFFF",
          borderTop: "1px solid #E6E2D6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
          deskdog
        </span>
        <span style={{ fontSize: 12, color: "#98937F" }}>
          {inFocus
            ? "Duerme mientras te enfocas · recupera energía"
            : "Toca cualquier punto del escritorio para pasearlo"}
        </span>
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

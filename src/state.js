// Puente entre Rust y React.
//
// Rust es el dueño del estado del perro. Aquí solo lo escuchamos y le mandamos
// órdenes. Las dos ventanas usan este mismo archivo, así que siempre coinciden.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Colores del prototipo. */
export const INK = "#22211E";
export const PAPER = "#F5F3EC";
export const ACCENT = "#C56A45";

/** Convierte 145 segundos en "02:25". */
export function fmt(total) {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Devuelve el estado actual del perro y se actualiza solo cuando Rust avisa.
 * Devuelve `null` hasta que llega el primer estado.
 */
export function useDogState() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let alive = true;
    let unlisten = null;

    invoke("get_state")
      .then((s) => {
        if (alive) setState(s);
      })
      .catch(() => {});

    listen("deskdog:state", (event) => {
      if (alive) setState(event.payload);
    }).then((fn) => {
      if (alive) unlisten = fn;
      else fn();
    });

    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, []);

  return state;
}

/** Órdenes que la interfaz le puede dar al perro. */
export const dog = {
  start: () => invoke("start"),
  stop: () => invoke("stop"),
  feed: () => invoke("feed"),
  treat: () => invoke("treat"),
  walkTo: (x) => invoke("walk_to", { x }),
  setDemo: (demo) => invoke("set_demo", { demo }),
  togglePanel: () => invoke("toggle_panel"),
  hidePanel: () => invoke("hide_panel"),
};

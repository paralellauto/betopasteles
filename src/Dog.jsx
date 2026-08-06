// El perro: elige la ilustración según lo que esté haciendo y le añade
// la animación correspondiente. Es el mismo componente del prototipo, pero
// leyendo archivos PNG en vez de imágenes incrustadas en el código.

// Las imágenes se importan desde src/assets, NO desde public/. Vite solo
// empaqueta como módulo lo que vive dentro de src/; importar desde public/
// parece funcionar en algunos navegadores pero falla en el webview de macOS,
// y al fallar el import se cae el archivo entero y no se dibuja nada.
import sitPng from "./assets/dog/sit.png";
import sleepPng from "./assets/dog/sleep.png";
import walkPng from "./assets/dog/walk.png";

const POSES = {
  sit: sitPng,
  sleep: sleepPng,
  walk: walkPng,
};

// Las tres ilustraciones ya vienen recortadas sobre el mismo lienzo y alineadas
// al mismo suelo, así que todas se dibujan del mismo tamaño y el perro nunca
// "salta" al cambiar de postura.
export const SPRITE_W = 178;
export const SPRITE_H = 148;

export default function Dog({ activity, facing }) {
  const sleeping = activity === "sleep";
  const walking = activity === "walking";
  const eating = activity === "eating";
  const happy = activity === "happy";

  const pose = sleeping ? "sleep" : walking ? "walk" : "sit";

  const animation = walking
    ? "dd-bob 0.4s infinite"
    : happy
      ? "dd-bounce 0.55s infinite"
      : eating
        ? "dd-nibble 0.4s infinite"
        : sleeping
          ? "dd-breathe 3.2s infinite"
          : "none";

  return (
    <div
      style={{
        width: SPRITE_W,
        height: SPRITE_H,
        position: "relative",
        transform: `scaleX(${facing})`,
        transition: "transform 0.25s",
      }}
    >
      <img
        src={POSES[pose]}
        alt=""
        draggable={false}
        className="dd-dog"
        style={{
          width: SPRITE_W,
          height: SPRITE_H,
          display: "block",
          animation,
          transformOrigin: "50% 100%",
          // El dálmata es línea negra sobre fondo transparente: una sombra
          // suave lo despega del escritorio sin ensuciar el estilo.
          filter: "drop-shadow(0 2px 3px rgba(28,27,24,0.18))",
        }}
      />

      {sleeping && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: -4,
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
            color: "#8B8677",
            fontSize: 17,
            letterSpacing: 2,
            transform: `scaleX(${facing})`,
            textShadow: "0 1px 2px rgba(245,243,236,0.9)",
          }}
        >
          z z z
        </div>
      )}

      {(happy || eating) && (
        <div
          style={{
            position: "absolute",
            top: happy ? -6 : 8,
            right: -6,
            color: "#C56A45",
            fontSize: 16,
            transform: `scaleX(${facing})`,
            textShadow: "0 1px 2px rgba(245,243,236,0.9)",
          }}
        >
          {happy ? "♥" : "…"}
        </div>
      )}
    </div>
  );
}

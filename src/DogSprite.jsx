// El dálmata: elige la ilustración según lo que esté haciendo y le añade la
// animación correspondiente.
//
// Sentado, dormido y comiendo son un dibujo fijo. Caminar NO: usa una tira de
// ocho fotogramas (public/dog/walk-sheet.png) que se reproduce en bucle, como
// en un videojuego. La tira la genera tools/build-walk-cycle.py a partir de la
// misma ilustración, doblándole las patas.

// Las imágenes viven en public/ y se referencian por su dirección, SIN
// `import`. Es justo para lo que sirve public/.
const POSES = {
  sit: "/dog/sit.png",
  sleep: "/dog/sleep.png",
};

// Las ilustraciones vienen recortadas sobre el mismo lienzo y alineadas al
// mismo suelo, así que todas se dibujan del mismo tamaño y el perro nunca
// "salta" al cambiar de postura.
export const SPRITE_W = 178;
export const SPRITE_H = 148;

// Fotogramas de la tira de caminata. Si cambia, hay que actualizar también
// --dd-pasos y la anchura en el @keyframes dd-walk de styles.css.
export const WALK_FRAMES = 8;

export default function DogSprite({ activity, facing }) {
  const sleeping = activity === "sleep";
  const walking = activity === "walking";
  const eating = activity === "eating";
  const happy = activity === "happy";

  // Sombra suave: despega al perro del escritorio sin ensuciar el estilo.
  const sombra = "drop-shadow(0 2px 3px rgba(28,27,24,0.18))";

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
      {walking ? (
        // Caminando: la tira de fotogramas. `steps()` hace que salte de uno a
        // otro en seco, sin fundido, que es lo que da el aire de videojuego.
        <div
          className="dd-dog dd-walk"
          style={{
            width: SPRITE_W,
            height: SPRITE_H,
            backgroundImage: "url(/dog/walk-sheet.png)",
            backgroundSize: `${SPRITE_W * WALK_FRAMES}px ${SPRITE_H}px`,
            backgroundRepeat: "no-repeat",
            filter: sombra,
          }}
        />
      ) : (
        <img
          src={sleeping ? POSES.sleep : POSES.sit}
          alt=""
          draggable={false}
          className="dd-dog"
          style={{
            width: SPRITE_W,
            height: SPRITE_H,
            display: "block",
            animation: happy
              ? "dd-bounce 0.55s infinite"
              : eating
                ? "dd-nibble 0.4s infinite"
                : sleeping
                  ? "dd-breathe 3.2s infinite"
                  : "none",
            transformOrigin: "50% 100%",
            filter: sombra,
          }}
        />
      )}

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

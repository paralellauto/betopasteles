#!/usr/bin/env python3
"""
Prepara las ilustraciones del perro para la app.

Las tres poses originales (sentado, dormido, caminando) vienen dibujadas en
distintas posiciones dentro de su lienzo. Si se usaran tal cual, el perro daría
un salto cada vez que cambia de postura.

Este script:
  1. recorta cada pose a su contenido real
  2. las apoya todas sobre la MISMA línea de suelo, en un lienzo común
  3. limpia el halo de color que queda en los píxeles casi transparentes
  4. las exporta al tamaño que usa la app

Cómo se usa (necesita Pillow: pip install Pillow):

    python3 tools/build-sprites.py

Lee de   src-assets/original/
Escribe  src-assets/  y  public/dog/
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-assets" / "original"
OUT_DIRS = [ROOT / "src-assets", ROOT / "public" / "dog"]

POSES = ["sit", "sleep", "walk"]

# Alto final en píxeles. Se exporta al doble del tamaño en pantalla (148 px)
# para que se vea nítido en pantallas Retina.
OUTPUT_HEIGHT = 296

# Un píxel se considera "del perro" a partir de esta opacidad.
SOLID_ALPHA = 40
# Por debajo de esto se borra del todo, para que no quede halo de color.
HALO_ALPHA = 12


def main() -> None:
    loaded = []
    for name in POSES:
        path = SRC / f"{name}.png"
        if not path.exists():
            raise SystemExit(f"No encuentro {path}")
        im = Image.open(path).convert("RGBA")
        mask = im.getchannel("A").point(lambda v: 255 if v > SOLID_ALPHA else 0)
        bbox = mask.getbbox()
        if bbox is None:
            raise SystemExit(f"{path} parece estar vacía")
        loaded.append((name, im, bbox))

    # Lienzo común: lo bastante ancho para la pose más larga (dormido) y lo
    # bastante alto para la más alta (sentado).
    canvas_w = max(b[2] - b[0] for _, _, b in loaded)
    canvas_h = max(b[3] - b[1] for _, _, b in loaded)
    out_w = round(canvas_w * OUTPUT_HEIGHT / canvas_h)

    print(f"lienzo común : {canvas_w} x {canvas_h}")
    print(f"exportando a : {out_w} x {OUTPUT_HEIGHT}")

    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)

    for name, im, bbox in loaded:
        crop = im.crop(bbox)
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        # Centrado horizontal, apoyado en el borde inferior: esa es la línea
        # de suelo que comparten las tres poses.
        canvas.paste(crop, ((canvas_w - crop.width) // 2, canvas_h - crop.height), crop)

        px = canvas.load()
        for y in range(canvas_h):
            for x in range(canvas_w):
                if px[x, y][3] < HALO_ALPHA:
                    px[x, y] = (0, 0, 0, 0)

        final = canvas.resize((out_w, OUTPUT_HEIGHT), Image.LANCZOS)
        for out_dir in OUT_DIRS:
            final.save(out_dir / f"{name}.png", optimize=True)
        print(f"  {name:<6} listo")

    print("\nSi cambias OUTPUT_HEIGHT, actualiza también SPRITE_W / SPRITE_H")
    print("en src/Dog.jsx y en src-tauri/src/lib.rs (deben coincidir).")


if __name__ == "__main__":
    main()

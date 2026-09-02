#!/usr/bin/env python3
"""
Genera un ciclo de caminata de verdad a partir de la ilustración `walk.png`.

No inventa dibujo nuevo: coge las cuatro patas del original y las va doblando
fotograma a fotograma, como una marioneta. El resultado es una tira de sprites
(igual que en un videojuego) que la app reproduce en bucle.

Cómo funciona
-------------
1. Localiza las cuatro patas: por debajo de cierta altura, cada fila de píxeles
   se parte en cuatro tramos separados, uno por pata.
2. Las sigue de abajo hacia arriba, emparejándolas entre filas.
3. En cada fotograma desplaza cada pata en horizontal, cada vez más cuanto más
   abajo esté (0 en la cadera, máximo en la pezuña). Así la pata se dobla en
   lugar de partirse: no queda ninguna costura.
4. Las patas van en diagonal, como camina un perro de verdad: la delantera de
   un lado con la trasera del otro.
5. Además el cuerpo sube y baja dos veces por zancada, que es lo que hace que
   parezca peso y no un dibujo flotando.

Uso:  python3 tools/build-walk-cycle.py
"""

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-assets" / "original" / "walk.png"
OUT_SHEET = ROOT / "public" / "dog" / "walk-sheet.png"
PREVIEW = Path("/tmp/walk-preview.png")
GIF = Path("/tmp/walk.gif")

FRAMES = 8  # fotogramas del ciclo
SWING = 0.070  # desplazamiento máximo de la pezuña, en fracción del ancho del perro
BOB_CSS = 2.5  # cuánto sube y baja el cuerpo, en píxeles de los que se ven
PIVOT = 0.62  # a partir de aquí (fracción del alto) las patas empiezan a doblarse
SOLID = 40  # opacidad mínima para considerar que hay dibujo

# Altura final de cada fotograma (el doble de lo que se ve, para pantallas Retina)
FRAME_H = 296
# Las otras poses (sentado, dormido) se generan en tools/build-sprites.py sobre
# un lienzo común. El ciclo de caminata TIENE que usar ese mismo lienzo, si no
# el perro pega un salto al empezar a andar.
POSES_TODAS = ["sit", "sleep", "walk"]


def bandas_de_fila(px, w, y):
    """Tramos horizontales con dibujo en la fila `y`. Cada tramo es una pata."""
    out, dentro, ini = [], False, 0
    for x in range(w):
        hay = px[x, y] > 0
        if hay and not dentro:
            ini, dentro = x, True
        elif not hay and dentro:
            out.append((ini, x))
            dentro = False
    if dentro:
        out.append((ini, w))
    return out


def seguir_patas(px, w, h, pivot_y):
    """
    Sigue las cuatro patas de abajo hacia arriba.
    Devuelve, por fila, una lista de (inicio, fin, indice_de_pata).
    """
    # Fila de partida: la más baja donde se distinguen las cuatro.
    base_y = None
    for y in range(h - 1, pivot_y, -1):
        if len(bandas_de_fila(px, w, y)) == 4:
            base_y = y
            break
    if base_y is None:
        return {}

    centros = [ (a + b) / 2 for a, b in bandas_de_fila(px, w, base_y) ]
    por_fila = {}

    for y in range(base_y, pivot_y - 1, -1):
        asignadas = []
        for a, b in bandas_de_fila(px, w, y):
            c = (a + b) / 2
            # A cada tramo le toca la pata cuyo centro tenga más cerca.
            i = min(range(len(centros)), key=lambda k: abs(centros[k] - c))
            asignadas.append((a, b, i))
            centros[i] = c
        por_fila[y] = asignadas

    # Por debajo de la fila de partida se mantiene el mismo reparto.
    for y in range(base_y + 1, h):
        asignadas = []
        for a, b in bandas_de_fila(px, w, y):
            c = (a + b) / 2
            i = min(range(len(centros)), key=lambda k: abs(centros[k] - c))
            asignadas.append((a, b, i))
        por_fila[y] = asignadas

    return por_fila


def lienzo_comun():
    """El mismo lienzo que usa build-sprites.py: cabe la pose más ancha y la más alta."""
    anchos, altos = [], []
    for nombre in POSES_TODAS:
        im = Image.open(SRC.parent / f"{nombre}.png").convert("RGBA")
        bb = im.getchannel("A").point(lambda v: 255 if v > SOLID else 0).getbbox()
        anchos.append(bb[2] - bb[0])
        altos.append(bb[3] - bb[1])
    return max(anchos), max(altos)


def main():
    CW, CH = lienzo_comun()

    im = Image.open(SRC).convert("RGBA")
    bb = im.getchannel("A").point(lambda v: 255 if v > SOLID else 0).getbbox()
    recorte = im.crop(bb)

    # Centrado horizontal y apoyado en el suelo, igual que las demás poses.
    perro = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    off_x = (CW - recorte.width) // 2
    off_y = CH - recorte.height
    perro.paste(recorte, (off_x, off_y), recorte)
    W, H = perro.size
    alto_perro = recorte.height
    suelo = CH

    mask = perro.getchannel("A").point(lambda v: 255 if v > SOLID else 0)
    px = mask.load()

    # El pivote se mide sobre el perro, no sobre el lienzo entero.
    pivot_y = off_y + int(alto_perro * PIVOT)
    por_fila = seguir_patas(px, W, H, pivot_y)
    if not por_fila:
        raise SystemExit("No pude separar las cuatro patas")

    # Patas ordenadas de izquierda (trasera) a derecha (delantera).
    base = min(por_fila)
    orden = sorted({i for f in por_fila.values() for (_, _, i) in f})
    # Fase de cada pata: las diagonales van juntas.
    #   trasera-lejos + delantera-cerca   /   trasera-cerca + delantera-lejos
    fases = {orden[0]: 0.0, orden[1]: math.pi, orden[2]: math.pi, orden[3]: 0.0}

    swing_px = SWING * recorte.width
    # El bob se pide en píxeles de los que se ven; aquí se pasa a píxeles del lienzo.
    bob_px = BOB_CSS * (CH / (FRAME_H / 2))
    margen = 0

    fotogramas = []
    for f in range(FRAMES):
        t = 2 * math.pi * f / FRAMES
        lienzo = Image.new("RGBA", (W, H), (0, 0, 0, 0))

        # El cuerpo sube y baja dos veces por zancada.
        dy = -bob_px * (0.5 - 0.5 * math.cos(2 * t))

        base_img = perro.copy()
        salida = Image.new("RGBA", (W, H), (0, 0, 0, 0))

        for y in range(H):
            fila = base_img.crop((0, y, W, y + 1))
            if y < pivot_y or y not in por_fila:
                salida.paste(fila, (0, y))
                continue
            # Cuanto más abajo, más se dobla la pata.
            rampa = (y - pivot_y) / max(1, (suelo - 1 - pivot_y))
            for a, b, i in por_fila[y]:
                dx = int(round(swing_px * rampa * math.sin(t + fases.get(i, 0.0))))
                trozo = base_img.crop((a, y, b, y + 1))
                salida.paste(trozo, (a + dx, y), trozo)

        lienzo.paste(salida, (0, int(round(dy))), salida)
        fotogramas.append(lienzo)

    # --- tira de sprites -------------------------------------------------
    fw, fh = fotogramas[0].size
    escala = FRAME_H / fh
    ew, eh = max(1, round(fw * escala)), FRAME_H
    print(f"lienzo comun : {CW} x {CH}  (el mismo que sit y sleep)")
    tira = Image.new("RGBA", (ew * FRAMES, eh), (0, 0, 0, 0))
    for i, fr in enumerate(fotogramas):
        tira.paste(fr.resize((ew, eh), Image.LANCZOS), (i * ew, 0))
    OUT_SHEET.parent.mkdir(parents=True, exist_ok=True)
    tira.save(OUT_SHEET, optimize=True)

    print(f"fotogramas   : {FRAMES}")
    print(f"cada uno     : {ew} x {eh}")
    print(f"tira completa: {tira.size[0]} x {tira.size[1]}  ->  {OUT_SHEET.relative_to(ROOT)}")
    print(f"peso         : {OUT_SHEET.stat().st_size // 1024} KB")

    # --- vista previa para revisar ---------------------------------------
    def sobre_blanco(img):
        b = Image.new("RGB", img.size, (245, 243, 236))
        b.paste(img, (0, 0), img)
        return b

    hoja = Image.new("RGB", (ew * FRAMES, eh), (245, 243, 236))
    for i, fr in enumerate(fotogramas):
        hoja.paste(sobre_blanco(fr.resize((ew, eh), Image.LANCZOS)), (i * ew, 0))
    hoja.save(PREVIEW)

    gif = [sobre_blanco(fr.resize((ew // 2, eh // 2), Image.LANCZOS)) for fr in fotogramas]
    gif[0].save(GIF, save_all=True, append_images=gif[1:], duration=90, loop=0)
    print(f"vista previa : {PREVIEW}")
    print(f"animación    : {GIF}")


if __name__ == "__main__":
    main()

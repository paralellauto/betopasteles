# Deskdog 🐾

Un dálmata que vive en tu escritorio y te acompaña mientras trabajas.

- **Enfoque (25 min)** — el perro se echa a dormir y no te molesta. Recupera energía.
- **Descanso (5 min)** — se despierta, celebra, y puedes pasearlo, darle de comer o premiarlo.
- **Sin culpa** — si lo ignoras se pone triste, pero nunca le pasa nada malo.

---

## Cómo lo pruebas en tu computadora

Esto hay que hacerlo **una sola vez**. Después, arrancar la app es un solo comando.

### 1. Instala las dos herramientas base

Deskdog necesita dos programas para poder construirse:

| Programa | Para qué sirve | Dónde se baja |
|---|---|---|
| **Node.js** | Ejecuta la parte visual (el perro, el temporizador, los botones) | https://nodejs.org — botón **LTS** |
| **Rust** | Construye la ventana nativa de verdad (Mac / Windows) | https://rustup.rs |

**En Mac** además necesitas las herramientas de desarrollo de Apple. Abre la app
**Terminal** (búscala con ⌘+Espacio, escribe "Terminal") y pega esto:

```
xcode-select --install
```

Sale una ventana, le das a **Instalar** y esperas. Si dice que ya están
instaladas, perfecto, sigue adelante.

**En Windows** necesitas *Microsoft C++ Build Tools*; el instalador de Rust
te avisa y te da el enlace. Acepta lo que te proponga.

### 2. Comprueba que quedaron bien instalados

Cierra la Terminal y ábrela de nuevo (importante: si no, no las encuentra).
Pega estas dos líneas, una por una:

```
node --version
```
```
cargo --version
```

Cada una debe responder con un número de versión, algo como `v22.14.0` y
`cargo 1.8x.x`. Si alguna dice *command not found*, esa herramienta no quedó
instalada — reinstálala y vuelve a abrir la Terminal.

### 3. Bájate el proyecto

```
git clone -b claude/deskdog-tauri-desktop-84yylp https://github.com/paralellauto/betopasteles.git
```
```
cd betopasteles
```

`git clone` copia el proyecto de GitHub a tu computadora. El trozo
`-b claude/deskdog-tauri-desktop-84yylp` le dice de qué **rama** bajarlo: el
código vive ahí, no en la principal. Sin esa parte te bajarías la carpeta vacía.

`cd` significa "entra en esa carpeta".

### 4. Instala las piezas del proyecto

```
npm install
```

Descarga las librerías que usa la parte visual. Tarda unos segundos.

### 5. Arranca el perro

```
npm run tauri dev
```

**La primera vez tarda entre 5 y 15 minutos** porque Rust tiene que compilar
todo desde cero. Verás muchísimo texto pasando: es normal, déjalo trabajar.
Las siguientes veces arranca en segundos.

Cuando termine deberías ver:

- el **dálmata sentado** abajo en tu escritorio, sin ventana ni bordes
- un **icono en la barra del sistema** (arriba en Mac, abajo en Windows)

---

## Cómo se usa

| Acción | Qué hace |
|---|---|
| Clic **en el perro** | Abre o cierra el panel de control |
| Clic **en el escritorio**, a los lados | El perro camina hasta ahí |
| Icono de la barra del sistema | Menú: mostrar panel, mostrar/ocultar perro, iniciar, salir |
| Botón **Iniciar** | Empieza el pomodoro de 25 minutos |
| **Modo demo** | Ciclos de segundos en vez de minutos, para probar rápido sin esperar |

> **Consejo:** la primera vez, activa **Modo demo** en el panel. Así ves el ciclo
> completo (se duerme → despierta → celebra) en menos de un minuto, en vez de
> esperar media hora.

### Los clics atraviesan al perro

Mientras el perro **duerme**, los clics pasan de largo hacia tu escritorio: puedes
trabajar normal, como si la ventana no existiera. El perro solo captura el ratón
cuando pasas el cursor justo encima de él, o durante el descanso (para que puedas
señalarle a dónde caminar).

---

## Para generar la app instalable

Cuando quieras un `.dmg` (Mac) o un `.msi` (Windows) de verdad, para instalar
sin necesitar la Terminal:

```
npm run tauri build
```

El archivo queda en `src-tauri/target/release/bundle/`.

---

## Cómo está organizado

```
index.html            la ventana del perro (transparente)
panel.html            la ventana del panel de control
src/
  dogWindow.jsx       el perro sobre el escritorio
  panel.jsx           temporizador, estadísticas y botones
  DogSprite.jsx       elige la ilustración y la animación
  state.js            puente entre Rust y la interfaz
  styles.css          las animaciones
src-tauri/
  src/lib.rs          👈 el cerebro: temporizador, estadísticas, bandeja,
                         guardado en disco y click-through
  tauri.conf.json     configuración de las dos ventanas
src-assets/           las 3 ilustraciones ya recortadas y alineadas
public/dog/           las mismas, servidas a la app
reference/            el prototipo original, solo para consultar
```

**Si quieres cambiar algo:**

- los tiempos (25 / 5 min) → arriba de `src-tauri/src/lib.rs`
- lo que dice el perro → busca `say(` en `src-tauri/src/lib.rs`
- el tamaño del perro → `SPRITE_W` / `SPRITE_H`, en `lib.rs` **y** en
  `src/DogSprite.jsx` (los dos valores tienen que coincidir)
- los colores → `src/state.js`

### ⚠️ Cuidado con las mayúsculas en los nombres de archivo

macOS y Windows **no distinguen mayúsculas de minúsculas** en los nombres de
archivo; Linux sí. Dos archivos que sólo se diferencien en eso (`dog.jsx` y
`Dog.jsx`) son **el mismo archivo** en tu Mac, aunque en GitHub se vean como dos.

Nos costó una tarde entera: el import se resolvía al archivo equivocado, la
ventana del perro se quedaba en blanco sin decir nada, y en Linux —donde se
escribió el código— todo funcionaba, porque ahí sí son dos archivos distintos.

Por eso ahora son `dogWindow.jsx` y `DogSprite.jsx`. Si añades archivos, que no
haya dos cuyos nombres coincidan al pasarlos a minúsculas. Para comprobarlo:

```
git ls-files | tr 'A-Z' 'a-z' | sort | uniq -d
```

Si no imprime nada, no hay colisiones.

### Las ilustraciones

Las tres poses (sentado, dormido, caminando) venían en distintas posiciones
dentro de su lienzo, así que el perro habría dado un salto al cambiar de postura.
Ahora están recortadas sobre un lienzo común y apoyadas en la misma línea de
suelo, y se dibujan todas al mismo tamaño. Si algún día cambias los PNG, hay que
volver a alinearlos igual.

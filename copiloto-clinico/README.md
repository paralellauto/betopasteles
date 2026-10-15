# Copiloto clínico (piloto)

Prototipo funcional del concepto "Copiloto clínico para psicólogos" para el piloto de 4 semanas:
la psicóloga pega en el panel cada mensaje de WhatsApp del paciente, la asistente (Claude) clasifica el
nivel de riesgo y redacta una respuesta, y la psicóloga aprueba cada mensaje antes de enviarlo.

Se publica como un Artifact de claude.ai (un solo archivo HTML: `dist/copiloto-clinico.html`).

## Qué incluye

- **Hoy**: alertas de riesgo alto con cuenta regresiva de escalamiento, mensajes por responder, seguimientos, sesiones del día y recordatorios.
- **Pacientes**: conversación (registrar mensaje → clasificar → borrador → aprobar y copiar), plan (tareas, técnicas aprobadas, plan de seguridad), nota de sesión (nota o transcripción → expediente) y resumen antes de la sesión.
- **Protocolo de crisis**: los 3 niveles del concepto, tiempo de escalamiento X configurable, historial de alertas.
- **Biblioteca**: técnicas por situación y recursos curados (la IA solo recomienda lo que está aquí).
- **Piloto**: la tabla "Qué medimos" por semana y el criterio de éxito (escriben sin que se les insista; menos de 15 min/día).
- **Registro de errores**: todo lo que falla y cada vez que la IA se equivoca o se corrige su trabajo.

## Seguridad clínica

- Una red de palabras clave (`screenRisk`, versión `red-3`) corre siempre, sin IA. Si marca riesgo alto, la alerta suena
  y se muestra aunque la IA falle, la base de datos falle o la IA diga otra cosa. Regresión: `node test/risk-regression.mjs` (174 frases).
- La IA nunca baja un riesgo alto por sí sola; solo la psicóloga puede bajarlo.
- Una alerta escala después de X minutos si nadie responde al mensaje de crisis o marca "Ya contacté al paciente".

## Dónde viven los datos

- Pacientes, conversaciones y notas: subárbol privado de cada persona en la base del artefacto (`data/users/<id>/clinic`). Nadie más lo ve, ni el dueño del artefacto.
- Registro de errores (`errors`) y telemetría de uso (`sessions`): compartidos y **sin textos de pacientes ni teléfonos**.
- Para que la psicóloga pueda guardar, invítala por correo como **Editor** y no compartas el artefacto por enlace público.

## Leer el registro para optimizar

Cada documento de `errors` es un problema por sesión y huella (`fingerprint`), con `category`, `severity`, `module`, `code`,
`count`, `firstSeen`/`lastSeen`, `motivos`, `detail` (incluye versiones de instrucciones `version`/`promptVersion` y de la red `redVersion`)
y `status`. `sessions` guarda contadores de calidad de la IA (borradores aprobados sin cambios, editados, descartados, niveles corregidos),
latencias por función y minutos activos por día. Desde una sesión de Claude: "lee el registro de errores del Copiloto clínico y optimízalo".
Para marcar algo resuelto desde Claude, actualiza `status: "resuelto"` y `resolvedAt`; si el error vuelve a ocurrir, se reabre solo.

## Desarrollo

```sh
./build.sh                    # arma dist/copiloto-clinico.html y revisa la sintaxis
node test/risk-regression.mjs # red de seguridad
node test/unit-ai.mjs         # utilidades de IA
node test/smoke.mjs           # flujos completos con un simulador de window.claude (Playwright)
```

`test/harness.mjs` sirve la página con un simulador de `window.claude` y necesita una copia local de
morphdom 2.7.4 (`MORPHDOM_PATH=/ruta/morphdom-umd.min.js`, o en `vendor/morphdom-umd.min.js`) y Playwright.

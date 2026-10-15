/* =====================================================================
   Dibujo y arranque.
   ===================================================================== */

let renderTimer = null;
let slowRenderLogged = 0;
let lastRenderError = null;
function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = null; render(); }, 16);
}

function patch(el, html) {
  if (!el) return;
  if (window.morphdom) {
    window.morphdom(el, '<div>' + html + '</div>', {
      childrenOnly: true,
      onBeforeElUpdated(from, to) {
        // No toques el campo en el que la persona está escribiendo.
        // (Un campo de solo lectura sí se actualiza: ahí no hay nada que la persona pueda perder.)
        if (from === document.activeElement && !from.readOnly && !to.hasAttribute('readonly') &&
          (from.tagName === 'TEXTAREA' || from.tagName === 'SELECT' || (from.tagName === 'INPUT' && from.type !== 'checkbox' && from.type !== 'radio'))) {
          return false;
        }
        return true;
      }
    });
    return;
  }
  // Respaldo sin morphdom: conserva foco, selección y desplazamiento.
  const a = document.activeElement;
  const id = a && el.contains(a) ? a.id : null;
  const sel = id && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  const val = id && 'value' in a ? a.value : null;
  const scrolls = [...el.querySelectorAll('[id]')].filter((n) => n.scrollTop > 0).map((n) => [n.id, n.scrollTop]);
  el.innerHTML = html;
  scrolls.forEach(([sid, top]) => { const n = document.getElementById(sid); if (n) n.scrollTop = top; });
  if (id) {
    const n = document.getElementById(id);
    if (n) {
      if (val != null && 'value' in n && n.type !== 'checkbox') n.value = val;
      n.focus();
      if (sel && 'setSelectionRange' in n) { try { n.setSelectionRange(sel[0], sel[1]); } catch { /* algunos tipos no lo permiten */ } }
    }
  }
}

function render() {
  const t0 = performance.now();
  try {
    patch(document.getElementById('rail'), renderRail());
    patch(document.getElementById('view'), renderMain());
    patch(document.getElementById('modal-root'), renderModal());
    renderToasts();
    tickAlerts();
    if (S.ui.scrollThread) {
      S.ui.scrollThread = false;
      const th = document.querySelector('.thread');
      if (th) th.scrollTop = th.scrollHeight;
    }
    lastRenderError = null;
  } catch (e) {
    // Se registra una vez por falla distinta y sin volver a dibujar (evita un ciclo de errores).
    const sig = S.ui.view + '|' + S.ui.ptab + '|' + ((e && e.message) || e);
    if (sig !== lastRenderError) {
      lastRenderError = sig;
      ErrorLog.log({ category: 'runtime', severity: 'alta', module: currentModule(), code: (e && e.name) || 'Error', message: 'Falló al dibujar la vista: ' + ((e && e.message) || e), detail: { vista: S.ui.view, pestana: S.ui.ptab, pila: trimStack(e && e.stack) }, silent: true, noRender: true });
    }
    const v = document.getElementById('view');
    if (v) v.innerHTML = '<div class="main-inner"><div class="banner risk" role="alert"><p><strong>Algo falló al mostrar esta sección.</strong> Ya quedó en el registro de errores. Prueba otra sección o recarga la página.</p><button type="button" class="btn btn-sm" data-act="go" data-arg="hoy">Ir a Hoy</button></div></div>';
  }
  const ms = performance.now() - t0;
  if (ms > 300 && slowRenderLogged < 5) {
    slowRenderLogged++;
    ErrorLog.log({ category: 'rendimiento', severity: 'baja', module: currentModule(), code: 'dibujo_lento', message: 'Dibujar la vista tardó más de 300 ms', detail: { ms: Math.round(ms), vista: S.ui.view, pacientes: patients().length, eventos: allEvents().length }, silent: true, noRender: true });
  }
}

/* ---------- Capacidades ---------- */
async function useCap(name) {
  try {
    if (!window.claude || typeof window.claude.use !== 'function') return null;
    return await window.claude.use(name);
  } catch (e) {
    ErrorLog.log({ category: 'capacidad', severity: 'media', module: 'app', code: 'use_' + name, message: 'No se pudo obtener la capacidad ' + name, detail: { error: (e && (e.code || e.message)) || String(e) }, silent: true });
    return null;
  }
}

function enterDemo(reason) {
  S.demo = S.demo || makeDemo();
  S.mode = 'ejemplo';
  S.modeReason = reason;
  scheduleRender();
}

/* Suscripciones a tus datos. Una falla pasajera se reintenta; una terminal deja la app en solo lectura. */
const subRetries = {};
function listen(name, attach) {
  const onError = (err) => {
    const code = (err && err.code) || 'error';
    ErrorLog.log({ category: 'datos', severity: TERMINAL_DB_CODES.includes(code) ? 'critica' : 'alta', module: name === 'sesiones' ? 'telemetria' : 'datos', code: 'suscripcion_' + name + '_' + code, message: 'Se perdió la conexión con tus datos (' + name + ')', detail: { mensajePlataforma: err && err.message, intento: subRetries[name] || 0 }, mode: 'real', silent: name === 'sesiones' });
    if (code === 'unavailable' && (subRetries[name] = (subRetries[name] || 0) + 1) <= 6) {
      setTimeout(() => listen(name, attach), 1000 * 2 ** subRetries[name] + Math.random() * 1000);
      return;
    }
    if (TERMINAL_DB_CODES.includes(code)) S.status.db = 'terminal';
    if (name === 'ajustes') S.real.clinicError = true;
    if (name === 'pacientes') S.real.loaded.patients = true;
    if (name === 'eventos') S.real.loaded.events = true;
    scheduleRender();
  };
  try { attach(onError); } catch (e) { onError({ code: 'invalid_argument', message: (e && e.message) || String(e) }); }
}
function subscribeReal() {
  const db = S.caps.db;
  listen('ajustes', (onError) => clinicRef().onSnapshot((snap) => {
    // Un "no existe" que viene del caché no es definitivo: esperamos a la base antes de mostrar la bienvenida.
    if (!snap.exists && snap.metadata && snap.metadata.fromCache) return;
    subRetries.ajustes = 0;
    S.real.loaded.clinic = true;
    S.real.clinicError = false;
    S.real.clinicExists = !!snap.exists;
    S.real.settings = snap.exists ? Object.assign({}, snap.data()) : null;
    scheduleRender();
  }, onError));
  listen('pacientes', (onError) => patientsCol().limit(200).onSnapshot((snap) => {
    if (snap.empty && snap.metadata && snap.metadata.fromCache) return;
    subRetries.pacientes = 0;
    S.real.loaded.patients = true;
    S.real.patients = snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
    scheduleRender();
  }, onError));
  listen('eventos', (onError) => eventsCol().orderBy('ts', 'desc').limit(1000).onSnapshot((snap) => {
    subRetries.eventos = 0;
    S.real.loaded.events = true;
    S.real.events = mergeUnsaved(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })).reverse());
    if (snap.size >= 1000) {
      ErrorLog.log({ category: 'rendimiento', severity: 'media', module: 'datos', code: 'limite_eventos', message: 'Hay 1000 eventos o más: los más antiguos ya no se muestran', silent: true });
    }
    scheduleRender();
  }, onError));
  listen('sesiones', (onError) => db.collection('sessions').where('reporter', '==', S.status.uid).orderBy('startedAt', 'desc').limit(500).onSnapshot((snap) => {
    subRetries.sesiones = 0;
    S.sessions = snap.docs.map((d) => d.data());
    scheduleRender();
  }, onError));
}

async function boot() {
  ErrorLog.init();
  Telemetry.init();
  wireEvents();
  S.status.morph = window.morphdom ? 'ok' : 'respaldo';
  if (!window.morphdom) {
    ErrorLog.log({ category: 'capacidad', severity: 'baja', module: 'app', code: 'morphdom_no_cargo', message: 'No cargó la librería de dibujo; se usa el modo de respaldo', silent: true });
  }
  render();
  setInterval(tickAlerts, 1000);
  // Refresca tiempos relativos ("hace 3 min") cada minuto.
  setInterval(() => { if (document.visibilityState === 'visible') scheduleRender(); }, 60000);

  const [db, user, sample, downloads] = await Promise.all([useCap('db'), useCap('user'), useCap('sample'), useCap('downloads')]);
  S.caps = { db, user, sample, downloads };
  AI.sample = sample;
  S.status.ai = sample ? 'cargando' : 'no';
  if (!sample) ErrorLog.log({ category: 'capacidad', severity: 'alta', module: 'app', code: 'sin_ia', message: 'La IA no está disponible en esta vista; los mensajes se clasifican solo con palabras clave', detail: { dentroDeClaude: !!window.claude }, silent: true });

  let uid = null;
  if (user) {
    try { uid = await user.id(); } catch { uid = null; }
  }
  S.status.uid = uid;
  ErrorLog.attach(db, uid);
  Telemetry.attach(db, uid);

  if (!db) {
    S.status.db = 'no';
    enterDemo(window.claude ? 'Esta vista no tiene acceso a la base de datos (sesión cerrada o sin permiso).' : 'Esta copia de la página no está abierta dentro de Claude.');
    ErrorLog.log({ category: 'capacidad', severity: 'media', module: 'app', code: 'sin_base', message: 'La base de datos no está disponible en esta vista', detail: { dentroDeClaude: !!window.claude }, silent: true });
    return;
  }
  if (!uid) {
    S.status.db = 'sin_identidad';
    enterDemo('No pudimos identificar tu cuenta, así que no hay un espacio privado donde guardar.');
    ErrorLog.log({ category: 'capacidad', severity: 'alta', module: 'app', code: 'sin_identidad', message: 'Sin identidad de usuario: no se puede usar el espacio privado', silent: true });
    return;
  }
  S.status.db = 'ok';
  try {
    const canWrite = await user.can('data.write');
    S.status.canWrite = canWrite;
    if (canWrite === false) {
      S.status.db = 'solo_lectura';
      ErrorLog.log({ category: 'capacidad', severity: 'media', module: 'app', code: 'solo_lectura', message: 'La persona no tiene permiso de escritura', silent: true });
    }
  } catch { /* can() no rechaza; por si acaso */ }
  S.mode = 'real';
  subscribeReal();
  // Reintenta guardar lo que haya quedado pendiente por una falla de conexión.
  setInterval(() => { if (S.real.unsaved.size && document.visibilityState === 'visible') Store.retryUnsaved().catch(() => {}); }, 30000);
  scheduleRender();
}

boot().catch((e) => {
  ErrorLog.log({ category: 'runtime', severity: 'critica', module: 'app', code: (e && e.name) || 'Error', message: 'Falló el arranque: ' + ((e && e.message) || e), detail: { pila: trimStack(e && e.stack) } });
  enterDemo('La app no pudo arrancar normalmente.');
});

'use strict';
/* =====================================================================
   Copiloto clínico — núcleo: utilidades, estado, registro de errores,
   telemetría de uso y escritor serializado para la base de datos.
   ===================================================================== */

const APP_VERSION = '0.1.0';
const SESSION_ID = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- Utilidades ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const makeId = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowIso = () => new Date().toISOString();
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function hashStr(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function initials(name) {
  const parts = String(name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}
function safeJson(v) { try { return JSON.stringify(v, null, 2); } catch { return String(v); } }

/* Fechas (zona horaria del navegador) */
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fmtDate = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDateLong = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtTime = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });
function toDate(v) { const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d; }
function dayKey(v = new Date()) {
  const d = toDate(v); if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function startOfDay(v = new Date()) { const d = new Date(toDate(v) || Date.now()); d.setHours(0, 0, 0, 0); return d; }
function addDays(v, n) { const d = new Date(toDate(v) || Date.now()); d.setDate(d.getDate() + n); return d; }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }
function fromDayKey(k) { const [y, m, d] = String(k).split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null; }
function fmtWhen(iso) {
  const d = toDate(iso); if (!d) return '—';
  const diff = daysBetween(d, new Date());
  const t = fmtTime.format(d);
  if (diff === 0) return 'hoy ' + t;
  if (diff === 1) return 'ayer ' + t;
  if (diff > 1 && diff < 7) return WEEKDAYS_SHORT[d.getDay()] + ' ' + t;
  return fmtDate.format(d) + ' ' + t;
}
function relTime(iso) {
  const d = toDate(iso); if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 0) return 'en ' + humanDur(-s);
  if (s < 45) return 'hace un momento';
  return 'hace ' + humanDur(s);
}
function humanDur(s) {
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min';
  if (s < 86400) return Math.round(s / 3600) + ' h';
  return plural(Math.round(s / 86400), 'día', 'días');
}
function toLocalInput(iso) {
  const d = toDate(iso) || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function fromLocalInput(v) { const d = toDate(v); return d ? d.toISOString() : nowIso(); }

/* ---------- Estado de la aplicación ---------- */
const S = {
  caps: { db: null, user: null, sample: null, downloads: null },
  status: {
    db: 'cargando',        // cargando | ok | no | solo_lectura | sin_identidad | terminal
    canWrite: null,        // respuesta de user.can('data.write') al arrancar
    ai: 'cargando',        // cargando | ok | no | denegado | limitado
    uid: null,
    morph: 'cargando',     // ok | respaldo
    remoteLog: 'pendiente' // pendiente | activo | inactivo
  },
  mode: 'cargando',        // cargando | real | ejemplo
  modeReason: '',
  real: { loaded: { clinic: false, patients: false, events: false }, clinicExists: false, clinicError: false, settings: null, patients: [], events: [], unsaved: new Map(), pending: new Map() },
  demo: null,
  sessions: [],            // telemetría compartida (solo sesiones de esta persona)
  ui: {
    view: 'hoy', pid: null, ptab: 'conversacion', f: {}, busy: {}, stream: {}, open: {}, modal: null,
    logFilter: { sev: 'todas', cat: 'todas', estado: 'abierto', q: '' }, week: null, reportText: '', analysis: ''
  }
};

/* Valores por defecto de la configuración */
function defaultSettings() {
  return {
    psicologa: '',
    bienvenida: 'Me da mucho gusto acompañarte en este proceso.',
    minutosEscalamiento: 10,
    lineaCrisis: 'Línea de la Vida 800 911 2000 (gratuita, 24 horas)',
    emergencias: '911',
    horario: 'lunes a viernes de 9:00 a 20:00',
    sonidoAlerta: true,
    inicioPiloto: dayKey(),
    metaMinutos: 15,
    tecnicasPropias: [],
    recursos: [],
    valoracionPsicologa: null
  };
}

/* ---------- Escritor serializado: una escritura a la vez por documento ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const Writer = {
  chains: new Map(),   // path -> promesa de la última escritura encadenada
  queued: new Map(),   // path|op -> entrada aún no iniciada (para combinar ráfagas)
  /* op: 'set' | 'update' | 'delete' */
  write(ref, op, data, meta = {}) {
    const path = ref.path;
    const key = path + '|' + op;
    const q = this.queued.get(key);
    // Combina con una escritura igual que aún no empieza, solo si es la última en la cola de ese documento.
    if (q && op !== 'delete' && this.chains.get(path) === q.promise) {
      q.data = op === 'update' ? Object.assign({}, q.data, data) : data;
      return q.promise;
    }
    const prev = this.chains.get(path) || Promise.resolve();
    const entry = { data };
    entry.promise = prev.catch(() => {}).then(async () => {
      if (this.queued.get(key) === entry) this.queued.delete(key);
      const body = entry.data;
      for (let attempt = 0; ; attempt++) {
        try {
          if (op === 'set') await ref.set(body);
          else if (op === 'update') await ref.update(body);
          else await ref.delete();
          return;
        } catch (e) {
          if (e && e.code === 'unavailable' && attempt === 0) { await sleep(800 + Math.random() * 1200); continue; }
          handleWriteError(e, path, op, meta);
          throw e;
        }
      }
    });
    this.queued.set(key, entry);
    this.chains.set(path, entry.promise);
    entry.promise.catch(() => {}).finally(() => { if (this.chains.get(path) === entry.promise) this.chains.delete(path); });
    return entry.promise;
  }
};

function handleWriteError(e, path, op, meta) {
  const code = (e && e.code) || 'desconocido';
  const clinical = /^data\/users\//.test(String(path));
  if (!meta.noStatusChange) {
    if (TERMINAL_DB_CODES.includes(code)) S.status.db = 'terminal';
    // Solo un set() bien formado rechazado en tu espacio privado indica falta de permiso (db.d.ts).
    else if (code === 'invalid_argument' && op === 'set' && clinical && S.status.canWrite !== true && S.status.db === 'ok') S.status.db = 'solo_lectura';
  }
  ErrorLog.log({
    category: 'datos',
    severity: code === 'quota_exceeded' || (clinical && TERMINAL_DB_CODES.includes(code)) ? 'critica' : 'alta',
    module: meta.module || 'datos',
    code: 'escritura_' + code,
    message: code === 'quota_exceeded'
      ? 'La base de datos llegó a su límite; no se guardó el cambio'
      : code === 'invalid_argument'
        ? 'La base rechazó la escritura (permiso o formato)'
        : TERMINAL_DB_CODES.includes(code)
          ? 'Se cerró el acceso a la base durante la sesión'
          : 'No se pudo guardar un cambio',
    detail: { op, ruta: collectionOf(path), mensajePlataforma: e && e.message },
    mode: clinical ? 'real' : undefined,
    silent: true
  });
  if (!meta.silentToast) {
    toast(code === 'quota_exceeded'
      ? 'No se guardó: la base de datos está llena. Revisa el registro de errores.'
      : TERMINAL_DB_CODES.includes(code)
        ? 'Se cerró el acceso a tus datos. Recarga la página.'
        : S.status.db === 'solo_lectura'
          ? 'No se guardó: tu acceso no permite escribir. Pide acceso de Editor a quien te compartió esta página.'
          : meta.retryable ? 'No se guardó todavía: queda marcado como "no guardado" y se reintentará.' : 'No se guardó el cambio. Vuelve a intentarlo en un momento.', 'risk', { action: 'Ver registro', act: 'go', arg: 'registro' });
  }
  scheduleRender();
}
const KNOWN_SEGMENTS = new Set(['data', 'users', 'clinic', 'patients', 'events', 'errors', 'sessions']);
function collectionOf(path) {
  // Sustituye identificadores por * para no registrar IDs privados.
  return String(path).split('/').map((seg) => (KNOWN_SEGMENTS.has(seg) ? seg : '*')).join('/');
}

/* ---------- Limpieza de datos sensibles ---------- */
function scrub(s) {
  return String(s ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[teléfono]')
    .replace(/u_[A-Za-z0-9_-]{6,}/g, '[id]');
}
function cleanDetail(v, depth = 0) {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return Number.isFinite(v) || typeof v === 'boolean' ? v : String(v);
  if (typeof v === 'string') return scrub(v).slice(0, 400);
  if (depth > 2) return '[…]';
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => cleanDetail(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).slice(0, 24)) {
      const val = cleanDetail(v[k], depth + 1);
      if (val !== undefined) out[k] = val;
    }
    return out;
  }
  return String(v).slice(0, 200);
}
function shortUrl(u) {
  if (!u) return '';
  try { const x = new URL(u, location.href); return x.host === location.host ? x.pathname.split('/').pop() || '(página)' : x.host + x.pathname; } catch { return String(u).slice(0, 120); }
}
function trimStack(st) {
  if (!st) return '';
  return String(st).split('\n').slice(0, 6).map((l) => l.replace(/\(?(https?:\/\/[^)\s]+)\)?/g, (m, u) => shortUrl(u))).join('\n');
}
function envInfo() {
  const ua = navigator.userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'otro';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro';
  return { navegador: browser, sistema: os, pantalla: innerWidth + 'x' + innerHeight, idioma: navigator.language || '', enLinea: navigator.onLine !== false };
}

/* ---------- Registro de errores ---------- */
const SEV_ORDER = { critica: 4, alta: 3, media: 2, baja: 1 };
const SEV_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
const CAT_LABEL = {
  runtime: 'Error de la app',
  ia: 'Falla de la IA',
  calidad_ia: 'Calidad de la IA',
  seguridad_clinica: 'Seguridad clínica',
  datos: 'Datos y guardado',
  rendimiento: 'Rendimiento',
  capacidad: 'Permisos y conexión',
  reporte_usuario: 'Reporte manual'
};
const MOD_LABEL = {
  app: 'App', hoy: 'Hoy', pacientes: 'Pacientes', bandeja: 'Conversación', clasificacion: 'Clasificación de riesgo',
  borrador: 'Borrador de respuesta', seguimiento: 'Seguimiento', nota_sesion: 'Nota de sesión', resumen: 'Resumen',
  crisis: 'Protocolo de crisis', biblioteca: 'Biblioteca', piloto: 'Métricas del piloto', registro: 'Registro de errores',
  ajustes: 'Ajustes', datos: 'Datos', telemetria: 'Telemetría', analisis: 'Análisis del registro', cierre: 'Cierre de ciclo'
};
const MAX_DISTINCT_PER_SESSION = 80;    // tope para errores de poco valor
const HARD_CAP_PER_SESSION = 200;       // tope absoluto (seguridad clínica y calidad de IA incluidos)
const TERMINAL_DB_CODES = ['revoked', 'not_granted', 'capability_disabled', 'capability_removed'];

const ErrorLog = {
  entries: new Map(),     // fp -> entrada de esta sesión
  carried: new Map(),     // id -> entradas de sesiones previas sin sincronizar (desde localStorage)
  rev: new Map(),         // id -> número de revisión local
  dirty: new Set(),       // ids listos para escribir
  backoff: new Set(),     // ids esperando reintento
  inflight: new Set(),
  attempts: new Map(),
  created: new Set(),     // ids que ya existen en la base: se actualizan con update(), no se reemplazan
  remote: [],             // entradas leídas de la base (todas las sesiones)
  remoteLoaded: false,
  remoteLimit: 1000,
  db: null,
  reporter: null,
  remoteOk: false,
  noCreate: false,        // la base está llena: solo se actualizan documentos existentes
  remoteReason: 'sin conexión a la base',
  flushTimer: null,
  inLog: false,
  LOCAL_KEY: 'copiloto.registro.v1',

  init() {
    try {
      const raw = localStorage.getItem(this.LOCAL_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        for (const e of arr) {
          if (e && e.id && e.sessionId !== SESSION_ID) {
            this.carried.set(e.id, e);
            if (!e.synced) this.dirty.add(e.id);
          }
        }
      }
    } catch { /* almacenamiento bloqueado: seguimos solo en memoria */ }

    window.addEventListener('error', (ev) => {
      const t = ev.target;
      if (t && t !== window && t.tagName) {
        const src = t.src || t.href || '';
        this.log({
          category: 'capacidad', severity: t.tagName === 'SCRIPT' ? 'alta' : 'baja', module: 'app', code: 'recurso_no_cargo',
          message: 'No cargó un recurso (' + t.tagName.toLowerCase() + '): ' + shortUrl(src)
        });
        return;
      }
      this.log({
        category: 'runtime', severity: 'alta', code: (ev.error && ev.error.name) || 'Error',
        message: ev.message || String(ev.error || 'Error desconocido'),
        detail: { fuente: shortUrl(ev.filename), linea: ev.lineno, columna: ev.colno, pila: trimStack(ev.error && ev.error.stack) }
      });
    }, true);
    window.addEventListener('unhandledrejection', (ev) => {
      const r = ev.reason;
      if (r && r.code === 'cancelled') return;
      this.log({
        category: 'runtime', severity: 'alta', code: (r && (r.code || r.name)) || 'PromesaRechazada',
        message: (r && r.message) || String(r),
        detail: { pila: trimStack(r && r.stack) }
      });
    });
    document.addEventListener('securitypolicyviolation', (ev) => {
      this.log({ category: 'capacidad', severity: 'baja', module: 'app', code: 'bloqueo_csp', message: 'El navegador bloqueó: ' + ev.violatedDirective + ' ' + shortUrl(ev.blockedURI) });
    });
    // Escribe lo pendiente al ocultar o cerrar la página, y al recuperar la conexión.
    const flushNow = () => { if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; } this.flush(); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('online', () => { this.retryBackoff(); flushNow(); });
  },

  /* input: {category, severity, module, code, message, detail, note, silent, noRender} */
  log(input) {
    if (this.inLog) return null;
    this.inLog = true;
    try {
      const category = CAT_LABEL[input.category] ? input.category : 'runtime';
      const severity = SEV_ORDER[input.severity] ? input.severity : 'media';
      const module = input.module || currentModule();
      const code = String(input.code || 'desconocido').slice(0, 80);
      const message = scrub(input.message || '').slice(0, 300);
      const mode = input.mode === 'real' || input.mode === 'ejemplo' ? input.mode : (S.mode === 'ejemplo' ? 'ejemplo' : 'real');
      let fp = hashStr([category, module, code, mode, message.replace(/\d+/g, '#')].join('|'));
      let e = this.entries.get(fp);
      const now = nowIso();
      const valuable = category === 'seguridad_clinica' || category === 'calidad_ia' || SEV_ORDER[severity] >= 3;
      const overflow = !e && (this.entries.size >= HARD_CAP_PER_SESSION || (this.entries.size >= MAX_DISTINCT_PER_SESSION && !valuable));
      if (overflow) {
        fp = 'desborde';
        e = this.entries.get(fp);
        if (!e) {
          e = this.newEntry(fp, { category: 'rendimiento', severity: 'media', module: 'app', code: 'demasiados_errores', message: 'Demasiados errores distintos en una sesión; los siguientes solo se cuentan aquí por código' });
          e.detail = {};
          this.entries.set(fp, e);
        }
        e.detail = Object.assign({}, e.detail);
        const k = (category + '.' + code).slice(0, 60);
        e.detail[k] = (e.detail[k] || 0) + 1;
      } else if (!e) {
        e = this.newEntry(fp, { category, severity, module, code, message, note: input.note, mode });
        this.entries.set(fp, e);
      }
      e.count += 1;
      e.lastSeen = now;
      if (!overflow) {
        if (input.detail !== undefined) e.detail = cleanDetail(input.detail);
        // Histograma de motivos para que repeticiones con distinto motivo no se pierdan.
        const mot = input.detail && (input.detail.motivo || input.detail.codigoIA);
        if (mot) { e.motivos = Object.assign({}, e.motivos); const mk = String(mot).slice(0, 40); e.motivos[mk] = (e.motivos[mk] || 0) + 1; }
        if (input.note && e.count > 1) e.note = scrub(input.note).slice(0, 1500);
        if (SEV_ORDER[severity] > SEV_ORDER[e.severity]) e.severity = severity;
      }
      // Si ya estaba resuelto y vuelve a pasar, se reabre.
      if (e.status === 'resuelto') { e.status = 'abierto'; e.reabiertoEn = now; e.vecesReabierto = (e.vecesReabierto || 0) + 1; e.resolvedAt = null; }
      e.synced = false;
      this.rev.set(e.id, (this.rev.get(e.id) || 0) + 1);
      this.backoff.delete(e.id);
      this.attempts.delete(e.id);
      this.dirty.add(e.id);
      this.saveLocal();
      this.scheduleFlush();
      Telemetry.bump('errores_' + category, 1, mode === 'real');
      if (!input.silent && SEV_ORDER[e.severity] >= 3 && fp !== 'desborde') {
        toast(SEV_LABEL[e.severity] + ' · ' + CAT_LABEL[e.category] + ': ' + e.message, e.severity === 'critica' ? 'risk' : '', { action: 'Ver registro', act: 'go', arg: 'registro' });
      }
      if (!input.noRender) scheduleRender();
      return e;
    } catch (err) {
      try { console.warn('[registro] no se pudo registrar', err); } catch { /* nada */ }
      return null;
    } finally {
      this.inLog = false;
    }
  },

  newEntry(fp, x) {
    const t = nowIso();
    return {
      id: SESSION_ID + '_' + fp, v: 2, appVersion: APP_VERSION, riskVersion: typeof RISK_VERSION !== 'undefined' ? RISK_VERSION : null, fingerprint: fp,
      category: x.category, severity: x.severity, module: x.module, code: x.code, message: x.message,
      note: x.note ? scrub(x.note).slice(0, 1500) : '', detail: null, motivos: null, count: 0,
      firstSeen: t, lastSeen: t, sessionId: SESSION_ID, reporter: this.reporter || null,
      mode: x.mode || (S.mode === 'ejemplo' ? 'ejemplo' : 'real'), env: envInfo(), status: 'abierto', resolvedAt: null, synced: false
    };
  },

  findLocal(id) {
    for (const e of this.entries.values()) if (e.id === id) return e;
    return this.carried.get(id) || null;
  },

  saveLocal() {
    try {
      const mine = [...this.entries.values()];
      const carried = [...this.carried.values()].filter((e) => !e.synced);
      const all = mine.concat(carried).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 150);
      localStorage.setItem(this.LOCAL_KEY, JSON.stringify(all));
    } catch { /* sin almacenamiento local */ }
  },

  attach(db, reporter) {
    this.db = db;
    this.reporter = reporter || null;
    this.remoteOk = !!db;
    this.remoteReason = db ? '' : 'sin conexión a la base';
    S.status.remoteLog = db ? 'activo' : 'inactivo';
    for (const e of this.entries.values()) { if (!e.reporter) e.reporter = this.reporter; }
    for (const e of this.carried.values()) { if (!e.reporter) e.reporter = this.reporter; }
    if (!db) return;
    this.scheduleFlush(300);
    this.subscribe(0);
  },

  subscribe(attempt) {
    try {
      this.unsub = this.db.collection('errors').orderBy('lastSeen', 'desc').limit(this.remoteLimit).onSnapshot((snap) => {
        this.remote = snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
        for (const r of this.remote) {
          this.created.add(r.id);
          // Si Claude (u otra pestaña) resolvió o reabrió una entrada ya sincronizada, la copia local lo adopta.
          const l = this.findLocal(r.id);
          if (l && l.synced && r.status && l.status !== r.status) { l.status = r.status; l.resolvedAt = r.resolvedAt || null; this.saveLocal(); }
        }
        this.remoteLoaded = true;
        scheduleRender();
      }, (err) => {
        const code = (err && err.code) || 'error';
        this.remoteLoaded = true;
        this.log({ category: 'datos', severity: 'media', module: 'registro', code: 'lectura_' + code, message: 'No se pudo leer el registro compartido', silent: true });
        if (code === 'unavailable' && attempt < 5) setTimeout(() => this.subscribe(attempt + 1), 2000 * 2 ** attempt + Math.random() * 1000);
      });
    } catch (err) {
      this.log({ category: 'datos', severity: 'media', module: 'registro', code: 'suscripcion_fallida', message: String((err && err.message) || err), silent: true });
    }
  },

  scheduleFlush(delay = 1500) {
    if (!this.db || !this.remoteOk || this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, delay);
  },

  retryBackoff() {
    for (const id of this.backoff) this.dirty.add(id);
    this.backoff.clear();
  },

  async flush() {
    if (!this.db || !this.remoteOk) return;
    for (const id of [...this.dirty]) {
      if (this.inflight.has(id)) continue;
      const e = this.findLocal(id);
      if (!e) { this.dirty.delete(id); continue; }
      const isNew = !this.created.has(id);
      if (isNew && this.noCreate) continue; // base llena: no se crean documentos nuevos
      this.dirty.delete(id);
      this.inflight.add(id);
      const revAt = this.rev.get(id) || 0;
      const body = Object.assign({}, e);
      delete body.synced;
      if (!body.reporter) body.reporter = this.reporter || null;
      const ref = this.db.collection('errors').doc(id);
      try {
        if (isNew) {
          await ref.set(body);
          this.created.add(id);
        } else {
          // update() conserva los campos que Claude haya escrito (por ejemplo una nota de resolución).
          const { count, lastSeen, severity, detail, motivos, note, mode, status, resolvedAt, reabiertoEn, vecesReabierto } = body;
          await ref.update(JSON.parse(JSON.stringify({ count, lastSeen, severity, detail, motivos, note, mode, status, resolvedAt, reabiertoEn: reabiertoEn || null, vecesReabierto: vecesReabierto || 0 })));
        }
        if ((this.rev.get(id) || 0) === revAt) e.synced = true;
        this.attempts.delete(id);
        this.backoff.delete(id);
        this.saveLocal();
      } catch (err) {
        const code = (err && err.code) || 'desconocido';
        const n = (this.attempts.get(id) || 0) + 1;
        this.attempts.set(id, n);
        if (code === 'invalid_argument' && !isNew) {
          // El documento ya no existe (lo borraron): se vuelve a crear en el siguiente intento.
          this.created.delete(id);
          this.dirty.add(id);
        } else if (code === 'quota_exceeded') {
          if (!this.noCreate && Telemetry.data) { Telemetry.data.registroLleno = { desde: nowIso(), motivo: scrub((err && err.message) || '').slice(0, 200) }; Telemetry.dirty = true; Telemetry.flush(true); }
          this.noCreate = true;
          this.remoteReason = 'la base está llena; solo se actualizan entradas existentes';
          if (isNew) this.dirty.add(id); else this.backoffRetry(id, code, n);
        } else if (code === 'invalid_argument' || TERMINAL_DB_CODES.includes(code)) {
          this.remoteOk = false;
          this.remoteReason = code === 'invalid_argument' ? 'tu acceso no permite escribir en el registro compartido' : 'la conexión con la base se cerró';
          S.status.remoteLog = 'inactivo';
          this.dirty.add(id);
        } else {
          this.backoffRetry(id, code, n);
        }
      } finally {
        this.inflight.delete(id);
      }
    }
    if (this.dirty.size && this.remoteOk && [...this.dirty].some((id) => !this.inflight.has(id) && (this.created.has(id) || !this.noCreate))) this.scheduleFlush();
    scheduleRender();
  },

  backoffRetry(id, code, n) {
    if (n > 10) { this.backoff.add(id); return; } // se reintenta al volver la conexión o la visibilidad
    this.backoff.add(id);
    const base = code === 'resource_exhausted' ? 30000 : 4000;
    setTimeout(() => { if (this.backoff.delete(id)) { this.dirty.add(id); this.scheduleFlush(0); } }, Math.min(300000, base * 2 ** (n - 1)) + Math.random() * 1000);
  },

  pendingCount() { return new Set([...this.dirty, ...this.backoff, ...this.inflight]).size; },
  stateLabel() { return !this.remoteOk ? 'inactivo (' + this.remoteReason + ')' : this.noCreate ? 'lleno: las entradas nuevas solo quedan en este navegador' : 'activo'; },

  /* Todas las entradas visibles: base compartida + locales sin sincronizar */
  all() {
    const map = new Map();
    for (const r of this.remote) map.set(r.id, Object.assign({ synced: true }, r));
    const locals = [...this.entries.values(), ...this.carried.values()];
    for (const l of locals) {
      const r = map.get(l.id);
      if (!r) { map.set(l.id, Object.assign({}, l)); continue; }
      // Lo local sin sincronizar manda; si ya está sincronizado, manda la base (Claude pudo resolverlo).
      map.set(l.id, l.synced ? Object.assign({}, l, r, { synced: true }) : Object.assign({}, r, l));
    }
    return [...map.values()].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
  },

  async setStatus(id, status) {
    const resolvedAt = status === 'resuelto' ? nowIso() : null;
    const local = this.findLocal(id);
    if (local) {
      local.status = status; local.resolvedAt = resolvedAt;
      this.rev.set(id, (this.rev.get(id) || 0) + 1); local.synced = false; this.dirty.add(id); this.saveLocal();
      this.scheduleFlush(200);
    } else if (this.db && this.remoteOk && this.remote.some((r) => r.id === id)) {
      const r = this.remote.find((x) => x.id === id);
      if (r) { r.status = status; r.resolvedAt = resolvedAt; }
      try {
        // Escritura directa: un error del registro compartido nunca cambia el estado de tus datos clínicos.
        await this.db.collection('errors').doc(id).update({ status, resolvedAt });
      } catch (err) {
        toast('No se pudo cambiar el estado de la entrada (' + ((err && err.code) || 'error') + ').');
      }
    }
    scheduleRender();
  }
};

function currentModule() {
  const v = S.ui.view;
  if (v === 'pacientes') return S.ui.ptab === 'conversacion' ? 'bandeja' : S.ui.ptab === 'nota' ? 'nota_sesion' : S.ui.ptab === 'resumen' ? 'resumen' : 'pacientes';
  if (v === 'protocolo') return 'crisis';
  return MOD_LABEL[v] ? v : 'app';
}

/* ---------- Telemetría de uso (sin contenido clínico) ---------- */
const Telemetry = {
  data: null,
  dirty: false,
  timer: null,
  lastWrite: 0,
  lastInteraction: Date.now(),
  db: null,
  init() {
    this.data = {
      v: 2, sessionId: SESSION_ID, appVersion: APP_VERSION, riskVersion: typeof RISK_VERSION !== 'undefined' ? RISK_VERSION : null,
      promptVersions: typeof PROMPT_VERSIONS !== 'undefined' ? PROMPT_VERSIONS : null,
      startedAt: nowIso(), lastSeen: nowIso(), day: dayKey(),
      reporter: null, mode: S.mode, activeSeconds: { real: 0, ejemplo: 0 }, activeByDay: {}, counts: {},
      ai: { calls: 0, fails: 0, totalMs: 0, maxMs: 0, byFeature: {} }, env: envInfo()
    };
    const mark = () => { this.lastInteraction = Date.now(); };
    ['pointerdown', 'keydown', 'scroll', 'input'].forEach((t) => window.addEventListener(t, mark, { passive: true, capture: true }));
    setInterval(() => this.tick(), 15000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(true); });
  },
  attach(db, reporter) { this.db = db; this.data.reporter = reporter || null; this.schedule(); },
  tick() {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - this.lastInteraction > 90000) return;
    const key = S.mode === 'real' ? 'real' : 'ejemplo';
    this.data.activeSeconds[key] = (this.data.activeSeconds[key] || 0) + 15;
    // Por día local, para que una pestaña abierta toda la noche no cargue todo al día en que se abrió.
    const d = dayKey();
    const slot = this.data.activeByDay[d] || (this.data.activeByDay[d] = { real: 0, ejemplo: 0 });
    slot[key] += 15;
    this.dirty = true;
    this.schedule();
  },
  /* En modo ejemplo los contadores van con prefijo "ejemplo." para no ensuciar las métricas reales del piloto. */
  bump(key, n = 1, forceReal = false) {
    if (!this.data) return;
    const k = S.mode === 'ejemplo' && !forceReal ? 'ejemplo.' + key : key;
    this.data.counts[k] = (this.data.counts[k] || 0) + n;
    this.dirty = true;
    this.schedule();
  },
  aiCall(feature, ms, ok, tier) {
    if (!this.data) return;
    if (S.mode === 'ejemplo') { this.bump('ia_llamadas'); return; }
    const a = this.data.ai;
    a.calls += 1; if (!ok) a.fails += 1;
    a.totalMs += Math.round(ms); a.maxMs = Math.max(a.maxMs, Math.round(ms));
    const f = a.byFeature[feature] || (a.byFeature[feature] = { calls: 0, fails: 0, totalMs: 0, maxMs: 0, version: null, tiers: {} });
    f.calls += 1; if (!ok) f.fails += 1; f.totalMs += Math.round(ms); f.maxMs = Math.max(f.maxMs || 0, Math.round(ms));
    f.version = (typeof PROMPT_VERSIONS !== 'undefined' && PROMPT_VERSIONS[feature]) || null;
    if (tier) { f.tiers = f.tiers || {}; f.tiers[tier] = (f.tiers[tier] || 0) + 1; }
    this.dirty = true;
    this.schedule();
  },
  schedule() {
    if (!this.db || this.timer) return;
    const wait = Math.max(5000, 60000 - (Date.now() - this.lastWrite));
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, wait);
  },
  async flush(force) {
    if (!this.db || !this.dirty) return;
    if (!force && Date.now() - this.lastWrite < 55000) { this.schedule(); return; }
    this.dirty = false;
    this.lastWrite = Date.now();
    this.data.lastSeen = nowIso();
    this.data.mode = S.mode;
    try {
      await Writer.write(this.db.collection('sessions').doc(SESSION_ID), 'set', JSON.parse(JSON.stringify(this.data)), { module: 'telemetria', silentToast: true, noStatusChange: true });
    } catch (err) {
      const c = err && err.code;
      if (c === 'invalid_argument' || c === 'quota_exceeded' || TERMINAL_DB_CODES.includes(c)) {
        // Sin permiso o sin espacio: deja de intentar en esta sesión.
        this.db = null;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      }
    }
  }
};

/* ---------- Avisos breves ---------- */
let toastSeq = 0;
const toasts = [];
function toast(text, kind = '', opts = {}) {
  const id = ++toastSeq;
  toasts.push({ id, text: String(text), kind, action: opts.action, act: opts.act, arg: opts.arg });
  while (toasts.length > 4) toasts.shift();
  renderToasts();
  setTimeout(() => { const i = toasts.findIndex((t) => t.id === id); if (i >= 0) { toasts.splice(i, 1); renderToasts(); } }, kind === 'risk' ? 12000 : 6000);
}
function renderToasts() {
  const el = document.getElementById('toasts');
  if (!el) return;
  el.innerHTML = toasts.map((t) => '<div class="toast ' + esc(t.kind) + '" role="status"><div>' + esc(t.text) + '</div><div class="row">' +
    (t.action ? '<button type="button" data-act="' + esc(t.act) + '" data-arg="' + esc(t.arg || '') + '">' + esc(t.action) + '</button>' : '') +
    '<button type="button" data-act="toast-close" data-arg="' + t.id + '" aria-label="Cerrar aviso">✕</button></div></div>').join('');
}
function closeToast(id) { const i = toasts.findIndex((t) => String(t.id) === String(id)); if (i >= 0) { toasts.splice(i, 1); renderToasts(); } }

/* ---------- Portapapeles ---------- */
async function copyText(text, okMsg = 'Copiado. Pégalo en WhatsApp.') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
    return true;
  } catch (e) {
    ErrorLog.log({ category: 'capacidad', severity: 'baja', module: currentModule(), code: 'portapapeles_bloqueado', message: 'El navegador no permitió copiar al portapapeles', silent: true });
    S.ui.modal = { kind: 'copy', text };
    scheduleRender();
    return false;
  }
}

/* Mock of the claude.ai artifact runtime (contract 0.2.77 subset) for local tests.
   Configure before page scripts run via window.__MOCK = { db: true, user: true, sample: true, downloads: true, uid: 'u_test1', canWrite: true, ai: 'ok'|'fail'|'normal'|'invalid'|'denied'|'slow' } */
(function () {
  const M = window.__MOCK = Object.assign({ db: true, user: true, sample: true, downloads: true, uid: 'u_testviewer01', canWrite: true, ai: 'ok', failWrites: false }, window.__MOCK || {});
  const store = window.__STORE = new Map(); // path -> data
  const listeners = new Set();
  const calls = window.__CALLS = { sample: [], writes: [], downloads: [] };
  const segs = (p) => String(p).split('/');
  function checkPath(p, even) {
    const s = segs(p);
    if (s.some((x) => !x || !/^[A-Za-z0-9_\-.~:@+]+$/.test(x) || x === '.' || x === '..')) throw new TypeError('bad path segment in ' + p);
    if ((s.length % 2 === 0) !== even) throw new TypeError('parity: ' + p + ' has ' + s.length + ' segments');
  }
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const snapDoc = (path) => ({ id: segs(path).pop(), exists: store.has(path), data: () => (store.has(path) ? clone(store.get(path)) : undefined), metadata: { fromCache: false, hasPendingWrites: false } });
  function notify() { setTimeout(() => listeners.forEach((l) => { try { l(); } catch (e) { console.error(e); } }), 5); }
  function canWritePath(path) {
    if (!M.canWrite) return false;
    const s = segs(path);
    if (s[0] === 'data' && s[1] === 'users' && s[2] !== M.uid) return false;
    return true;
  }
  async function write(path, op, data) {
    calls.writes.push({ path, op, data: data ? clone(data) : null });
    if (M.failWrites) throw { code: M.failWrites, message: 'mock failure' };
    if (!canWritePath(path)) throw { code: 'invalid_argument', message: 'write denied' };
    if (op !== 'delete') {
      if (data === null || typeof data !== 'object' || Array.isArray(data)) throw { code: 'invalid_argument', message: 'body must be object' };
      if (JSON.stringify(data).length > 256 * 1024) throw { code: 'invalid_argument', message: 'too big' };
      JSON.stringify(data, (k, v) => { if (v === undefined) throw { code: 'invalid_argument', message: 'undefined value at ' + k }; return v; });
    }
    if (op === 'set') store.set(path, clone(data));
    else if (op === 'update') {
      if (!store.has(path)) throw { code: 'invalid_argument', message: 'update on missing doc' };
      const merge = (a, b) => { for (const k of Object.keys(b)) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], b[k]); else a[k] = clone(b[k]); } return a; };
      store.set(path, merge(store.get(path), data));
    } else store.delete(path);
    notify();
  }
  function docRef(path) {
    checkPath(path, true);
    return {
      id: segs(path).pop(), path,
      get: async () => snapDoc(path),
      set: (d) => write(path, 'set', d),
      update: (d) => write(path, 'update', d),
      delete: () => write(path, 'delete'),
      acquire: async () => ({ acquired: true }),
      onSnapshot(next, error) {
        let last;
        const fire = () => { const s = snapDoc(path); const j = JSON.stringify([s.exists, s.data()]); if (j !== last) { last = j; next(s); } };
        listeners.add(fire); setTimeout(fire, 10);
        return () => listeners.delete(fire);
      },
      collection: (p) => colRef(path + '/' + p)
    };
  }
  function query(path, filters, order, lim) {
    const run = () => {
      const depth = segs(path).length + 1;
      let docs = [...store.keys()].filter((k) => k.startsWith(path + '/') && segs(k).length === depth).map((k) => snapDoc(k));
      for (const [f, op, v] of filters) {
        docs = docs.filter((d) => { const x = d.data()[f]; return op === '==' ? x === v : op === '!=' ? x !== v : op === '<' ? x < v : op === '>' ? x > v : op === '<=' ? x <= v : op === '>=' ? x >= v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : true; });
      }
      if (order) docs.sort((a, b) => { const x = a.data()[order[0]], y = b.data()[order[0]]; const c = x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : x > y ? 1 : 0; return order[1] === 'desc' ? -c : c; });
      else docs.sort((a, b) => (a.id < b.id ? -1 : 1));
      if (lim) docs = docs.slice(0, lim);
      return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    };
    const q = {
      where: (f, op, v) => query(path, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, d = 'asc') => query(path, filters, [f, d], lim),
      limit: (n) => { if (n < 1 || n > 1000) throw { code: 'invalid_argument' }; return query(path, filters, order, n); },
      get: async () => run(),
      onSnapshot(next, error) {
        let last;
        const fire = () => { const r = run(); const j = JSON.stringify(r.docs.map((d) => [d.id, d.data()])); if (j !== last) { last = j; next(r); } };
        listeners.add(fire); setTimeout(fire, 10);
        return () => listeners.delete(fire);
      }
    };
    return q;
  }
  function colRef(path) {
    checkPath(path, false);
    const q = query(path, [], null, null);
    return Object.assign(q, { path, doc: (id) => docRef(path + '/' + (id || ('auto' + Math.random().toString(36).slice(2, 10)))), add: async (d) => { const r = docRef(path + '/auto' + Math.random().toString(36).slice(2, 10)); await r.set(d); return r; } });
  }
  const db = Object.freeze({ doc: docRef, collection: colRef });
  const user = Object.freeze({ isOwner: async () => true, canEdit: async () => M.canWrite, can: async (n) => (n === 'data.write' ? M.canWrite : false), id: async () => M.uid, me: async () => ({ id: M.uid, name: '', email: null, avatarUrl: '', color: '#888', isOwner: true, canEdit: true }), profiles: async () => ({}), name: async () => '', avatarUrl: async () => null, search: async () => [], email: async () => null });

  function classifyReply(input) {
    const msg = (input.split('=== ÚLTIMO MENSAJE DEL PACIENTE')[1] || '').toLowerCase();
    let nivel = 'normal';
    if (M.ai !== 'normal') {
      if (/matar|morir|suicid|pastillas|cortarme/.test(msg)) nivel = 'riesgo_alto';
      else if (/ansiedad|p[aá]nico|llor|necesito hablar/.test(msg)) nivel = 'malestar';
    }
    return { nivel, intensidad: nivel === 'normal' ? 1 : 4, senales: ['mock'], temas: ['ansiedad'], tecnica_id: 't_resp46', recurso_id: null, tarea_id: null, tarea_estado: null, borrador: 'Hola, soy la asistente de Alexa. Respuesta de prueba (' + nivel + ').', nota_para_psicologa: 'Nota de prueba.' };
  }
  function reply(input) {
    if (input.includes('TAREA: (1) clasifica')) return JSON.stringify(classifyReply(input));
    if (input.includes('Conviértela en un registro ordenado')) return JSON.stringify({ resumen_clinico: 'Se trabajó ansiedad laboral.', temas: ['ansiedad laboral'], tareas: ['Llenar el diario de emociones'], tecnicas_sugeridas: ['t_diario', 'inventada'], pendientes: ['Revisar lo de su mamá'], revisar_en_dias: 14, seguimiento_en_dias: 3, mensaje_para_paciente: 'Hola, soy la asistente de Alexa. Hoy acordaron llenar tu diario.' });
    if (input.includes('mensaje de seguimiento proactivo')) return 'Hola, soy la asistente de Alexa. ¿Cómo te has sentido?\nResponde: Bien / Más o menos / Necesito hablar';
    if (input.includes('antes de la sesión')) return 'Ana: 2 registros de ansiedad.\n• Revisar diario.';
    if (input.includes('registro de errores')) return '1) Problema de prueba.';
    return 'Texto de prueba.';
  }
  async function core(input, opts = {}, asJson) {
    calls.sample.push({ input: typeof input === 'string' ? input.slice(0, 300) : input, opts: Object.keys(opts), asJson });
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'aborted' };
    if (M.ai === 'denied') throw { code: 'not_granted', message: 'declined' };
    if (M.ai === 'fail') { await new Promise((r) => setTimeout(r, 50)); throw { code: 'upstream_error', message: 'mock upstream' }; }
    await new Promise((r, j) => { const t = setTimeout(r, M.ai === 'slow' ? 3000 : 60); if (opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(t); j({ code: 'cancelled', message: 'aborted' }); }); });
    const text = typeof input === 'string' ? (M.ai === 'invalid' && asJson ? 'no es json' : reply(input)) : 'ok';
    if (opts.onText) opts.onText({ text, delta: text });
    if (asJson) { try { return JSON.parse(text); } catch { throw { code: 'invalid_json', message: 'bad json', text }; } }
    return { text, truncated: false, modelTierApplied: opts.modelTier || 'default' };
  }
  const sample = Object.assign((i, o) => core(i, o, false), { json: (i, o) => core(i, o, true), limits: async () => ({ maxPromptBytes: 262144 }) });
  const downloads = Object.freeze({ save: async (r) => { calls.downloads.push({ filename: r.filename, size: String(r.data).length }); return { status: 'saved' }; } });
  const caps = { db: M.db ? db : null, user: M.user ? user : null, sample: M.sample ? sample : null, downloads: M.downloads ? downloads : null };
  window.claude = Object.freeze({ use: (n) => new Promise((r) => setTimeout(() => r(caps[n] ?? null), 20)) });
})();

/* =====================================================================
   Acciones: cada botón con data-act llama a ACTIONS[nombre](arg, el, ev).
   Todo error en una acción queda en el registro.
   ===================================================================== */

function formKeysClear(prefix) { for (const k of Object.keys(S.ui.f)) if (k.startsWith(prefix)) delete S.ui.f[k]; }
function blurActive() { const a = document.activeElement; if (a && a !== document.body && typeof a.blur === 'function') a.blur(); }
function needPatient(pid) { const p = patientById(pid); if (!p) throw new Error('Paciente no encontrado'); return p; }

/* Similitud por palabras (LCS): 0 = idéntico, 1 = totalmente distinto */
function editRatio(a, b) {
  const A = fold(a).split(/\s+/).filter(Boolean).slice(0, 400);
  const B = fold(b).split(/\s+/).filter(Boolean).slice(0, 400);
  if (!A.length && !B.length) return 0;
  const dp = new Array(B.length + 1).fill(0);
  for (let i = 1; i <= A.length; i++) {
    let prev = 0;
    for (let j = 1; j <= B.length; j++) {
      const tmp = dp[j];
      dp[j] = A[i - 1] === B[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return Math.round((1 - (2 * dp[B.length]) / (A.length + B.length)) * 100) / 100;
}

/* Sonido de alerta (solo suena tras una interacción de la persona) */
function alarm() {
  if (!settings().sonidoAlerta) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = alarm.ctx || (alarm.ctx = new Ctx());
    if (ctx.state === 'suspended') ctx.resume();
    [0, 0.75].forEach((offset) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t = ctx.currentTime + offset;
      o.type = 'sine'; o.frequency.setValueAtTime(880, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.6);
    });
  } catch (e) {
    ErrorLog.log({ category: 'capacidad', severity: 'baja', module: 'crisis', code: 'audio_bloqueado', message: 'El navegador no permitió reproducir el sonido de alerta', silent: true });
  }
}

/* ---------- Clasificación y alertas ----------
   Regla de oro: avisar primero, guardar después. Ninguna falla de la base ni de la IA
   puede impedir que una alerta de riesgo alto suene, se vea y escale. */
function realEscalationMinutes() { return Number((S.real.settings || {}).minutosEscalamiento) || 10; }
function alertStart(a) { return Math.min(new Date(a.ts).getTime(), new Date(a.entradaTs || a.ts).getTime()); }

/* opts.reabrir: solo cuando TÚ vuelves a subir el nivel después de cerrar la alerta.
   opts.desdeLlegada: la alerta nace al registrar el mensaje; el tiempo cuenta desde que el paciente escribió. */
async function raiseAlert(p, entrada, fuente, opts = {}) {
  // Una alerta por mensaje; solo tú puedes volver a levantar una que ya cerraste.
  if (allEvents().some((a) => a.tipo === 'alerta' && a.origen === entrada.id && a.nivel === 'riesgo_alto' && (a.estado !== 'cerrada' || !opts.reabrir))) return;
  Telemetry.bump('alertas_riesgo');
  alarm();
  toast('Riesgo alto: ' + (p ? p.alias : 'paciente') + '. Atiende ahora.', 'risk', { action: 'Ver alerta', act: 'go', arg: 'hoy' });
  const x = Number(settings().minutosEscalamiento) || 10;
  const late = opts.desdeLlegada ? Math.round((Date.now() - new Date(entrada.ts || Date.now()).getTime()) / 60000) : 0;
  if (late > x) {
    ErrorLog.log({ category: 'seguridad_clinica', severity: 'alta', module: 'crisis', code: 'alerta_tardia', message: 'Un mensaje de riesgo alto se registró después del tiempo de escalamiento desde que llegó', detail: { minutosDesdeLlegada: late, minutosConfigurados: x, fuente }, silent: true });
  }
  await Store.addEvent({ pid: entrada.pid || (p && p.id), tipo: 'alerta', ts: nowIso(), entradaTs: opts.desdeLlegada ? (entrada.ts || null) : null, nivel: 'riesgo_alto', origen: entrada.id, fuente, estado: 'activa', categorias: entrada.categoriasRed || [] });
}

async function registerInbound(pid, texto, ts, rapida) {
  const p = needPatient(pid);
  const red = screenRisk(texto);
  const nivel = red.nivel === 'riesgo_alto' ? 'riesgo_alto' : (rapida === 'necesito_hablar' ? 'malestar' : null);
  const entrada = {
    id: makeId('e'), pid, tipo: 'entrada', ts, texto, rapida: rapida || null, redVersion: RISK_VERSION,
    nivelRed: red.nivel, categoriasRed: red.categorias, nivel, nivelFuente: nivel ? 'red' : null, estado: 'pendiente'
  };
  // El mensaje queda en pantalla de inmediato (addEvent lo agrega antes de escribir). Guardar, alertar y
  // clasificar arrancan juntos: ni una base lenta ni la IA retrasan la alarma, y puedes registrar el siguiente mensaje.
  const tasks = [Store.addEvent(entrada)];
  if (red.nivel === 'riesgo_alto') tasks.push(raiseAlert(p, entrada, 'red', { desdeLlegada: true }));
  const done = AI.available()
    ? classify(entrada.id)
    : (Telemetry.bump('clasificados_sin_ia_' + (S.status.ai || 'no')), applyFallback(entrada.id, 'no_disponible', red.nivel !== 'normal'));
  done.catch((err) => ErrorLog.log({ category: 'runtime', severity: 'alta', module: 'clasificacion', code: (err && (err.name || err.code)) || 'Error', message: 'Falló la clasificación en segundo plano: ' + ((err && err.message) || err), detail: { pila: trimStack(err && err.stack) } }));
  await Promise.all(tasks);
  Telemetry.bump('mensajes_registrados');
  S.ui.scrollThread = true;
  return entrada.id;
}

/* Sin IA, IA fallida o detenida: nunca baja el nivel ni borra un borrador existente. */
async function applyFallback(eid, code, logIt) {
  const e = eventById(eid);
  if (!e) return;
  const p = patientByIdAny(e.pid);
  let final;
  if (e.nivelAjustadoPor === 'psicologa' && e.nivel) {
    final = e.nivel;
  } else {
    final = maxLevel(e.nivel || 'normal', e.nivelRed || 'normal');
    if (e.rapida === 'necesito_hablar') final = maxLevel(final, 'malestar');
  }
  const patch = { nivel: final, errorIA: (code === 'no_disponible' || code === 'cancelado') ? null : code, detenidoPorUsuario: code === 'cancelado' };
  if (e.nivelAjustadoPor !== 'psicologa' && !e.nivelIA) patch.nivelFuente = 'red';
  if (!e.borrador || e.borradorDescartado) {
    const b = final === 'riesgo_alto' ? crisisTemplate(p) : final === 'malestar' ? malestarTemplate(p, e.categoriasRed || []) : '';
    Object.assign(patch, { borrador: b || null, borradorIA: b || null, borradorFuente: b ? 'plantilla' : null, borradorDescartado: false });
  }
  const firstPass = e.estado === 'pendiente' && !e.analizadoEn;
  const alertP = final === 'riesgo_alto' ? raiseAlert(p, e, e.nivelAjustadoPor === 'psicologa' ? 'psicologa' : 'red', { desdeLlegada: firstPass }) : null;
  await Store.updateEvent(eid, patch);
  if (alertP) await alertP;
  if (logIt) {
    ErrorLog.log({
      category: 'seguridad_clinica', module: 'clasificacion', code: 'clasificado_sin_ia_' + code,
      severity: code === 'cancelado' ? 'baja' : code === 'no_disponible' ? 'media' : (final === 'normal' ? 'media' : 'alta'),
      message: code === 'cancelado' ? 'Se detuvo la IA: el mensaje quedó con el nivel de la red de palabras clave'
        : code === 'no_disponible' ? 'Sin IA en esta vista: el mensaje se clasificó solo con palabras clave'
          : 'La IA falló: el mensaje se clasificó solo con palabras clave',
      detail: { codigoIA: code, nivelRed: e.nivelRed || null, nivelFinal: final, respuestaRapida: !!e.rapida, redVersion: RISK_VERSION }, silent: true
    });
  }
}

const QUALITY_MESSAGES = {
  tecnica_fuera_del_plan: 'La IA sugirió una técnica que no está aprobada para el paciente (puede seguir en el texto del borrador)',
  recurso_fuera_de_lista: 'La IA mencionó un recurso que no está en la lista curada (puede seguir en el texto del borrador)',
  se_presenta_como_psicologa: 'El borrador habla como si fuera la psicóloga'
};

async function classify(eid) {
  const e0 = eventById(eid);
  if (!e0) return;
  const p = patientByIdAny(e0.pid);
  if (!p) return;
  const key = 'cls:' + eid;
  if (S.ui.busy[key]) return;
  const modeAtStart = S.mode;
  S.ui.busy[key] = true;
  delete S.ui.f['draft.' + eid];
  scheduleRender();
  let raw;
  try {
    try {
      raw = await AI.run({ feature: 'clasificacion', key, input: promptClassify(p, e0), json: true });
    } catch (err) {
      if (!(err && err.code === 'prompt_too_large')) throw err;
      // Reintento único con menos historial
      raw = await AI.run({ feature: 'clasificacion', key, input: promptClassify(p, e0).replace(/=== CONVERSACIÓN RECIENTE[\s\S]*?=== ÚLTIMO/, '=== ÚLTIMO'), json: true });
    }
  } catch (err) {
    delete S.ui.busy[key];
    if (S.mode !== modeAtStart) { scheduleRender(); return; }
    const code = err && err.code === 'cancelled' ? 'cancelado' : (err && err.code) || 'upstream_error';
    await applyFallback(eid, code, true);
    if (code !== 'cancelado') toast(aiErrorCopy(err) + ' El mensaje quedó clasificado con la red de seguridad: revisa el nivel.', 'risk');
    scheduleRender();
    return;
  }
  delete S.ui.busy[key];
  if (S.mode !== modeAtStart) {
    ErrorLog.log({ category: 'runtime', severity: 'media', module: 'clasificacion', code: 'clasificacion_descartada_cambio_modo', message: 'Se cambió de modo mientras la IA clasificaba; se descartó el resultado', silent: true });
    scheduleRender();
    return;
  }
  const cur = eventById(eid) || e0;
  const c = normalizeClassification(raw, p);
  const red = cur.nivelRed || 'normal';
  const manual = cur.nivelAjustadoPor === 'psicologa' && cur.nivel;
  for (const pr of c.problemas) {
    if (!QUALITY_MESSAGES[pr]) continue;
    ErrorLog.log({ category: 'calidad_ia', severity: pr === 'se_presenta_como_psicologa' ? 'media' : 'alta', module: 'borrador', code: pr, message: QUALITY_MESSAGES[pr], detail: { version: PROMPT_VERSIONS.clasificacion }, silent: true });
  }
  if (c.problemas.includes('nivel_mal_escrito')) ErrorLog.log({ category: 'ia', severity: 'baja', module: 'clasificacion', code: 'nivel_mal_escrito', message: 'La IA escribió el nivel con otro formato (se interpretó)', detail: { valor: c.nivelCrudo }, silent: true });
  let final = c.nivel || maxLevel(red, 'malestar'); // nivel inválido: al menos malestar, para que lo revise una persona
  if (!c.nivel) ErrorLog.log({ category: 'ia', severity: 'alta', module: 'clasificacion', code: 'nivel_invalido', message: 'La IA no devolvió un nivel válido; se usó la red de seguridad', detail: { valor: c.nivelCrudo, version: PROMPT_VERSIONS.clasificacion }, silent: true });
  const netForced = red === 'riesgo_alto' && final !== 'riesgo_alto';
  if (netForced) {
    final = 'riesgo_alto';
    if (!manual && !cur.analizadoEn) ErrorLog.log({ category: 'calidad_ia', severity: 'alta', module: 'clasificacion', code: 'discrepancia_red_ia', message: 'La IA clasificó por debajo de riesgo alto un mensaje que la red de palabras clave marcó como riesgo alto; se dejó en riesgo alto', detail: { nivelIA: c.nivel, categoriasRed: cur.categoriasRed || [], redVersion: RISK_VERSION, version: PROMPT_VERSIONS.clasificacion }, silent: true });
  } else if (c.nivel === 'normal' && red === 'malestar') {
    const medios = (cur.categoriasRed || []).includes('medios_mencionados');
    ErrorLog.log({ category: 'calidad_ia', severity: medios ? 'media' : 'baja', module: 'clasificacion', code: 'nivel_bajado_por_ia', message: 'La IA clasificó como día normal un mensaje que la red marcó como malestar (decide la IA)', detail: { categoriasRed: cur.categoriasRed || [] }, silent: true });
  }
  let keptHigh = false;
  if (!manual && cur.nivel === 'riesgo_alto' && final !== 'riesgo_alto') {
    keptHigh = true;
    // Regenerar nunca baja un riesgo alto por sí solo: eso lo decides tú.
    ErrorLog.log({ category: 'calidad_ia', severity: 'alta', module: 'clasificacion', code: 'riesgo_inconsistente_al_regenerar', message: 'Al regenerar, la IA bajó un mensaje que ya estaba en riesgo alto; se mantuvo en riesgo alto', detail: { nivelNuevoIA: c.nivel, nivelIAAnterior: cur.nivelIA || null }, silent: true });
    final = 'riesgo_alto';
  }
  if (cur.rapida === 'necesito_hablar') final = maxLevel(final, 'malestar');
  if (manual) final = cur.nivel; // si ajustaste el nivel a mano, se respeta
  let borrador = c.borrador;
  let fuente = 'ia';
  if (!c.nivel) { borrador = final === 'riesgo_alto' ? crisisTemplate(p) : malestarTemplate(p, cur.categoriasRed || []); fuente = 'plantilla'; }
  else if (final === 'riesgo_alto' && c.nivel !== 'riesgo_alto') { borrador = crisisTemplate(p); fuente = 'plantilla'; }
  else if (!borrador) { borrador = final === 'riesgo_alto' ? crisisTemplate(p) : final === 'malestar' ? malestarTemplate(p, cur.categoriasRed || []) : ''; fuente = borrador ? 'plantilla' : null; }
  if (final === 'riesgo_alto' && fuente === 'ia') {
    const chk = ensureCrisisElements(borrador);
    if (chk.faltan.length) {
      borrador = chk.text;
      ErrorLog.log({ category: 'calidad_ia', severity: 'alta', module: 'borrador', code: 'borrador_crisis_incompleto', message: 'El borrador de crisis de la IA no traía todo el guion; se completó', detail: { faltan: chk.faltan, version: PROMPT_VERSIONS.clasificacion }, silent: true });
    }
  }
  // Alarma primero (si aplica), guardar después.
  const firstPass = !cur.analizadoEn;
  const alertP = final === 'riesgo_alto' ? raiseAlert(p, cur, red === 'riesgo_alto' ? 'red' : manual ? 'psicologa' : 'ia', { desdeLlegada: firstPass && !manual }) : null;
  const fuenteNivel = manual ? cur.nivelFuente : (netForced || !c.nivel) ? 'red' : keptHigh ? (cur.nivelFuente || 'ia') : 'ia';
  await Store.updateEvent(eid, {
    nivelIA: c.nivel, nivel: final, nivelFuente: fuenteNivel, intensidad: c.intensidad, temas: c.temas, senales: c.senales,
    tecnicaId: c.tecnicaId, recursoId: c.recursoId, tareaId: c.tareaId, tareaEstado: c.tareaEstado,
    problemasIA: c.problemas.filter((x) => QUALITY_MESSAGES[x]),
    borrador: borrador || null, borradorIA: borrador || null, borradorFuente: fuente, borradorDescartado: false, notaIA: c.nota,
    errorIA: null, detenidoPorUsuario: false, analizadoEn: nowIso(), promptVersion: PROMPT_VERSIONS.clasificacion
  });
  Telemetry.bump('borradores_generados');
  if (alertP) await alertP;
  scheduleRender();
}

/* Responder al mensaje de crisis cuenta como atender SU alerta (paso 1 del protocolo).
   Otros mensajes (recordatorios, respuestas a mensajes anteriores) no la atienden. */
async function ackPatientAlerts(pid, via, origenId) {
  for (const a of activeAlerts(pid)) {
    if (a.nivel === 'riesgo_alto' && !a.ackEn && a.origen === origenId) {
      await Store.updateEvent(a.id, { ackEn: nowIso(), estado: 'atendida', ackVia: via });
      Telemetry.bump('alertas_atendidas');
    }
  }
}

/* ---------- Mensajes salientes ---------- */
function templateFor(kind, p) {
  const s = settings();
  const psi = psiName();
  const next = nextSessionDate(p);
  const when = next ? fmtDateLong.format(next) + ' a las ' + fmtTime.format(next) : 'tu próxima cita';
  switch (kind) {
    case 'bienvenida':
      return 'Hola ' + p.alias + ', soy ' + psi + '. ' + s.bienvenida + '\n\n' +
        'A partir de hoy, en este chat te acompaña mi asistente: te confirma las citas, te pregunta cómo vas con lo que acordamos y te sugiere técnicas de tu plan. Yo leo un resumen antes de cada sesión.\n\n' +
        'Cómo funciona:\n• Tus mensajes los leemos mi asistente y yo ' + s.horario + '; fuera de ese horario puede que no los veamos hasta el siguiente día hábil.\n' +
        '• Si piensas en hacerte daño o estás en peligro, no esperes respuesta: llama a la ' + s.lineaCrisis + ' o al ' + s.emergencias + '.\n' +
        '• Puedes pedir "borrar esta conversación de mi teléfono" cuando quieras; tu registro clínico conmigo se conserva.\n\n— ' + psi;
    case 'recordatorio':
      return 'Hola ' + p.alias + ', soy la asistente de ' + psi + '. Te recuerdo tu cita el ' + when + '. ¿Confirmas? Responde "Sí" o "Necesito reagendar".';
    case 'pago':
      return 'Hola ' + p.alias + ', soy la asistente de ' + psi + '. Te comparto un recordatorio amable del pago de tu sesión. Si ya lo hiciste, ignora este mensaje. ¡Gracias!';
    case 'reagendar':
      return 'Hola ' + p.alias + ', soy la asistente de ' + psi + '. Necesitamos mover tu cita del ' + when + '. ¿Qué día y horario te acomodan esta semana?';
    default:
      return '';
  }
}
const OUT_FEATURE = { seguimiento: 'seguimiento', cierre: 'cierre' };
function outModule(kind) { return kind === 'resumen_sesion' ? 'nota_sesion' : kind === 'seguimiento' ? 'seguimiento' : kind === 'cierre' ? 'cierre' : 'bandeja'; }

/* Cada nueva redacción invalida a la anterior (token por paciente): un resultado viejo nunca pisa uno nuevo. */
async function composeOut(pid, kind) {
  const p = needPatient(pid);
  S.ui.out = S.ui.out || {};
  S.ui.outGen = S.ui.outGen || {};
  const gen = (S.ui.outGen[pid] = (S.ui.outGen[pid] || 0) + 1);
  const key = 'out:' + pid;
  AI.stop(key);
  delete S.ui.busy[key];
  delete S.ui.busy['fu:' + pid];
  S.ui.view = 'pacientes';
  S.ui.pid = pid;
  S.ui.ptab = 'conversacion';
  S.ui.mobileDetail = true;
  const current = () => S.ui.outGen[pid] === gen;
  if (OUT_FEATURE[kind]) {
    if (!AI.available()) {
      const tpl = kind === 'seguimiento' ? followUpTemplate(p) : '';
      S.ui.out[pid] = { kind, fuente: tpl ? 'plantilla' : 'propio', aiOriginal: tpl || null };
      S.ui.f['out.' + pid] = tpl;
      scheduleRender();
      return;
    }
    S.ui.out[pid] = { kind, fuente: 'ia', aiOriginal: null };
    S.ui.f['out.' + pid] = '';
    S.ui.busy[key] = true;
    if (kind === 'seguimiento') S.ui.busy['fu:' + pid] = true;
    scheduleRender();
    try {
      const input = kind === 'seguimiento' ? promptFollowUp(p) : promptCycleClose(p, eventsFor(pid));
      const text = await AI.run({
        feature: OUT_FEATURE[kind], key, input, tier: kind === 'seguimiento' ? 'quick' : 'default',
        onText: ({ text: t }) => { if (current()) { S.ui.f['out.' + pid] = t; scheduleRender(); } }
      });
      if (!current()) return;
      let final = text;
      if (kind === 'seguimiento' && !/bien\s*\/\s*mas o menos\s*\/\s*necesito hablar/.test(fold(text).replace(/\s+/g, ' '))) {
        ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: 'seguimiento', code: 'sin_respuestas_rapidas', message: 'El seguimiento no incluyó las respuestas rápidas (se agregaron)', detail: { version: PROMPT_VERSIONS.seguimiento }, silent: true });
        final = text + '\nResponde: Bien / Más o menos / Necesito hablar';
      }
      if (soundsLikePsychologist(final)) {
        S.ui.out[pid].aviso = 'El mensaje habla como si fueras tú. Revísalo: la asistente debe presentarse como tu asistente.';
        ErrorLog.log({ category: 'calidad_ia', severity: 'media', module: outModule(kind), code: 'se_presenta_como_psicologa', message: QUALITY_MESSAGES.se_presenta_como_psicologa, detail: { tipo: kind, version: PROMPT_VERSIONS[OUT_FEATURE[kind]] }, silent: true });
      }
      S.ui.f['out.' + pid] = final;
      S.ui.out[pid].aiOriginal = final;
      Telemetry.bump('borradores_generados_' + kind);
    } catch (err) {
      if (!current() || !S.ui.out[pid]) return;
      if (err && err.code === 'cancelled') {
        S.ui.out[pid].fuente = 'propio';
      } else {
        const tpl = kind === 'seguimiento' ? followUpTemplate(p) : '';
        S.ui.f['out.' + pid] = (err && err.text) || tpl;
        S.ui.out[pid] = { kind, fuente: tpl ? 'plantilla' : 'propio', aiOriginal: tpl || null };
        toast(aiErrorCopy(err) + (tpl ? ' Te dejé una plantilla.' : ''));
      }
    } finally {
      if (current()) {
        delete S.ui.busy[key];
        delete S.ui.busy['fu:' + pid];
        scheduleRender();
      }
    }
    return;
  }
  const tpl = templateFor(kind, p);
  S.ui.out[pid] = { kind, fuente: tpl ? 'plantilla' : 'propio', aiOriginal: tpl || null };
  S.ui.f['out.' + pid] = tpl;
  scheduleRender();
  setTimeout(() => { const el = document.getElementById(idSafe('out.' + pid)); if (el) el.focus(); }, 60);
}
/* Invalida cualquier redacción en curso del paciente (token, IA y banderas de trabajo). */
function invalidateOut(pid) {
  S.ui.outGen = S.ui.outGen || {};
  S.ui.outGen[pid] = (S.ui.outGen[pid] || 0) + 1;
  AI.stop('out:' + pid);
  delete S.ui.busy['out:' + pid];
  delete S.ui.busy['fu:' + pid];
}
/* Lo que se copia es exactamente lo que se ve en pantalla. */
function visibleValue(key, fallback) {
  const el = document.getElementById(idSafe(key));
  return String(el && typeof el.value === 'string' ? el.value : fval(key, fallback || ''));
}

/* ---------- Escalamiento: revisión cada segundo (datos reales aunque estés en modo ejemplo) ---------- */
const escalated = new Set();
function tickAlerts() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const t0 = new Date(el.getAttribute('data-countdown')).getTime();
    const min = Number(el.getAttribute('data-min')) || 10;
    const left = Math.round((t0 + min * 60000 - Date.now()) / 1000);
    el.textContent = left > 0 ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : '0:00';
  });
  const groups = [];
  if (S.caps.db && S.status.uid) groups.push({ mode: 'real', events: S.real.events, x: realEscalationMinutes() });
  if (S.mode === 'ejemplo' && S.demo) groups.push({ mode: 'ejemplo', events: S.demo.events, x: Number((S.demo.settings || {}).minutosEscalamiento) || 10 });
  for (const g of groups) {
    for (const a of g.events) {
      if (a.tipo !== 'alerta' || a.estado === 'cerrada' || a.nivel !== 'riesgo_alto' || a.ackEn || a.escaladaEn || escalated.has(a.id)) continue;
      if (Date.now() - alertStart(a) <= g.x * 60000) continue;
      escalated.add(a.id);
      const mins = Math.round((Date.now() - alertStart(a)) / 60000);
      a.escaladaEn = nowIso();
      if (g.mode === 'real') {
        ErrorLog.log({ category: 'seguridad_clinica', severity: 'critica', module: 'crisis', code: 'alerta_sin_respuesta', message: 'Una alerta de riesgo alto pasó el tiempo de escalamiento sin atender y escaló', detail: { minutosConfigurados: g.x, minutosTranscurridos: mins, fuente: a.fuente, enModoEjemplo: S.mode === 'ejemplo' }, mode: 'real', silent: true });
        Telemetry.bump('alertas_escaladas', 1, true);
        // Mismo camino que cualquier cambio real: sirve para alertas guardadas, en vuelo o sin guardar.
        if (!isReadOnly()) updateRealEvent(a, { escaladaEn: a.escaladaEn }).catch(() => {});
      }
      alarm();
      scheduleRender();
    }
  }
}

/* ---------- Reporte del registro (agrupado por huella) ---------- */
function groupEntries(list) {
  const g = new Map();
  for (const e of list) {
    const k = (e.fingerprint || e.category + '|' + e.code) + '|' + (e.mode || 'real');
    const x = g.get(k) || Object.assign({}, e, { count: 0, sesiones: 0, versiones: new Set(), motivos: {} });
    x.count += e.count || 0;
    x.sesiones += 1;
    if (String(e.lastSeen) > String(x.lastSeen)) { x.lastSeen = e.lastSeen; x.detail = e.detail; x.message = e.message; }
    if (String(e.firstSeen) < String(x.firstSeen)) x.firstSeen = e.firstSeen;
    if (SEV_ORDER[e.severity] > SEV_ORDER[x.severity]) x.severity = e.severity;
    x.versiones.add(e.appVersion);
    for (const [m, n] of Object.entries(e.motivos || {})) x.motivos[m] = (x.motivos[m] || 0) + n;
    g.set(k, x);
  }
  return [...g.values()];
}
function buildReport() {
  const all = ErrorLog.all();
  const open = all.filter((e) => e.status !== 'resuelto');
  const realOpen = open.filter((e) => e.mode !== 'ejemplo');
  const lines = [];
  lines.push('# Registro de errores · Copiloto clínico v' + APP_VERSION);
  lines.push('Generado: ' + new Date().toLocaleString('es-MX') + ' · Documentos: ' + all.length + ' (abiertos ' + open.length + ', de modo ejemplo ' + open.filter((e) => e.mode === 'ejemplo').length + ') · Modo actual: ' + S.mode);
  lines.push('Versiones: app ' + APP_VERSION + ' · red de palabras clave ' + RISK_VERSION + ' · instrucciones ' + Object.entries(PROMPT_VERSIONS).map(([k, v]) => k + '=' + v).join(', '));
  if (ErrorLog.remote.length >= ErrorLog.remoteLimit) lines.push('Nota: solo se leyeron los ' + ErrorLog.remoteLimit + ' documentos más recientes; la colección "errors" completa está en la base.');
  if (ErrorLog.pendingCount()) lines.push('Pendientes de sincronizar en este navegador: ' + ErrorLog.pendingCount());
  lines.push('');
  lines.push('## Abiertos por severidad (sin modo ejemplo)');
  Object.keys(SEV_LABEL).forEach((s) => lines.push('- ' + SEV_LABEL[s] + ': ' + realOpen.filter((e) => e.severity === s).length));
  lines.push('');
  lines.push('## Abiertos por categoría (sin modo ejemplo)');
  Object.keys(CAT_LABEL).forEach((c) => { const n = realOpen.filter((e) => e.category === c).length; if (n) lines.push('- ' + CAT_LABEL[c] + ': ' + n); });
  lines.push('');
  const groups = groupEntries(open).sort((a, b) => (a.mode === 'ejemplo') - (b.mode === 'ejemplo') || SEV_ORDER[b.severity] - SEV_ORDER[a.severity] || b.count - a.count);
  lines.push('## Problemas abiertos agrupados (' + groups.length + '; más graves primero, máximo 80)');
  groups.slice(0, 80).forEach((e) => {
    lines.push('- [' + (SEV_LABEL[e.severity] || e.severity).toUpperCase() + '] ' + (CAT_LABEL[e.category] || e.category) + ' · ' + (MOD_LABEL[e.module] || e.module) + ' · ' + e.code + ' · ×' + e.count + ' en ' + plural(e.sesiones, 'sesión', 'sesiones') + ' · ' + e.firstSeen + ' → ' + e.lastSeen + ' · v' + [...e.versiones].join('/') + (e.mode === 'ejemplo' ? ' · MODO EJEMPLO' : '') + (e.vecesReabierto ? ' · reabierto ' + e.vecesReabierto + ' veces' : ''));
    lines.push('  ' + e.message + (e.note ? ' — Nota: ' + e.note : '') + (Object.keys(e.motivos).length ? ' — Motivos: ' + JSON.stringify(e.motivos) : '') + (e.detail ? ' — Último detalle: ' + JSON.stringify(e.detail) : ''));
  });
  if (groups.length > 80) lines.push('- … y ' + (groups.length - 80) + ' grupos más (ver la colección "errors").');
  const resolved = all.filter((e) => e.status === 'resuelto');
  if (resolved.length) lines.push('', 'Resueltos: ' + resolved.length + ' documentos (' + groupEntries(resolved).length + ' grupos).');
  const q = qualityTotals(true);
  const feats = {};
  for (const s of sessionsForStats(true)) {
    for (const [k, v] of Object.entries((s.ai && s.ai.byFeature) || {})) {
      const f = feats[k] || (feats[k] = { calls: 0, fails: 0, totalMs: 0, maxMs: 0, versions: new Set(), tiers: {} });
      f.calls += v.calls || 0; f.fails += v.fails || 0; f.totalMs += v.totalMs || 0; f.maxMs = Math.max(f.maxMs, v.maxMs || 0);
      if (v.version) f.versions.add(v.version);
      for (const [t, n] of Object.entries(v.tiers || {})) f.tiers[t] = (f.tiers[t] || 0) + n;
    }
  }
  lines.push('');
  lines.push('## Calidad de la IA (telemetría real de ' + plural(sessionsForStats(true).length, 'sesión', 'sesiones') + ')');
  lines.push('- Llamadas: ' + q.llamadas + ' · fallas: ' + q.fallas + ' · tiempo promedio: ' + (q.llamadas ? (q.ms / q.llamadas / 1000).toFixed(1) + ' s' : '—'));
  Object.entries(feats).forEach(([k, v]) => lines.push('  - ' + (MOD_LABEL[k] || k) + ' [' + [...v.versions].join('/') + ']: ' + v.calls + ' llamadas, ' + v.fails + ' fallas, ' + (v.calls ? (v.totalMs / v.calls / 1000).toFixed(1) : '0') + ' s promedio, ' + (v.maxMs / 1000).toFixed(1) + ' s máx, modelos ' + JSON.stringify(v.tiers)));
  lines.push('- Borradores redactados: ' + q.generados + ' · aprobados sin cambios: ' + q.sinCambios + ' · editados: ' + q.editados + ' · descartados: ' + q.descartados + ' · niveles corregidos: ' + q.ajustes);
  const counts = {};
  for (const s of sessionsForStats(true)) for (const [k, v] of Object.entries(s.counts || {})) if (!k.startsWith('ejemplo.')) counts[k] = (counts[k] || 0) + v;
  lines.push('- Contadores: ' + Object.entries(counts).sort().map(([k, v]) => k + '=' + v).join(', '));
  lines.push('');
  lines.push('## Entorno');
  const envs = {};
  all.forEach((e) => { if (e.env) { const k = e.env.navegador + ' / ' + e.env.sistema; envs[k] = (envs[k] || 0) + 1; } });
  Object.entries(envs).forEach(([k, v]) => lines.push('- ' + k + ': ' + v + ' documentos'));
  lines.push('- Estado actual: base=' + S.status.db + ', IA=' + S.status.ai + ', registro compartido=' + ErrorLog.stateLabel() + ', dibujo=' + S.status.morph + ', eventos sin guardar=' + S.real.unsaved.size);
  return lines.join('\n');
}

/* ---------- Tabla de acciones ---------- */
const ACTIONS = {
  'go'(view) {
    if (!VIEWS.some(([id]) => id === view)) return;
    S.ui.prevModule = currentModule();
    S.ui.view = view;
    if (view === 'pacientes') S.ui.mobileDetail = false;
    scheduleRender();
    window.scrollTo({ top: 0 });
  },
  'toast-close'(id) { closeToast(id); },
  async 'retry-unsaved'() {
    const n = await Store.retryUnsaved();
    toast(n ? 'Se guardaron ' + plural(n, 'registro', 'registros') + '.' : 'Todavía no se pudo guardar. Revisa tu conexión e intenta de nuevo.', n ? '' : 'risk');
  },
  'select-patient'(pid) { S.ui.pid = pid; S.ui.mobileDetail = true; S.ui.scrollThread = true; scheduleRender(); },
  'back-to-list'() { S.ui.mobileDetail = false; scheduleRender(); },
  'open-patient'(pid) {
    if (!patientById(pid)) { toast('Ese paciente está archivado. Sus datos se conservan.'); return; }
    S.ui.view = 'pacientes'; S.ui.pid = pid; S.ui.ptab = 'conversacion'; S.ui.mobileDetail = true; S.ui.scrollThread = true; scheduleRender(); window.scrollTo({ top: 0 });
  },
  'open-summary'(pid) { S.ui.view = 'pacientes'; S.ui.pid = pid; S.ui.ptab = 'resumen'; S.ui.mobileDetail = true; scheduleRender(); window.scrollTo({ top: 0 }); },
  'ptab'(tab) { S.ui.ptab = tab; if (tab === 'conversacion') S.ui.scrollThread = true; scheduleRender(); },
  'toggle-open'(key) { S.ui.open[key] = !S.ui.open[key]; scheduleRender(); },
  'ai-stop'(key) { AI.stop(key); },
  'close-modal'() { S.ui.modal = null; scheduleRender(); },
  'modal-backdrop'(arg, el, ev) { if (ev && ev.target === el && S.ui.downOnBackdrop) { S.ui.modal = null; scheduleRender(); } },
  'explore-demo'() {
    if (AI.inflight.size || Object.keys(S.ui.busy).length) { toast('Espera a que la asistente termine (o detenla) antes de cambiar de modo.'); return; }
    if (S.real.events.some((a) => a.tipo === 'alerta' && a.nivel === 'riesgo_alto' && a.estado !== 'cerrada' && !a.ackEn)) { toast('Hay una alerta de riesgo alto sin atender. Atiéndela antes de explorar el modo ejemplo.', 'risk'); return; }
    S.demo = S.demo || makeDemo();
    S.mode = 'ejemplo'; S.modeReason = 'elegido';
    S.ui.pid = null; S.ui.view = 'hoy'; S.ui.out = {}; S.ui.noteDraft = {};
    Telemetry.bump('modo_ejemplo');
    scheduleRender();
  },
  'exit-demo'() {
    if (!(S.caps.db && S.status.uid)) { toast('Esta vista no tiene base de datos: solo puedes usar el modo ejemplo.'); return; }
    if (AI.inflight.size || Object.keys(S.ui.busy).length) { toast('Espera a que la asistente termine (o detenla) antes de cambiar de modo.'); return; }
    S.mode = 'real'; S.modeReason = ''; S.ui.pid = null; S.ui.out = {}; S.ui.noteDraft = {};
    scheduleRender();
  },
  /* Bienvenida y ajustes */
  async 'save-onboarding'() {
    const nombre = String(fval('ob.nombre', '')).trim();
    if (!nombre) { toast('Escribe tu nombre como lo verán tus pacientes.'); document.getElementById(idSafe('ob.nombre'))?.focus(); return; }
    await Store.saveSettings({
      psicologa: nombre, bienvenida: String(fval('ob.frase', defaultSettings().bienvenida)).trim(),
      minutosEscalamiento: clamp(Number(fval('ob.minutos', 10)) || 10, 1, 120), horario: String(fval('ob.horario', defaultSettings().horario)).trim(),
      inicioPiloto: dayKey(), creado: nowIso()
    });
    formKeysClear('ob.');
    ACTIONS['new-patient']();
  },
  async 'save-settings'() {
    await Store.saveSettings({
      psicologa: String(fval('st.nombre', settings().psicologa)).trim(),
      bienvenida: String(fval('st.frase', settings().bienvenida)).trim(),
      horario: String(fval('st.horario', settings().horario)).trim(),
      inicioPiloto: fval('st.inicio', settings().inicioPiloto) || dayKey(),
      metaMinutos: clamp(Number(fval('st.meta', settings().metaMinutos)) || 15, 1, 240)
    });
    formKeysClear('st.');
    toast('Ajustes guardados.');
  },
  async 'save-protocol'() {
    const prev = settings();
    const min = clamp(Number(fval('pr.min', prev.minutosEscalamiento)) || 10, 1, 120);
    await Store.saveSettings({
      minutosEscalamiento: min, emergencias: String(fval('pr.em', prev.emergencias)).trim() || '911',
      lineaCrisis: String(fval('pr.linea', prev.lineaCrisis)).trim() || defaultSettings().lineaCrisis,
      horario: String(fval('pr.horario', prev.horario)).trim(), sonidoAlerta: !!fval('pr.sonido', prev.sonidoAlerta)
    });
    if (min !== prev.minutosEscalamiento) Telemetry.bump('x_minutos_cambiado');
    formKeysClear('pr.');
    toast('Protocolo guardado.');
  },
  'test-sound'() { alarm(); },
  async 'save-psi-rating'(arg, el) { await Store.saveSettings({ valoracionPsicologa: el.value ? Number(el.value) : null }); delete S.ui.f['pi.val']; },
  'set-week'(n) { S.ui.week = Number(n); scheduleRender(); },

  /* Pacientes */
  'new-patient'() { formKeysClear('np.'); S.ui.modal = { kind: 'new-patient' }; scheduleRender(); setTimeout(() => document.getElementById(idSafe('np.alias'))?.focus(), 60); },
  async 'create-patient'() {
    const alias = String(fval('np.alias', '')).trim();
    const err = !alias ? 'Escribe un alias o iniciales.'
      : !fval('np.adulto', false) ? 'El piloto es solo para pacientes adultos (18 años o más).'
        : !fval('np.consent', false) ? 'Activa al paciente solo después de que firme el consentimiento informado.'
          : fval('np.riesgo', false) ? 'Fuera del alcance del piloto: pacientes en riesgo alto sin plan de seguridad activo. Primero elaboren el plan en sesión.'
            : null;
    if (err) { S.ui.modal = { kind: 'new-patient', error: err }; scheduleRender(); return; }
    const dia = fval('np.dia', '1');
    const p = {
      id: makeId('p'), alias, activo: true, adulto: true,
      consentimiento: { firmado: true, fecha: fval('np.consentFecha', dayKey()) || dayKey() },
      sesion: { dia: dia === '' ? '' : Number(dia), hora: fval('np.hora', '18:00') || '18:00' },
      ultimaSesion: null, creado: nowIso(),
      seguimiento: { cadaDias: Number(fval('np.cada', '3')) || 3, tono: fval('np.tono', 'cálido') || 'cálido', pausado: false },
      tareas: [], tecnicas: [], planSeguridad: {}, temas: [], pendientes: [], chatGPT: '', valoracionPaciente: null
    };
    S.ui.modal = null;
    formKeysClear('np.');
    await Store.savePatient(p);
    Telemetry.bump('pacientes_creados');
    S.ui.view = 'pacientes'; S.ui.pid = p.id; S.ui.ptab = 'plan'; S.ui.mobileDetail = true;
    S.ui.out = S.ui.out || {};
    S.ui.out[p.id] = { kind: 'bienvenida', fuente: 'plantilla', aiOriginal: templateFor('bienvenida', p) };
    S.ui.f['out.' + p.id] = S.ui.out[p.id].aiOriginal;
    toast('Paciente agregado. Completa su plan de seguridad y aprueba sus técnicas; el mensaje de bienvenida te espera en Conversación.');
    scheduleRender();
  },
  async 'save-plan-basics'(pid) {
    const p = needPatient(pid);
    const k = (x) => 'pl.' + pid + '.' + x;
    const alias = String(fval(k('alias'), p.alias)).trim() || p.alias;
    const dia = fval(k('dia'), p.sesion?.dia ?? '');
    await Store.savePatient(Object.assign({}, p, {
      alias,
      sesion: { dia: dia === '' ? '' : Number(dia), hora: fval(k('hora'), p.sesion?.hora || '18:00') },
      seguimiento: Object.assign({}, p.seguimiento, { cadaDias: Number(fval(k('cada'), p.seguimiento?.cadaDias || 3)) || 3, tono: fval(k('tono'), p.seguimiento?.tono || 'cálido'), pausado: !!fval(k('pausa'), !!p.seguimiento?.pausado) }),
      consentimiento: Object.assign({}, p.consentimiento, { fecha: fval(k('consent'), p.consentimiento?.fecha || '') })
    }));
    if (!!fval(k('pausa'), !!p.seguimiento?.pausado) !== !!p.seguimiento?.pausado) Telemetry.bump('seguimientos_pausados');
    ['alias', 'dia', 'hora', 'cada', 'tono', 'pausa', 'consent'].forEach((x) => delete S.ui.f[k(x)]);
    toast('Datos guardados.');
  },
  async 'save-safety'(pid) {
    const p = needPatient(pid);
    const k = (x) => 'pl.' + pid + '.' + x;
    const ps = p.planSeguridad || {};
    const ce = ps.contactoEmergencia || {};
    await Store.savePatient(Object.assign({}, p, {
      planSeguridad: {
        senales: String(fval(k('senales'), ps.senales || '')).trim(), calma: String(fval(k('calma'), ps.calma || '')).trim(),
        apoyo: String(fval(k('apoyo'), ps.apoyo || '')).trim(), razones: String(fval(k('razones'), ps.razones || '')).trim(),
        contactoEmergencia: { nombre: String(fval(k('ceNombre'), ce.nombre || '')).trim(), telefono: String(fval(k('ceTel'), ce.telefono || '')).trim() }
      }
    }));
    ['senales', 'calma', 'apoyo', 'razones', 'ceNombre', 'ceTel'].forEach((x) => delete S.ui.f[k(x)]);
    toast('Plan de seguridad guardado.');
  },
  async 'save-record'(pid) {
    const p = needPatient(pid);
    const k = (x) => 'pl.' + pid + '.' + x;
    const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);
    await Store.savePatient(Object.assign({}, p, { temas: lines(fval(k('temas'), (p.temas || []).join('\n'))), pendientes: lines(fval(k('pendientes'), (p.pendientes || []).join('\n'))) }));
    delete S.ui.f[k('temas')]; delete S.ui.f[k('pendientes')];
    toast('Expediente guardado.');
  },
  async 'save-eval'(pid) {
    const p = needPatient(pid);
    const k = (x) => 'pl.' + pid + '.' + x;
    const val = fval(k('val'), p.valoracionPaciente == null ? '' : String(p.valoracionPaciente));
    await Store.savePatient(Object.assign({}, p, { chatGPT: fval(k('gpt'), p.chatGPT || ''), valoracionPaciente: val === '' ? null : Number(val) }));
    delete S.ui.f[k('gpt')]; delete S.ui.f[k('val')];
    toast('Evaluación guardada.');
  },
  async 'add-task'(pid) {
    const p = needPatient(pid);
    const key = 'pl.' + pid + '.newTask';
    const texto = String(fval(key, '')).trim();
    if (!texto) return;
    blurActive();
    await Store.savePatient(Object.assign({}, p, { tareas: (p.tareas || []).concat([{ id: makeId('k'), texto: texto.slice(0, 300), estado: 'pendiente', creada: nowIso() }]) }));
    delete S.ui.f[key];
    scheduleRender();
  },
  async 'task-state'(arg) {
    const [pid, tid, estado] = String(arg).split('|');
    const p = needPatient(pid);
    const t = (p.tareas || []).find((x) => x.id === tid);
    if (!t || t.estado === estado) return;
    await Store.savePatient(Object.assign({}, p, { tareas: p.tareas.map((x) => (x.id === tid ? Object.assign({}, x, { estado, actualizada: nowIso() }) : x)) }));
    if (estado !== 'archivada') await Store.addEvent({ pid, tipo: 'tarea', ts: nowIso(), tareaId: tid, tareaTexto: t.texto, estado });
  },
  async 'task-from-msg'(eid) {
    const e = eventById(eid);
    if (!e || !e.tareaId || !e.tareaEstado) return;
    await ACTIONS['task-state'](e.pid + '|' + e.tareaId + '|' + e.tareaEstado);
    Telemetry.bump('tareas_desde_mensaje');
  },
  async 'toggle-tech'(arg, el) {
    const [pid, tid] = String(arg).split('|');
    const p = needPatient(pid);
    const set = new Set(p.tecnicas || []);
    if (el.checked) set.add(tid); else set.delete(tid);
    await Store.savePatient(Object.assign({}, p, { tecnicas: [...set] }));
  },
  async 'archive-patient'(pid) {
    const p = needPatient(pid);
    if (activeAlerts(pid).length) { toast('Cierra primero las alertas activas de ' + p.alias + '.', 'risk'); return; }
    await Store.savePatient(Object.assign({}, p, { activo: false, archivado: nowIso() }));
    S.ui.pid = null; S.ui.mobileDetail = false;
    toast(p.alias + ' quedó archivado. Sus datos se conservan.');
  },
  async 'delete-patient'(pid) {
    const p = needPatient(pid);
    if (String(fval('delc.' + pid, '')).trim() !== p.alias) { toast('Escribe el alias exacto para confirmar.'); return; }
    if (activeAlerts(pid).length) { toast('Cierra primero las alertas activas de ' + p.alias + '.', 'risk'); return; }
    if (S.mode === 'ejemplo') {
      S.demo.patients = S.demo.patients.filter((x) => x.id !== pid);
      S.demo.events = S.demo.events.filter((x) => x.pid !== pid);
    } else {
      if (isReadOnly()) throw readOnlyError();
      // Uno por uno, consultando la base; el paciente solo se borra si todo su historial se borró.
      let failed = 0;
      for (let round = 0; round < 50 && !failed; round++) {
        const q = await eventsCol().where('pid', '==', pid).limit(200).get();
        if (q.empty) break;
        for (const d of q.docs) {
          try { await Writer.write(eventsCol().doc(d.id), 'delete', null, { module: 'pacientes', silentToast: true }); }
          catch (e) { failed++; if (e && e.code === 'resource_exhausted') await sleep(5000); }
        }
      }
      for (const id of [...S.real.unsaved.keys()]) if (S.real.unsaved.get(id).pid === pid) S.real.unsaved.delete(id);
      if (failed) {
        ErrorLog.log({ category: 'datos', severity: 'alta', module: 'pacientes', code: 'borrado_incompleto', message: 'No se pudo borrar todo el historial de un paciente', detail: { fallidos: failed } });
        toast('No se pudo borrar todo el historial (' + failed + ' registros). El paciente no se borró; intenta de nuevo.', 'risk');
        return;
      }
      await Writer.write(patientsCol().doc(pid), 'delete', null, { module: 'pacientes' });
      S.real.patients = S.real.patients.filter((x) => x.id !== pid);
      S.real.events = S.real.events.filter((x) => x.pid !== pid);
    }
    Telemetry.bump('pacientes_borrados');
    S.ui.pid = null; S.ui.mobileDetail = false; delete S.ui.open['del.' + pid]; delete S.ui.f['delc.' + pid];
    toast('Se borró el paciente y todo su historial.');
    scheduleRender();
  },
  /* Conversación */
  async 'register-inbound'(pid) {
    const key = 'in.' + pid;
    const texto = visibleValue(key).trim();
    if (!texto) { toast('Pega primero el mensaje del paciente.'); return; }
    const tsRaw = fval('inTs.' + pid, '');
    const ts = tsRaw ? fromLocalInput(tsRaw) : nowIso();
    if (new Date(ts) > new Date(Date.now() + 5 * 60000)) { toast('La hora de llegada está en el futuro. Corrígela.'); return; }
    blurActive();
    delete S.ui.f[key]; delete S.ui.f['inTs.' + pid];
    const el = document.getElementById(idSafe(key));
    if (el) el.value = '';
    S.ui.busy['reg:' + pid] = true;
    scheduleRender();
    try {
      await registerInbound(pid, texto.slice(0, 4000), ts, null);
    } catch (err) {
      S.ui.f[key] = texto; // no se pierde lo que pegaste
      throw err;
    } finally { delete S.ui.busy['reg:' + pid]; scheduleRender(); }
  },
  async 'quick-reply'(arg) {
    const [pid, k] = String(arg).split('|');
    if (!QUICK_REPLIES[k]) return;
    const tsRaw = fval('inTs.' + pid, '');
    delete S.ui.f['inTs.' + pid];
    await registerInbound(pid, QUICK_REPLIES[k], tsRaw ? fromLocalInput(tsRaw) : nowIso(), k);
    Telemetry.bump('respuestas_rapidas');
  },
  async 'classify'(eid) { Telemetry.bump('regeneraciones'); await classify(eid); },
  async 'set-level'(eid, el) {
    const e = eventById(eid);
    if (!e) return;
    const nuevo = el.value;
    const prev = e.nivel || 'normal';
    delete S.ui.f['lvl.' + eid];
    if (!LEVELS.includes(nuevo) || nuevo === prev) return;
    const p = patientByIdAny(e.pid);
    const prevByHuman = e.nivelAjustadoPor === 'psicologa';
    const patch = { nivel: nuevo, nivelAjustadoPor: 'psicologa', nivelPrevio: prev };
    if (nuevo === 'riesgo_alto') { patch.borrador = crisisTemplate(p); patch.borradorIA = patch.borrador; patch.borradorFuente = 'plantilla'; patch.borradorDescartado = false; delete S.ui.f['draft.' + eid]; }
    await Store.updateEvent(eid, patch);
    Telemetry.bump('niveles_ajustados');
    const fromNet = e.nivelFuente === 'red' || (e.nivelRed === prev && (!e.nivelIA || levelRank(e.nivelIA) < levelRank(prev)));
    const fuente = fromNet ? 'la red de palabras clave' : 'la IA';
    // Si el nivel anterior ya era decisión tuya, cambiarlo no es un error de la IA.
    if (!prevByHuman) {
      if (levelRank(nuevo) > levelRank(prev)) {
        ErrorLog.log({
          category: 'calidad_ia', severity: nuevo === 'riesgo_alto' ? 'critica' : 'media', module: 'clasificacion',
          code: nuevo === 'riesgo_alto' ? 'riesgo_subestimado' : 'nivel_subestimado',
          message: 'Subiste el nivel de ' + LEVEL_LABEL[prev] + ' a ' + LEVEL_LABEL[nuevo] + ': ' + fuente + ' lo subestimó',
          detail: { nivelIA: e.nivelIA || null, nivelRed: e.nivelRed || null, nivelPrevio: prev, nivelNuevo: nuevo, fuente: e.nivelFuente || null, categoriasRed: e.categoriasRed || [], redVersion: e.redVersion || null, promptVersion: e.promptVersion || null }, silent: true
        });
      } else {
        ErrorLog.log({
          category: 'calidad_ia', severity: 'baja', module: 'clasificacion', code: fromNet ? 'falso_positivo_red' : 'riesgo_sobreestimado',
          message: 'Bajaste el nivel de ' + LEVEL_LABEL[prev] + ' a ' + LEVEL_LABEL[nuevo] + ': ' + fuente + ' lo sobreestimó',
          detail: { nivelIA: e.nivelIA || null, nivelRed: e.nivelRed || null, nivelPrevio: prev, nivelNuevo: nuevo, categoriasRed: e.categoriasRed || [], redVersion: e.redVersion || null }, silent: true
        });
      }
    }
    if (nuevo === 'riesgo_alto') await raiseAlert(p, eventById(eid) || e, 'psicologa', { reabrir: true });
    if (prev === 'riesgo_alto' && nuevo !== 'riesgo_alto') {
      let closed = 0;
      for (const a of allEvents().filter((x) => x.tipo === 'alerta' && x.origen === eid && x.estado !== 'cerrada')) {
        await Store.updateEvent(a.id, { estado: 'cerrada', cerradaEn: nowIso(), resultado: 'nivel_bajado', ackEn: a.ackEn || nowIso() });
        closed++;
      }
      if (closed) toast('Cerré la alerta de este mensaje porque bajaste el nivel.');
    }
  },
  async 'approve-draft'(eid) {
    const e = eventById(eid);
    if (!e) return;
    const text = visibleValue('draft.' + eid, e.borradorDescartado ? '' : (e.borrador || '')).trim();
    if (!text) { toast('Escribe la respuesta antes de aprobar.'); return; }
    await copyText(text);
    blurActive();
    delete S.ui.f['draft.' + eid];
    const original = e.borradorDescartado ? null : (e.borradorIA || null);
    const ratio = original ? editRatio(original, text) : null;
    const editado = original ? ratio > 0.02 : null;
    await Store.addEvent({
      pid: e.pid, tipo: 'salida', tipoSalida: 'respuesta', ts: nowIso(), texto: text, enRespuestaA: eid, nivel: e.nivel || null,
      borradorIA: original, borradorFuente: original ? (e.borradorFuente || 'ia') : 'propio', editado, ratio, promptVersion: e.promptVersion || null,
      minutosRespuesta: Math.max(0, Math.round((Date.now() - new Date(e.ts).getTime()) / 60000))
    });
    await Store.updateEvent(eid, { estado: 'respondido', respondidoEn: nowIso() });
    await ackPatientAlerts(e.pid, 'respuesta', eid);
    if (original && (e.borradorFuente || 'ia') === 'ia') {
      Telemetry.bump(editado ? 'aprobados_editados' : 'aprobados_sin_cambios');
      if (ratio > 0.4) ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: 'borrador', code: 'borrador_muy_editado', message: 'Cambiaste más del 40% del borrador antes de enviarlo', detail: { cambio: ratio, nivel: e.nivel, palabrasAntes: original.split(/\s+/).length, palabrasDespues: text.split(/\s+/).length, version: e.promptVersion || null }, silent: true });
    } else {
      Telemetry.bump(original ? 'plantillas_aprobadas' : 'respuestas_sin_ia');
    }
    S.ui.scrollThread = true;
  },
  async 'confirm-discard'(eid) {
    const e = eventById(eid);
    if (!e) return;
    const motivo = fval('why.' + eid, 'tono');
    if ((e.borradorFuente || 'ia') === 'ia') {
      ErrorLog.log({ category: 'calidad_ia', severity: motivo === 'riesgo_mal_evaluado' ? 'alta' : 'media', module: 'borrador', code: 'borrador_descartado_' + motivo, message: 'Descartaste un borrador de la asistente (' + motivo.replace(/_/g, ' ') + ')', detail: { motivo, nivel: e.nivel, version: e.promptVersion || null }, silent: true });
      Telemetry.bump('borradores_descartados');
    } else {
      Telemetry.bump('plantillas_descartadas');
    }
    await Store.updateEvent(eid, { borradorDescartado: true, motivoDescarte: motivo });
    delete S.ui.open['discard.' + eid];
    delete S.ui.f['why.' + eid];
    S.ui.f['draft.' + eid] = '';
    scheduleRender();
  },
  async 'mark-handled'(eid) {
    const e = eventById(eid);
    if (!e) return;
    await Store.updateEvent(eid, { estado: 'respondido', respondidoEn: nowIso(), respondidoSinMensaje: true });
    delete S.ui.f['draft.' + eid];
    await ackPatientAlerts(e.pid, 'otro_medio', eid);
    Telemetry.bump('atendidos_por_otro_medio');
  },
  async 'helped'(arg) {
    const [eid, v] = String(arg).split('|');
    const e = eventById(eid);
    if (!e) return;
    await Store.updateEvent(eid, { ayudo: v });
    Telemetry.bump('tecnica_' + (v === 'sí' ? 'ayudo' : v === 'no' ? 'no_ayudo' : 'parcial'));
    if (v === 'no') {
      await Store.addEvent({ pid: e.pid, tipo: 'alerta', ts: nowIso(), nivel: 'malestar', origen: eid, fuente: 'psicologa', estado: 'activa', motivo: 'El malestar no bajó después de la técnica: responde pronto.' });
    }
  },
  'compose-template'(arg) { const [pid, kind] = String(arg).split('|'); return composeOut(pid, kind); },
  'compose-template-select'(pid, el) {
    const kind = el.value;
    delete S.ui.f['tpl.' + pid];
    el.value = '';
    // Sin esperar: composeOut invalida cualquier redacción anterior por su cuenta.
    if (kind) composeOut(pid, kind).catch((err) => ErrorLog.log({ category: 'runtime', severity: 'alta', module: outModule(kind), code: (err && err.name) || 'Error', message: 'Falló preparar un mensaje: ' + ((err && err.message) || err) }));
  },
  'start-followup'(pid) { return composeOut(pid, 'seguimiento'); },
  async 'approve-out'(pid) {
    const p = needPatient(pid);
    const out = S.ui.out && S.ui.out[pid];
    if (!out || S.ui.busy['out:' + pid]) return;
    const text = visibleValue('out.' + pid).trim();
    if (!text) { toast('El mensaje está vacío.'); return; }
    await copyText(text);
    blurActive();
    const original = out.aiOriginal || null;
    const ratio = original ? editRatio(original, text) : null;
    delete S.ui.out[pid];
    delete S.ui.f['out.' + pid];
    invalidateOut(pid);
    await Store.addEvent({ pid, tipo: 'salida', tipoSalida: out.kind === 'manual' ? 'manual' : out.kind, ts: nowIso(), texto: text, borradorIA: original, borradorFuente: out.fuente, editado: original ? ratio > 0.02 : null, ratio, promptVersion: out.fuente === 'ia' ? (PROMPT_VERSIONS[OUT_FEATURE[out.kind] || (out.kind === 'resumen_sesion' ? 'nota_sesion' : '')] || null) : null });
    if (out.kind === 'bienvenida') await Store.savePatient(Object.assign({}, needPatient(pid), { bienvenidaEnviada: nowIso() }));
    Telemetry.bump('salida_' + out.kind);
    if (out.fuente === 'ia') Telemetry.bump((ratio > 0.02 ? 'aprobados_editados_' : 'aprobados_sin_cambios_') + out.kind);
    if (out.fuente === 'ia' && ratio > 0.4) ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: outModule(out.kind), code: 'borrador_muy_editado', message: 'Cambiaste más del 40% de un mensaje de la asistente (' + (SALIDA_LABEL[out.kind] || out.kind) + ')', detail: { cambio: ratio, tipo: out.kind }, silent: true });
    S.ui.scrollThread = true;
    scheduleRender();
  },
  'cancel-out'(pid) {
    const out = S.ui.out && S.ui.out[pid];
    if (!out) return;
    invalidateOut(pid); // invalida la redacción en curso
    if (out.fuente === 'ia' && out.aiOriginal) {
      ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: outModule(out.kind), code: 'mensaje_descartado_' + out.kind, message: 'Descartaste un mensaje redactado por la asistente (' + (SALIDA_LABEL[out.kind] || out.kind) + ')', silent: true });
      Telemetry.bump('borradores_descartados_' + out.kind);
    }
    delete S.ui.out[pid];
    delete S.ui.f['out.' + pid];
    scheduleRender();
  },
  /* Nota de sesión */
  async 'structure-note'(pid) {
    const p = needPatient(pid);
    const texto = String(fval('note.' + pid, '')).trim();
    if (!texto) { toast('Escribe primero tu nota de la sesión.'); return; }
    if (!AI.available()) { await ACTIONS['save-note-plain'](pid); return; }
    const key = 'note:' + pid;
    S.ui.busy[key] = true;
    scheduleRender();
    try {
      const raw = await AI.run({ feature: 'nota_sesion', key, input: promptSessionNote(p, texto), json: true });
      const n = normalizeNote(raw);
      if (!n.valido) {
        ErrorLog.log({ category: 'ia', severity: 'media', module: 'nota_sesion', code: 'nota_vacia', message: 'La IA no extrajo nada útil de la nota', silent: true });
        toast('La asistente no pudo ordenar la nota. Puedes guardarla sin IA.');
        return;
      }
      if (n.tecnicasDescartadas) ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: 'nota_sesion', code: 'tecnica_inexistente', message: 'La IA sugirió técnicas que no existen en la biblioteca (se quitaron)', detail: { cuantas: n.tecnicasDescartadas }, silent: true });
      if (n.mensaje && soundsLikePsychologist(n.mensaje)) {
        n.aviso = 'El resumen para el paciente habla como si fueras tú. Revísalo antes de enviarlo.';
        ErrorLog.log({ category: 'calidad_ia', severity: 'media', module: 'nota_sesion', code: 'se_presenta_como_psicologa', message: QUALITY_MESSAGES.se_presenta_como_psicologa, detail: { version: PROMPT_VERSIONS.nota_sesion }, silent: true });
      }
      S.ui.noteDraft = S.ui.noteDraft || {};
      S.ui.noteDraft[pid] = n;
      formKeysClear('nd.' + pid + '.');
      Telemetry.bump('notas_estructuradas');
    } catch (err) {
      if (err && err.code === 'cancelled') return;
      toast(aiErrorCopy(err) + ' Puedes guardar la nota sin IA.');
    } finally {
      delete S.ui.busy[key];
      scheduleRender();
    }
  },
  async 'save-note'(pid) {
    const p = needPatient(pid);
    const n = S.ui.noteDraft && S.ui.noteDraft[pid];
    if (!n) return;
    const dk = (x) => 'nd.' + pid + '.' + x;
    const tsRaw = fval('noteTs.' + pid, '');
    const fecha = tsRaw ? fromLocalInput(tsRaw) : nowIso();
    const nuevasTareas = n.tareas.filter((t, i) => fval(dk('t' + i), true)).map((t) => ({ id: makeId('k'), texto: t, estado: 'pendiente', creada: fecha }));
    const tecnicas = new Set(p.tecnicas || []);
    const aprobadas = n.tecnicas.filter((id) => fval(dk('k' + id), true));
    aprobadas.forEach((id) => tecnicas.add(id));
    const resumen = String(fval(dk('res'), n.resumen)).trim();
    const fu = Number(fval(dk('fu'), String(n.seguimientoEnDias || p.seguimiento?.cadaDias || 3))) || 3;
    const pendientes = (p.pendientes || []).concat(n.pendientes.map((x) => (n.revisarEnDias ? x + ' (revisar ' + fmtDate.format(addDays(new Date(fecha), n.revisarEnDias)) + ')' : x)));
    const ultima = (!p.ultimaSesion || new Date(fecha) > new Date(p.ultimaSesion)) ? fecha : p.ultimaSesion;
    await Store.savePatient(Object.assign({}, p, {
      ultimaSesion: ultima, tareas: (p.tareas || []).concat(nuevasTareas), tecnicas: [...tecnicas],
      temas: [...new Set((p.temas || []).concat(n.temas))].slice(0, 20), pendientes: [...new Set(pendientes)].slice(0, 30),
      seguimiento: Object.assign({}, p.seguimiento, { cadaDias: fu }), notaClinica: resumen
    }));
    await Store.addEvent({ pid, tipo: 'nota', ts: fecha, fechaSesion: fecha, texto: String(fval('note.' + pid, '')).slice(0, 6000), estructura: { resumen, temas: n.temas, tareas: nuevasTareas.map((t) => t.texto), tecnicas: aprobadas, pendientes: n.pendientes }, fuente: 'ia' });
    if (n.tecnicas.length - aprobadas.length > 0) Telemetry.bump('tecnicas_sugeridas_rechazadas', n.tecnicas.length - aprobadas.length);
    const msg = String(fval(dk('msg'), n.mensaje || '')).trim();
    delete S.ui.noteDraft[pid];
    formKeysClear('nd.' + pid + '.');
    delete S.ui.f['note.' + pid]; delete S.ui.f['noteTs.' + pid];
    if (msg) {
      S.ui.out = S.ui.out || {};
      invalidateOut(pid);
      S.ui.out[pid] = { kind: 'resumen_sesion', fuente: 'ia', aiOriginal: n.mensaje || msg, aviso: n.aviso || null };
      S.ui.f['out.' + pid] = msg;
      S.ui.ptab = 'conversacion';
      toast('Sesión guardada en el expediente. Revisa y aprueba el resumen para el paciente.');
    } else {
      toast('Sesión guardada en el expediente.');
    }
    scheduleRender();
  },
  'discard-note'(pid) {
    if (S.ui.noteDraft && S.ui.noteDraft[pid]) {
      ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: 'nota_sesion', code: 'nota_descartada', message: 'Descartaste la nota ordenada por la asistente', silent: true });
      delete S.ui.noteDraft[pid];
    }
    formKeysClear('nd.' + pid + '.');
    scheduleRender();
  },
  async 'save-note-plain'(pid) {
    const p = needPatient(pid);
    const texto = String(fval('note.' + pid, '')).trim();
    if (!texto) { toast('Escribe primero tu nota de la sesión.'); return; }
    const tsRaw = fval('noteTs.' + pid, '');
    const fecha = tsRaw ? fromLocalInput(tsRaw) : nowIso();
    const ultima = (!p.ultimaSesion || new Date(fecha) > new Date(p.ultimaSesion)) ? fecha : p.ultimaSesion;
    await Store.savePatient(Object.assign({}, p, { ultimaSesion: ultima, notaClinica: texto.slice(0, 800) }));
    await Store.addEvent({ pid, tipo: 'nota', ts: fecha, fechaSesion: fecha, texto: texto.slice(0, 6000), estructura: null, fuente: 'manual' });
    delete S.ui.f['note.' + pid]; delete S.ui.f['noteTs.' + pid];
    toast('Sesión registrada. Agrega las tareas en el Plan.');
  },

  /* Resumen */
  async 'gen-summary'(pid) {
    const p = needPatient(pid);
    const key = 'sum:' + pid;
    S.ui.busy[key] = true;
    S.ui.stream[key] = '';
    scheduleRender();
    try {
      const text = await AI.run({ feature: 'resumen', key, input: promptPreSession(p, eventsSinceLastSession(p)), onText: ({ text: t }) => { S.ui.stream[key] = t; scheduleRender(); } });
      await Store.savePatient(Object.assign({}, needPatient(pid), { ultimoResumen: { texto: text.slice(0, 2000), ts: nowIso(), fuente: 'ia' } }));
      Telemetry.bump('resumenes');
    } catch (err) {
      if (!(err && err.code === 'cancelled')) toast(aiErrorCopy(err) + ' Abajo tienes el conteo automático.');
    } finally {
      delete S.ui.busy[key];
      delete S.ui.stream[key];
      scheduleRender();
    }
  },

  /* Alertas */
  async 'ack-alert'(id) {
    const a = eventById(id);
    if (!a || a.ackEn) return;
    await Store.updateEvent(id, { ackEn: nowIso(), estado: 'atendida' });
    Telemetry.bump('alertas_atendidas');
  },
  async 'close-alert'(arg) {
    const [id, given] = String(arg).split('|');
    const a = eventById(id);
    if (!a) return;
    const resultado = given || fval('res.' + id, '');
    if (!resultado) { toast('Elige el resultado antes de cerrar la alerta.'); return; }
    await Store.updateEvent(id, { estado: 'cerrada', cerradaEn: nowIso(), resultado, ackEn: a.ackEn || nowIso() });
    delete S.ui.f['res.' + id];
    Telemetry.bump('alertas_cerradas_' + resultado);
    if (a.nivel !== 'riesgo_alto') return;
    const entrada = eventById(a.origen);
    const ia = entrada && entrada.nivelIA;
    if (resultado === 'falsa_alarma') {
      ErrorLog.log({ category: 'calidad_ia', severity: 'baja', module: 'crisis', code: a.fuente === 'red' ? 'falso_positivo_red' : a.fuente === 'ia' ? 'falso_positivo_ia' : 'falsa_alarma', message: 'Cerraste una alerta de riesgo alto como falsa alarma', detail: { fuente: a.fuente, nivelIA: ia || null, categorias: a.categorias || [], redVersion: (entrada && entrada.redVersion) || null }, silent: true });
    } else if (a.fuente === 'red' && ia && ia !== 'riesgo_alto') {
      // Confirmado por la psicóloga: había riesgo real y la IA lo había clasificado por debajo.
      ErrorLog.log({ category: 'calidad_ia', severity: 'critica', module: 'clasificacion', code: 'riesgo_subestimado_por_ia', message: 'La IA clasificó por debajo de riesgo alto un mensaje que resultó ser un riesgo real (confirmado al cerrar la alerta)', detail: { nivelIA: ia, resultado, categorias: a.categorias || [], promptVersion: (entrada && entrada.promptVersion) || null }, silent: true });
    }
  },
  /* Biblioteca */
  async 'add-tech'() {
    const nombre = String(fval('bt.nombre', '')).trim();
    const pasos = String(fval('bt.pasos', '')).trim();
    if (!nombre || !pasos) { toast('Escribe el nombre y los pasos de la técnica.'); return; }
    const t = { id: makeId('t_'), nombre: nombre.slice(0, 80), situacion: fval('bt.sit', 'ansiedad'), pasos: pasos.slice(0, 600) };
    await Store.saveSettings({ tecnicasPropias: (settings().tecnicasPropias || []).concat([t]) });
    formKeysClear('bt.');
    toast('Técnica agregada. Apruébala para cada paciente en su Plan.');
  },
  async 'remove-tech'(id) { await Store.saveSettings({ tecnicasPropias: (settings().tecnicasPropias || []).filter((t) => t.id !== id) }); },
  async 'add-resource'() {
    const titulo = String(fval('br.titulo', '')).trim();
    if (!titulo) { toast('Escribe el título del recurso.'); return; }
    const r = { id: makeId('r_'), titulo: titulo.slice(0, 160), autor: String(fval('br.autor', '')).trim().slice(0, 120), tema: String(fval('br.tema', '')).trim().slice(0, 60) };
    await Store.saveSettings({ recursos: (settings().recursos || []).concat([r]) });
    formKeysClear('br.');
  },
  async 'remove-resource'(id) { await Store.saveSettings({ recursos: (settings().recursos || []).filter((r) => r.id !== id) }); },

  /* Registro de errores */
  'log-filter'(field, el) { S.ui.logFilter[field] = el.value; delete S.ui.f['lf.' + field]; scheduleRender(); },
  async 'log-status'(arg) { const i = String(arg).lastIndexOf('|'); await ErrorLog.setStatus(arg.slice(0, i), arg.slice(i + 1)); },
  'open-report'() {
    S.ui.reportModule = currentModule();
    delete S.ui.f['rep.mod']; // el módulo siempre parte de donde estás; el texto del borrador se conserva
    S.ui.modal = { kind: 'report' };
    scheduleRender();
    setTimeout(() => document.getElementById(idSafe('rep.texto'))?.focus(), 60);
  },
  'submit-report'() {
    const raw = visibleValue('rep.texto').trim();
    if (raw.length < 8) { S.ui.modal = { kind: 'report', error: 'Describe el problema con un poco más de detalle.' }; scheduleRender(); return; }
    // Quita nombres que la app conoce (alias, personas de apoyo, contactos) además de teléfonos y correos.
    let texto = scrub(raw);
    const pts = S.mode === 'ejemplo' ? (S.demo ? S.demo.patients : []) : S.real.patients;
    const names = new Set();
    for (const p of pts) {
      if (p.alias && p.alias.trim().length >= 2) names.add(p.alias.trim());
      const ps = p.planSeguridad || {};
      const extra = [ps.apoyo, ps.contactoEmergencia && ps.contactoEmergencia.nombre].filter(Boolean).join(' ');
      (extra.match(/\p{Lu}[\p{L}'-]{2,}/gu) || []).forEach((w) => names.add(w));
    }
    for (const n of names) texto = texto.replace(new RegExp('(^|[^\\p{L}\\p{N}])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}\\p{N}])', 'giu'), '$1[nombre]');
    const mod = fval('rep.mod', S.ui.reportModule || 'app');
    ErrorLog.log({ category: 'reporte_usuario', severity: fval('rep.sev', 'media'), module: mod, code: 'reporte_manual', message: clip(texto, 140), note: texto, detail: { vistaActual: S.ui.view, pestana: S.ui.ptab }, silent: true });
    formKeysClear('rep.');
    S.ui.modal = null;
    toast('Gracias. El reporte quedó en el registro de errores.');
    scheduleRender();
  },
  async 'copy-report'() {
    const md = buildReport();
    S.ui.reportText = md;
    await copyText(md, 'Reporte copiado. Pégalo en tu conversación con Claude.');
    Telemetry.bump('reportes_copiados');
  },
  async 'download-log'() {
    const dl = S.caps.downloads;
    if (!dl) { toast('Las descargas no están disponibles en esta vista. Usa "Copiar reporte".'); return; }
    const data = JSON.stringify({ app: 'copiloto-clinico', version: APP_VERSION, redVersion: RISK_VERSION, promptVersions: PROMPT_VERSIONS, generado: nowIso(), entradas: ErrorLog.all().map((e) => { const c = Object.assign({}, e); delete c.synced; return c; }), sesiones: sessionsForStats(true), reporte: buildReport() }, null, 2);
    await saveDownload(dl, 'copiloto-registro-' + dayKey() + '.json', data, 'registro', 'Registro descargado.');
  },
  async 'export-data'() {
    const dl = S.caps.downloads;
    if (!dl) { toast('Las descargas no están disponibles en esta vista.'); return; }
    const data = JSON.stringify({ app: 'copiloto-clinico', version: APP_VERSION, exportado: nowIso(), modo: S.mode, ajustes: settings(), pacientes: patients(), eventos: allEvents() }, null, 2);
    if (await saveDownload(dl, 'copiloto-mis-datos-' + dayKey() + '.json', data, 'ajustes', 'Tus datos se descargaron.')) Telemetry.bump('exportaciones');
  },
  async 'analyze-log'() {
    S.ui.busy['analisis'] = true;
    S.ui.analysis = '';
    scheduleRender();
    try {
      S.ui.analysis = await AI.run({ feature: 'analisis', key: 'analisis', input: promptLogAnalysis(buildReport()), onText: ({ text }) => { S.ui.analysis = text; scheduleRender(); } });
      Telemetry.bump('analisis_registro');
    } catch (err) {
      const c = err && err.code;
      if (c === 'refused') S.ui.analysis = '';
      else if (c !== 'cancelled') S.ui.analysis = err && err.text ? err.text + '\n\n[Análisis interrumpido]' : '';
      if (c !== 'cancelled') toast(aiErrorCopy(err));
    } finally {
      delete S.ui.busy['analisis'];
      scheduleRender();
    }
  }
};

async function saveDownload(dl, filename, data, module, okMsg) {
  try {
    await dl.save({ filename, data });
    toast(okMsg);
    return true;
  } catch (err) {
    const c = (err && err.code) || 'desconocido';
    if (c === 'declined') return false;
    if (c === 'rate_limited') { toast('Hay otra descarga pendiente; intenta en un momento.'); return false; }
    if (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(c)) { S.caps.downloads = null; scheduleRender(); }
    ErrorLog.log({ category: 'capacidad', severity: 'media', module, code: 'descarga_' + c, message: 'No se pudo descargar un archivo', silent: true });
    toast(module === 'registro' ? 'No se pudo descargar. Usa "Copiar reporte".' : 'No se pudo descargar tus datos.');
    return false;
  }
}

/* ---------- Conexión de eventos del DOM ---------- */
/* Clics repetidos de la misma acción mientras corre se ignoran (doble clic).
   Los cambios de un control (nivel, técnicas, selectores) nunca se ignoran: se encadenan en orden. */
const running = new Set();
const changeChains = new Map();
function runAction(name, arg, el, ev, kind = 'click') {
  const lock = name + '|' + arg;
  if (kind === 'change') {
    const prev = changeChains.get(lock) || Promise.resolve();
    const next = prev.then(() => runActionNow(name, arg, el, ev));
    changeChains.set(lock, next);
    next.finally(() => { if (changeChains.get(lock) === next) changeChains.delete(lock); });
    return next;
  }
  if (running.has(lock)) { Telemetry.bump('doble_clic_evitado'); return Promise.resolve(); }
  running.add(lock);
  return runActionNow(name, arg, el, ev).finally(() => running.delete(lock));
}
async function runActionNow(name, arg, el, ev) {
  const fn = ACTIONS[name];
  if (!fn) {
    ErrorLog.log({ category: 'runtime', severity: 'media', code: 'accion_desconocida', message: 'Se pidió una acción que no existe: ' + name });
    return;
  }
  try {
    await fn(arg, el, ev);
  } catch (err) {
    if (err && (err.code === 'cancelled' || err.code === 'solo_lectura' || err.code === 'no_listo')) return;
    if (err && err.code && /^(invalid_argument|quota_exceeded|unavailable|resource_exhausted|revoked|not_granted)$/.test(err.code)) return; // ya registrado por Writer
    ErrorLog.log({ category: 'runtime', severity: 'alta', code: (err && (err.name || err.code)) || 'Error', message: 'Falló la acción "' + name + '": ' + ((err && err.message) || String(err)), detail: { accion: name, vista: S.ui.view, pestana: S.ui.ptab, pila: trimStack(err && err.stack) } });
  }
}
function wireEvents() {
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    runAction(el.getAttribute('data-act'), el.getAttribute('data-arg') || '', el, ev);
  });
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    const k = t && t.getAttribute && t.getAttribute('data-f');
    if (k) S.ui.f[k] = t.type === 'checkbox' ? t.checked : t.value;
    const lf = t && t.getAttribute && t.getAttribute('data-live-filter');
    if (lf) { S.ui.logFilter[lf] = t.value; scheduleRender(); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    const k = t && t.getAttribute && t.getAttribute('data-f');
    if (k) S.ui.f[k] = t.type === 'checkbox' ? t.checked : t.value;
    const act = t && t.getAttribute && t.getAttribute('data-change');
    if (act) runAction(act, t.getAttribute('data-arg') || '', t, ev, 'change');
    else if (k && (t.tagName === 'SELECT' || t.type === 'checkbox')) scheduleRender();
  });
  document.addEventListener('pointerdown', (ev) => {
    S.ui.downOnBackdrop = !!(ev.target && ev.target.classList && ev.target.classList.contains('modal-back'));
  }, true);
  document.addEventListener('toggle', (ev) => {
    const t = ev.target;
    const k = t && t.getAttribute && t.getAttribute('data-open-key');
    if (k) S.ui.open[k] = t.open;
  }, true);
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      const t = ev.target;
      const act = t && t.getAttribute && t.getAttribute('data-submit');
      if (act) { ev.preventDefault(); runAction(act, t.getAttribute('data-submit-arg') || '', t, ev); }
    } else if (ev.key === 'Escape' && S.ui.modal) {
      S.ui.modal = null; scheduleRender();
    }
  });
}

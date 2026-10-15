/* =====================================================================
   Datos: biblioteca base, almacén (base privada o modo ejemplo),
   datos de ejemplo y cálculos derivados.
   ===================================================================== */

const SITUACIONES = { ansiedad: 'Ansiedad', panico: 'Pánico', duelo: 'Duelo', regulacion: 'Regulación emocional', otra: 'Otra' };
const TECNICAS_BASE = [
  { id: 't_resp46', nombre: 'Respiración 4-6', situacion: 'ansiedad', pasos: 'Inhala por la nariz contando 4 y exhala por la boca contando 6. Repite 10 veces con los hombros sueltos.' },
  { id: 't_espirales', nombre: 'Dibujar espirales', situacion: 'ansiedad', pasos: 'Toma una hoja y dibuja espirales lentas siguiendo tu respiración: hacia fuera al exhalar, hacia dentro al inhalar. Sigue hasta que el trazo se sienta más lento.' },
  { id: 't_54321', nombre: 'Anclaje 5-4-3-2-1', situacion: 'ansiedad', pasos: 'Nombra 5 cosas que ves, 4 que puedes tocar, 3 que escuchas, 2 que hueles y 1 que saboreas.' },
  { id: 't_ola', nombre: 'Surfear la ola', situacion: 'panico', pasos: 'Recuerda que el pánico sube, llega a un pico y baja en minutos. Observa la sensación sin pelear con ella, nota dónde la sientes y respira lento mientras pasa.' },
  { id: 't_frio', nombre: 'Agua fría', situacion: 'panico', pasos: 'Moja tu cara con agua fría o sostén algo frío en las manos 30 segundos mientras respiras lento. Ayuda a bajar la activación del cuerpo.' },
  { id: 't_carta', nombre: 'Carta a quien perdiste', situacion: 'duelo', pasos: 'Escribe una carta breve a la persona que perdiste: lo que extrañas y lo que te hubiera gustado decirle. No tienes que enviarla; puedes traerla a sesión.' },
  { id: 't_recuerdo', nombre: 'Momento de recuerdo', situacion: 'duelo', pasos: 'Elige un momento del día para recordar con calma, con una foto, una canción o un objeto. Ponle inicio y final, por ejemplo 10 minutos.' },
  { id: 't_nombrar', nombre: 'Nombrar la emoción', situacion: 'regulacion', pasos: 'Escribe qué emoción sientes, del 1 al 10 qué tan intensa es y en qué parte del cuerpo la notas. Ponerle nombre ayuda a bajarla.' },
  { id: 't_stop', nombre: 'STOP', situacion: 'regulacion', pasos: 'Para lo que estás haciendo, toma aire profundo, observa qué piensas y sientes, y prosigue eligiendo una acción que te ayude.' },
  { id: 't_diario', nombre: 'Diario de emociones', situacion: 'regulacion', pasos: 'Al final del día anota una situación, la emoción que sentiste, qué pensaste y qué hiciste. Tráelo a la siguiente sesión.' }
];
const SALIDA_LABEL = {
  respuesta: 'Respuesta', seguimiento: 'Seguimiento', resumen_sesion: 'Resumen de sesión', bienvenida: 'Bienvenida',
  recordatorio: 'Recordatorio de cita', pago: 'Recordatorio de pago', reagendar: 'Reagendar', cierre: 'Cierre de ciclo', manual: 'Mensaje manual'
};
const QUICK_REPLIES = { bien: 'Bien', mas_o_menos: 'Más o menos', necesito_hablar: 'Necesito hablar' };

/* ---------- Acceso al estado según el modo ---------- */
function settings() {
  const base = defaultSettings();
  const src = S.mode === 'ejemplo' ? (S.demo && S.demo.settings) : S.real.settings;
  return Object.assign(base, src || {});
}
function patients() {
  const list = S.mode === 'ejemplo' ? (S.demo ? S.demo.patients : []) : S.real.patients;
  return list.filter((p) => p && p.activo !== false).sort((a, b) => String(a.alias).localeCompare(String(b.alias), 'es'));
}
function patientById(id) { return patients().find((p) => p.id === id) || null; }
/* Incluye archivados: para alertas e historial, que nunca deben perder a su paciente. */
function patientByIdAny(id) {
  const list = S.mode === 'ejemplo' ? (S.demo ? S.demo.patients : []) : S.real.patients;
  return list.find((p) => p && p.id === id) || null;
}
function allEvents() { return S.mode === 'ejemplo' ? (S.demo ? S.demo.events : []) : S.real.events; }
function eventsFor(pid) { return allEvents().filter((e) => e.pid === pid); }
function eventById(id) { return allEvents().find((e) => e.id === id) || null; }
function isReadOnly() { return S.mode === 'real' && (S.status.db === 'solo_lectura' || S.status.db === 'terminal'); }

/* ---------- Referencias de la base (subárbol privado de la persona) ---------- */
function clinicRef() { return S.caps.db.doc('data/users/' + S.status.uid + '/clinic'); }
function patientsCol() { return clinicRef().collection('patients'); }
function eventsCol() { return clinicRef().collection('events'); }

/* ---------- Almacén: misma API para modo real y modo ejemplo ----------
   Los eventos que no se pudieron guardar se quedan en S.real.unsaved (copia local completa):
   siguen visibles, sus alertas siguen corriendo y se reintentan; nunca desaparecen en silencio. */
function readOnlyError() { toast('Tu acceso es de solo lectura: no se guardó.', 'risk'); return { code: 'solo_lectura' }; }
function eventBody(e) { const b = Object.assign({}, e); delete b.id; delete b.noGuardado; return stripUndefined(b); }
/* Mezcla en la lista de la base los eventos en vuelo (S.real.pending) y los no guardados (S.real.unsaved).
   El objeto mezclado se vuelve a guardar en su mapa: lista y mapa comparten el mismo objeto. */
function mergeUnsaved(list) {
  if (!S.real.unsaved.size && !S.real.pending.size) return list;
  const byId = new Map(list.map((x) => [x.id, x]));
  // En vuelo: si el snapshot ya lo trae (compensación de latencia) se usa ese; si no (p. ej. la escritura
  // falló y se está reintentando), se conserva el local. Solo addEvent lo quita de pending al terminar.
  for (const [id, loc] of S.real.pending) if (!byId.has(id)) byId.set(id, loc);
  for (const [id, loc] of S.real.unsaved) {
    const merged = Object.assign(byId.get(id) && byId.get(id) !== loc ? byId.get(id) : {}, loc, { id, noGuardado: true });
    S.real.unsaved.set(id, merged);
    byId.set(id, merged);
  }
  const out = [...byId.values()];
  sortEvents(out);
  return out;
}
async function updateRealEvent(e, patch) {
  if (isReadOnly()) throw readOnlyError();
  const ref = eventsCol().doc(e.id);
  const meta = { module: moduleForEvent(e), retryable: true };
  try {
    if (S.real.unsaved.has(e.id)) {
      // Nunca llegó a la base: se guarda completo (update() fallaría sobre un documento inexistente).
      S.real.unsaved.set(e.id, e);
      await Writer.write(ref, 'set', eventBody(e), meta);
      S.real.unsaved.delete(e.id);
      e.noGuardado = false;
    } else if (S.real.pending.has(e.id)) {
      // Su set() inicial sigue en vuelo: este set() completo va en cola detrás y lleva el cambio.
      await Writer.write(ref, 'set', eventBody(e), meta);
    } else {
      await Writer.write(ref, 'update', stripUndefined(patch), meta);
    }
  } catch (err) {
    e.noGuardado = true;
    S.real.unsaved.set(e.id, e);
    S.real.pending.delete(e.id);
    scheduleRender();
  }
}
const Store = {
  async saveSettings(patch) {
    if (S.mode === 'ejemplo') { S.demo.settings = Object.assign({}, S.demo.settings, patch); scheduleRender(); return; }
    if (isReadOnly()) throw readOnlyError();
    if (!S.real.loaded.clinic || S.real.clinicError) {
      toast('Todavía no se cargan tus ajustes guardados. Intenta en un momento.');
      throw { code: 'no_listo' };
    }
    const patchFull = Object.assign({}, patch, { actualizado: nowIso() });
    S.real.settings = Object.assign({}, S.real.settings || {}, patchFull); // respuesta inmediata; la suscripción confirma
    scheduleRender();
    if (S.real.clinicExists) {
      await Writer.write(clinicRef(), 'update', stripUndefined(patchFull), { module: 'ajustes' });
    } else {
      // Primera vez: se crea completo. Solo se marca como existente si se guardó.
      await Writer.write(clinicRef(), 'set', stripUndefined(S.real.settings), { module: 'ajustes' });
      S.real.clinicExists = true;
    }
  },
  async savePatient(p) {
    const body = stripUndefined(Object.assign({}, p, { actualizado: nowIso() }));
    if (S.mode === 'ejemplo') {
      const i = S.demo.patients.findIndex((x) => x.id === p.id);
      if (i >= 0) S.demo.patients[i] = body; else S.demo.patients.push(body);
      scheduleRender();
      return;
    }
    if (isReadOnly()) throw readOnlyError();
    const i = S.real.patients.findIndex((x) => x.id === p.id);
    if (i >= 0) S.real.patients[i] = body; else S.real.patients.push(body);
    scheduleRender();
    const { id, ...data } = body;
    await Writer.write(patientsCol().doc(id), 'set', data, { module: 'pacientes' });
  },
  /* Nunca rechaza por fallas de la base: el evento queda local y marcado "no guardado". */
  async addEvent(ev) {
    const e = stripUndefined(Object.assign({ id: makeId('e'), creado: nowIso() }, ev));
    if (S.mode === 'ejemplo') { S.demo.events.push(e); sortEvents(S.demo.events); scheduleRender(); return e; }
    if (isReadOnly()) throw readOnlyError();
    S.real.pending.set(e.id, e);
    S.real.events.push(e); sortEvents(S.real.events);
    scheduleRender();
    try {
      await Writer.write(eventsCol().doc(e.id), 'set', eventBody(e), { module: moduleForEvent(e), retryable: true });
      S.real.unsaved.delete(e.id);
    } catch (err) {
      e.noGuardado = true;
      S.real.unsaved.set(e.id, e);
      S.real.events = mergeUnsaved(S.real.events);
      scheduleRender();
    } finally {
      S.real.pending.delete(e.id);
    }
    return e;
  },
  async updateEvent(id, patch) {
    const e = allEvents().find((x) => x.id === id);
    if (!e) return;
    Object.assign(e, patch);
    scheduleRender();
    if (S.mode === 'ejemplo') return;
    await updateRealEvent(e, patch);
  },
  async retryUnsaved() {
    if (!S.caps.db || !S.status.uid || isReadOnly() || !S.real.unsaved.size) return 0;
    let ok = 0;
    for (const [id, e] of [...S.real.unsaved]) {
      try {
        await Writer.write(eventsCol().doc(id), 'set', eventBody(e), { module: moduleForEvent(e), silentToast: true });
        S.real.unsaved.delete(id);
        e.noGuardado = false;
        ok++;
      } catch { /* sigue pendiente; ya quedó en el registro */ }
    }
    if (ok) Telemetry.bump('eventos_recuperados', ok, true);
    scheduleRender();
    return ok;
  }
};
function moduleForEvent(e) {
  return e.tipo === 'alerta' ? 'crisis' : e.tipo === 'nota' ? 'nota_sesion' : e.tipoSalida === 'seguimiento' ? 'seguimiento' : 'bandeja';
}
function stripUndefined(o) { return JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v))); }
function sortEvents(list) { list.sort((a, b) => String(a.ts).localeCompare(String(b.ts))); }

/* ---------- Datos de ejemplo (solo en memoria, nunca se guardan) ---------- */
function makeDemo() {
  const now = new Date();
  // Todo relativo a hoy: la última sesión de Ana fue hace 4 días; ningún evento queda en el futuro.
  const base0 = startOfDay(addDays(now, -4));
  const at = (dayOffset, h, m = 0) => { const d = addDays(base0, dayOffset); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const cap = (iso) => (new Date(iso) > now ? new Date(now.getTime() - 60000).toISOString() : iso);
  const settingsDemo = Object.assign(defaultSettings(), {
    psicologa: 'Alexa',
    bienvenida: 'Me da mucho gusto acompañarte en este proceso; aquí vamos a ir paso a paso.',
    inicioPiloto: dayKey(addDays(now, -10)),
    recursos: [
      { id: 'r_apego', titulo: 'Maneras de amar', autor: 'Amir Levine y Rachel Heller', tema: 'apego' },
      { id: 'r_ansiedad', titulo: 'El cerebro ansioso (guía breve)', autor: 'material de consulta', tema: 'ansiedad' },
      { id: 'r_duelo', titulo: 'Cuaderno de duelo: ejercicios semanales', autor: 'material de consulta', tema: 'duelo' }
    ]
  });
  const pAna = {
    id: 'demo_ana', ejemplo: true, alias: 'Ana', activo: true, adulto: true,
    consentimiento: { firmado: true, fecha: dayKey(addDays(now, -10)) },
    sesion: { dia: base0.getDay(), hora: '18:00' }, ultimaSesion: at(0, 19), creado: at(-6, 19),
    seguimiento: { cadaDias: 3, tono: 'cálido', pausado: false },
    tareas: [
      { id: 'k_esp', texto: 'Dibujar espirales cuando sienta una crisis', estado: 'pendiente', creada: at(0, 19) },
      { id: 'k_diario', texto: 'Llenar el diario de emociones cada noche', estado: 'no_hecha', creada: at(0, 19) }
    ],
    tecnicas: ['t_espirales', 't_resp46', 't_diario'],
    planSeguridad: { senales: 'Insomnio, dejar de comer, pensar que no puede con el trabajo', calma: 'Dibujar espirales, salir a caminar, llamar a su hermana', apoyo: 'Su hermana Lucía', razones: 'Su perro, su sobrina, terminar la maestría', contactoEmergencia: { nombre: 'Lucía (hermana)', telefono: '55 0000 0000' } },
    temas: ['ansiedad laboral', 'relación con su mamá'], pendientes: ['Revisar en dos semanas lo de su mamá'],
    chatGPT: '', valoracionPaciente: null
  };
  const pLuis = {
    id: 'demo_luis', ejemplo: true, alias: 'Luis', activo: true, adulto: true,
    consentimiento: { firmado: true, fecha: dayKey(addDays(now, -10)) },
    sesion: { dia: addDays(base0, 1).getDay(), hora: '17:00' }, ultimaSesion: at(1, 18), creado: at(-5, 18),
    seguimiento: { cadaDias: 3, tono: 'breve', pausado: false },
    tareas: [{ id: 'k_carta', texto: 'Escribir una carta a su papá', estado: 'pendiente', creada: at(1, 18) }],
    tecnicas: ['t_carta', 't_recuerdo'],
    planSeguridad: { senales: 'Aislarse el fin de semana', calma: 'Ver fotos con su hija, caminar', apoyo: 'Su esposa', razones: 'Su hija', contactoEmergencia: { nombre: 'Esposa', telefono: '55 0000 0001' } },
    temas: ['duelo'], pendientes: [], chatGPT: '', valoracionPaciente: null
  };
  const pMarta = {
    id: 'demo_marta', ejemplo: true, alias: 'Marta', activo: true, adulto: true,
    consentimiento: { firmado: true, fecha: dayKey(addDays(now, -10)) },
    sesion: { dia: now.getDay(), hora: '19:00' }, ultimaSesion: at(-3, 19), creado: at(-6, 12),
    seguimiento: { cadaDias: 3, tono: 'cálido', pausado: false },
    tareas: [{ id: 'k_ola', texto: 'Practicar surfear la ola 1 vez al día', estado: 'hecha', creada: at(-3, 19) }],
    tecnicas: ['t_ola', 't_frio', 't_54321'],
    planSeguridad: { senales: 'Evitar salir de casa', calma: 'Agua fría, anclaje 5-4-3-2-1', apoyo: 'Su amiga Rosa', razones: 'Viajar a ver a su abuela', contactoEmergencia: { nombre: 'Rosa (amiga)', telefono: '55 0000 0002' } },
    temas: ['pánico'], pendientes: [], chatGPT: '', valoracionPaciente: null
  };
  const ev = [];
  const push = (e) => ev.push(Object.assign({ id: makeId('e'), creado: e.ts }, e));
  push({ pid: 'demo_ana', tipo: 'salida', tipoSalida: 'resumen_sesion', ts: cap(at(0, 19, 5)), texto: 'Hola Ana, soy la asistente de Alexa. Hoy acordaron que si sientes una crisis vas a dibujar espirales, y que llenarás tu diario de emociones cada noche. Aquí estoy entre sesiones.', editado: false });
  push({ pid: 'demo_ana', tipo: 'entrada', ts: cap(at(1, 22, 40)), texto: 'Hoy tuve mucha ansiedad por el trabajo, no podía dormir', nivel: 'malestar', nivelIA: 'malestar', nivelRed: 'malestar', intensidad: 3, temas: ['ansiedad', 'trabajo'], tecnicaId: 't_espirales', ayudo: 'parcialmente', estado: 'respondido' });
  push({ pid: 'demo_ana', tipo: 'salida', tipoSalida: 'respuesta', ts: cap(at(1, 22, 46)), texto: 'Gracias por escribir, Ana. Soy la asistente de Alexa. Vamos con tus espirales: toma una hoja y dibuja despacio, hacia fuera al exhalar y hacia dentro al inhalar. Cuando termines, cuéntame si bajó un poco la ansiedad.', editado: true, ratio: 0.12 });
  push({ pid: 'demo_ana', tipo: 'salida', tipoSalida: 'seguimiento', ts: cap(at(2, 10)), texto: 'Hola Ana, en tu última sesión quedaron en que dibujarías espirales si sentías una crisis. ¿Cómo te has sentido? ¿Has tenido que recurrir a ello?\nResponde: Bien / Más o menos / Necesito hablar', editado: false });
  push({ pid: 'demo_ana', tipo: 'entrada', ts: cap(at(2, 10, 30)), texto: 'Más o menos', rapida: 'mas_o_menos', nivel: 'normal', nivelIA: 'normal', nivelRed: 'normal', temas: [], estado: 'respondido' });
  push({ pid: 'demo_ana', tipo: 'entrada', ts: cap(at(3, 21, 15)), texto: 'Otra vez ansiedad en la noche. ¿Tienes algún libro sobre apego? Mi psicóloga me lo mencionó', nivel: 'malestar', nivelIA: 'malestar', nivelRed: 'malestar', intensidad: 2, temas: ['ansiedad', 'apego'], recursoId: 'r_apego', estado: 'pendiente',
    borrador: 'Hola Ana, soy la asistente de Alexa. Gracias por contarme. Para esta noche te propongo la respiración 4-6: inhala contando 4 y exhala contando 6, diez veces. Sobre el libro, Alexa recomienda "Maneras de amar" de Amir Levine y Rachel Heller. ¿Bajó un poco la ansiedad?',
    notaIA: 'Segundo episodio de ansiedad nocturna esta semana; pidió un recurso sobre apego.', senales: ['ansiedad nocturna recurrente'] });
  push({ pid: 'demo_luis', tipo: 'salida', tipoSalida: 'resumen_sesion', ts: cap(at(1, 18, 10)), texto: 'Hola Luis, soy la asistente de Alexa. Esta semana tu tarea es escribir una carta a tu papá, sin prisa. Aquí estoy si la necesitas.', editado: false });
  push({ pid: 'demo_marta', tipo: 'entrada', ts: cap(at(1, 8, 5)), texto: 'Bien, ayer practiqué lo de la ola y sí me ayudó', nivel: 'normal', nivelIA: 'normal', nivelRed: 'normal', temas: ['pánico'], tecnicaId: 't_ola', ayudo: 'sí', estado: 'respondido' });
  push({ pid: 'demo_marta', tipo: 'tarea', ts: cap(at(1, 8, 6)), tareaId: 'k_ola', tareaTexto: 'Practicar surfear la ola 1 vez al día', estado: 'hecha' });
  push({ pid: 'demo_marta', tipo: 'salida', tipoSalida: 'respuesta', ts: cap(at(1, 8, 20)), texto: 'Qué bueno leerte, Marta. Soy la asistente de Alexa; le comparto que surfear la ola te ayudó. Sigue practicándolo una vez al día.', editado: false });
  sortEvents(ev);
  // Minutos de ejemplo para la gráfica de tiempo invertido.
  const minutes = {};
  [11, 14, 9, 17, 12, 8, 13, 10, 16, 7].forEach((m, i) => { minutes[dayKey(addDays(now, -10 + i))] = m; });
  return { settings: settingsDemo, patients: [pAna, pLuis, pMarta], events: ev, minutes };
}

/* ---------- Cálculos derivados ---------- */
function lastSessionDate(p) { return toDate(p.ultimaSesion); }
function nextSessionDate(p) {
  if (!p.sesion || p.sesion.dia === undefined || p.sesion.dia === null || p.sesion.dia === '') return null;
  const now = new Date();
  const [h, m] = String(p.sesion.hora || '18:00').split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const d = addDays(startOfDay(now), i);
    if (d.getDay() === Number(p.sesion.dia)) {
      d.setHours(h || 0, m || 0, 0, 0);
      if (i > 0 || d > now || now - d < 2 * 3600000) return d;
    }
  }
  return null;
}
function followUpDue(p) {
  if (!p.ultimaSesion || p.seguimiento?.pausado) return null;
  const last = new Date(p.ultimaSesion);
  const due = addDays(startOfDay(last), Number(p.seguimiento?.cadaDias) || 3);
  due.setHours(10, 0, 0, 0);
  const sent = eventsFor(p.id).some((e) => e.tipo === 'salida' && e.tipoSalida === 'seguimiento' && new Date(e.ts) > last);
  if (sent) return null;
  return due;
}
function pendingInbound(p) { return eventsFor(p.id).filter((e) => e.tipo === 'entrada' && e.estado === 'pendiente'); }
function activeAlerts(pid) { return allEvents().filter((e) => e.tipo === 'alerta' && e.estado !== 'cerrada' && (!pid || e.pid === pid)); }
function lastInbound(p) { const l = eventsFor(p.id).filter((e) => e.tipo === 'entrada'); return l[l.length - 1] || null; }
function hoursSinceSession(p) { return p.ultimaSesion ? Math.max(0, Math.round((Date.now() - new Date(p.ultimaSesion).getTime()) / 3600000)) : null; }
function eventsSinceLastSession(p) {
  const last = p.ultimaSesion ? new Date(p.ultimaSesion) : addDays(new Date(), -14);
  return eventsFor(p.id).filter((e) => new Date(e.ts) > last && e.tipo !== 'nota');
}
function reminderDue(p) {
  const next = nextSessionDate(p);
  if (!next) return null;
  const days = daysBetween(new Date(), next);
  if (days !== 1) return null;
  const sent = eventsFor(p.id).some((e) => e.tipo === 'salida' && e.tipoSalida === 'recordatorio' && (Date.now() - new Date(e.ts).getTime()) < 2 * 86400000);
  return sent ? null : next;
}

/* Resumen sin IA (respaldo) */
function deterministicSummary(p) {
  const evs = eventsSinceLastSession(p);
  const ins = evs.filter((e) => e.tipo === 'entrada');
  const byLevel = { normal: 0, malestar: 0, riesgo_alto: 0 };
  ins.forEach((e) => { if (byLevel[e.nivel] !== undefined) byLevel[e.nivel]++; });
  const parts = [];
  parts.push(p.alias + ': ' + plural(ins.length, 'mensaje', 'mensajes') + ' desde la última sesión' + (ins.length ? ' (' + ins.map((e) => WEEKDAYS_SHORT[new Date(e.ts).getDay()] + ' ' + fmtTime.format(new Date(e.ts))).join(', ') + ')' : ''));
  if (byLevel.malestar) parts.push(plural(byLevel.malestar, 'registro', 'registros') + ' de malestar');
  if (byLevel.riesgo_alto) parts.push(plural(byLevel.riesgo_alto, 'alerta', 'alertas') + ' de riesgo alto');
  const tec = ins.filter((e) => e.tecnicaId);
  if (tec.length) parts.push('técnicas: ' + tec.map((e) => (techById(e.tecnicaId)?.nombre || e.tecnicaId) + (e.ayudo ? ' (ayudó: ' + e.ayudo + ')' : '')).join(', '));
  const t = p.tareas || [];
  if (t.length) parts.push('tareas: ' + t.filter((x) => x.estado === 'hecha').length + ' de ' + t.length + ' hechas' + (t.some((x) => x.estado === 'no_hecha') ? '; no completó: ' + t.filter((x) => x.estado === 'no_hecha').map((x) => x.texto).join(', ') : ''));
  const recs = ins.filter((e) => e.recursoId).map((e) => resourceById(e.recursoId)?.titulo).filter(Boolean);
  if (recs.length) parts.push('pidió: ' + recs.join(', '));
  return parts.join('; ') + '.';
}

/* Métricas del piloto */
function pilotWeeks() {
  const start = fromDayKey(settings().inicioPiloto) || startOfDay(new Date());
  const n = Math.max(1, Math.floor(daysBetween(start, new Date()) / 7) + 1);
  return Array.from({ length: Math.max(4, n) }, (_, i) => ({ n: i + 1, from: addDays(start, i * 7), to: addDays(start, i * 7 + 7) }));
}
function currentWeekN() {
  const start = fromDayKey(settings().inicioPiloto) || startOfDay(new Date());
  return Math.max(1, Math.floor(daysBetween(start, new Date()) / 7) + 1);
}
function weekMetrics(week) {
  const inRange = (e) => { const d = new Date(e.ts); return d >= week.from && d < week.to; };
  const rows = patients().map((p) => {
    const evs = eventsFor(p.id);
    const ins = evs.filter((e) => e.tipo === 'entrada' && inRange(e));
    const followups = evs.filter((e) => e.tipo === 'salida' && e.tipoSalida === 'seguimiento' && inRange(e));
    const answered = followups.filter((f) => evs.some((e) => e.tipo === 'entrada' && new Date(e.ts) > new Date(f.ts) && new Date(e.ts) - new Date(f.ts) < 48 * 3600000));
    // Espontáneo: lo escribió el paciente sin que hubiera un seguimiento en las 48 h previas, y no es una respuesta rápida.
    const allFups = evs.filter((e) => e.tipo === 'salida' && e.tipoSalida === 'seguimiento');
    const spontaneous = ins.filter((e) => !e.rapida && !allFups.some((f) => new Date(e.ts) > new Date(f.ts) && new Date(e.ts) - new Date(f.ts) < 48 * 3600000));
    const hours = Array(24).fill(0);
    ins.forEach((e) => { hours[new Date(e.ts).getHours()]++; });
    const tareas = (p.tareas || []).filter((t) => t.estado !== 'archivada' && new Date(t.creada || 0) < week.to);
    const hechasSemana = new Set(evs.filter((e) => e.tipo === 'tarea' && e.estado === 'hecha' && inRange(e)).map((e) => e.tareaId));
    return {
      p, mensajes: ins.length, espontaneos: spontaneous.length, hours,
      seguimientos: followups.length, respondidos: answered.length,
      tareasHechas: hechasSemana.size, tareasTotal: tareas.length,
      chatGPT: p.chatGPT || '', valoracion: p.valoracionPaciente
    };
  });
  return rows;
}
function minutesByDay() {
  const map = {};
  const add = (sess, key) => {
    const byDay = sess.activeByDay && Object.keys(sess.activeByDay).length ? sess.activeByDay : { [sess.day]: sess.activeSeconds || {} };
    for (const [d, v] of Object.entries(byDay)) map[d] = (map[d] || 0) + ((v && v[key]) || 0) / 60;
  };
  if (S.mode === 'ejemplo') {
    Object.assign(map, (S.demo && S.demo.minutes) || {});
    if (Telemetry.data) add(Telemetry.data, 'ejemplo');
    return map;
  }
  for (const s of S.sessions) if (s && s.sessionId !== SESSION_ID) add(s, 'real');
  // La sesión actual cuenta con su valor en memoria (más reciente que el guardado).
  if (Telemetry.data) add(Telemetry.data, 'real');
  return map;
}

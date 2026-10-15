/* =====================================================================
   Vistas: funciones que devuelven HTML (todo texto de usuario pasa por esc()).
   ===================================================================== */

/* ---------- Piezas reutilizables ---------- */
const idSafe = (k) => 'f-' + String(k).replace(/[^A-Za-z0-9_-]/g, '_');
function fval(key, dflt = '') { return Object.prototype.hasOwnProperty.call(S.ui.f, key) ? S.ui.f[key] : dflt; }
function inputF(key, { type = 'text', value = '', placeholder = '', attrs = '' } = {}) {
  const v = fval(key, value);
  return '<input class="input" id="' + idSafe(key) + '" data-f="' + esc(key) + '" type="' + type + '" value="' + esc(v) + '" placeholder="' + esc(placeholder) + '" ' + attrs + '>';
}
function textareaF(key, { value = '', placeholder = '', rows = 4, attrs = '' } = {}) {
  return '<textarea class="input" id="' + idSafe(key) + '" data-f="' + esc(key) + '" rows="' + rows + '" placeholder="' + esc(placeholder) + '" ' + attrs + '>' + esc(fval(key, value)) + '</textarea>';
}
function selectF(key, options, value = '', attrs = '') {
  const v = String(fval(key, value));
  return '<select class="input" id="' + idSafe(key) + '" data-f="' + esc(key) + '" ' + attrs + '>' +
    options.map(([ov, label]) => '<option value="' + esc(ov) + '"' + (String(ov) === v ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select>';
}
/* Opciones de días que siempre incluyen el valor guardado, para que lo que ves sea lo que hay. */
function dayOptions(cur) {
  const opts = [['3', '3 días'], ['4', '4 días'], ['5', '5 días'], ['7', '7 días']];
  const c = String(cur || '');
  if (c && !opts.some(([v]) => v === c)) opts.push([c, c + ' días']);
  return opts;
}
function checkF(key, label, checked = false, attrs = '') {
  const v = fval(key, checked);
  return '<label class="check" for="' + idSafe(key) + '"><input type="checkbox" id="' + idSafe(key) + '" data-f="' + esc(key) + '"' + (v ? ' checked' : '') + ' ' + attrs + '><span>' + label + '</span></label>';
}
function field(label, control, hint = '') {
  return '<label class="field"><span>' + esc(label) + (hint ? ' <span class="hint">· ' + esc(hint) + '</span>' : '') + '</span>' + control + '</label>';
}
/* label: HTML de confianza (generado por la app) */
function btn(label, act, arg = '', cls = '', attrs = '') {
  return '<button type="button" class="btn ' + cls + '" data-act="' + esc(act) + '" data-arg="' + esc(arg) + '" ' + attrs + '>' + label + '</button>';
}
function busyBtn(label, act, arg, cls, busyKey, busyLabel) {
  const busy = !!S.ui.busy[busyKey];
  return btn(busy ? '<span class="spin" aria-hidden="true"></span>' + esc(busyLabel || 'Trabajando…') : label, act, arg, cls, busy ? 'disabled' : '');
}
const lvlChip = (l) => (l ? '<span class="chip lvl-' + esc(l) + '">' + esc(LEVEL_LABEL[l] || l) + '</span>' : '<span class="chip lvl-none">Sin clasificar</span>');
const exampleTag = (p) => (p && p.ejemplo ? '<span class="example-tag">ejemplo</span>' : '');
const SPIRAL = (size = 26) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 16c0-1.1.9-2 2-2s2 .9 2 2.5-1.6 3.5-4 3.5-4.5-2-4.5-5 2.7-6 6.5-6 7 3.3 7 7.5-3.6 8.5-8.5 8.5S7 21.2 7 16 11 6 16.5 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
function thinking(label, stopKey) {
  return '<div class="thinking" role="status"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>' + esc(label) + '</span>' +
    (stopKey ? btn('Detener', 'ai-stop', stopKey, 'btn-ghost btn-sm') : '') + '</div>';
}

/* ---------- Riel de navegación ---------- */
const VIEWS = [
  ['hoy', 'Hoy'], ['pacientes', 'Pacientes'], ['protocolo', 'Protocolo de crisis'], ['biblioteca', 'Biblioteca'],
  ['piloto', 'Piloto'], ['registro', 'Registro de errores'], ['ajustes', 'Ajustes']
];
function renderRail() {
  const risk = activeAlerts().filter((a) => a.nivel === 'riesgo_alto').length;
  const warn = activeAlerts().filter((a) => a.nivel !== 'riesgo_alto').length;
  const pending = patients().reduce((n, p) => n + pendingInbound(p).length, 0);
  const openErr = ErrorLog.all().filter((e) => e.status !== 'resuelto' && e.mode !== 'ejemplo' && SEV_ORDER[e.severity] >= 3).length;
  const badge = (id) => {
    if (id === 'hoy' && risk) return '<span class="badge risk" aria-label="' + risk + ' alertas de riesgo">' + risk + '</span>';
    if (id === 'hoy' && (warn || pending)) return '<span class="badge warn">' + (warn + pending) + '</span>';
    if (id === 'pacientes' && patients().length) return '<span class="badge">' + patients().length + '</span>';
    if (id === 'registro' && openErr) return '<span class="badge warn" aria-label="' + openErr + ' errores importantes abiertos">' + openErr + '</span>';
    return '';
  };
  const dbLabel = S.mode === 'ejemplo' ? ['warn', 'Modo ejemplo: no se guarda'] : S.status.db === 'ok' ? ['ok', 'Guardado en tu espacio privado'] : S.status.db === 'solo_lectura' ? ['risk', 'Solo lectura'] : S.status.db === 'cargando' ? ['', 'Conectando…'] : ['risk', 'Sin base de datos'];
  const aiLabel = { ok: ['ok', 'IA disponible'], cargando: ['', 'IA: se pedirá permiso al usarla'], denegado: ['warn', 'IA sin permiso'], no: ['risk', 'IA no disponible'], limitado: ['warn', 'IA en pausa (límite)'] }[S.status.ai] || ['', 'IA'];
  const logLabel = !ErrorLog.remoteOk ? ['warn', 'Registro solo en este navegador'] : ErrorLog.noCreate ? ['risk', 'Registro compartido lleno'] : ['ok', 'Registro de errores compartido'];
  return '<div class="brand">' + SPIRAL(28) + '<div><div class="brand-name">Copiloto clínico</div><div class="brand-sub">Piloto · v' + APP_VERSION + '</div></div></div>' +
    '<nav class="tabs" aria-label="Secciones">' + VIEWS.map(([id, label]) =>
      '<button type="button" class="tab" data-act="go" data-arg="' + id + '"' + (S.ui.view === id ? ' aria-current="page"' : '') + '><span>' + esc(label) + '</span>' + badge(id) + '</button>').join('') + '</nav>' +
    '<div class="rail-foot">' +
    '<div><span class="status-dot ' + dbLabel[0] + '"></span>' + esc(dbLabel[1]) + '</div>' +
    '<div><span class="status-dot ' + aiLabel[0] + '"></span>' + esc(aiLabel[1]) + '</div>' +
    '<div><span class="status-dot ' + logLabel[0] + '"></span>' + esc(logLabel[1]) + '</div>' +
    '</div>';
}

/* ---------- Avisos globales ---------- */
function renderBanners() {
  const out = [];
  const alerts = activeAlerts().filter((a) => a.nivel === 'riesgo_alto');
  if (alerts.length && S.ui.view !== 'hoy') {
    out.push('<div class="banner risk" role="alert"><p><strong>Riesgo alto activo:</strong> ' + alerts.map((a) => esc(patientByIdAny(a.pid)?.alias || 'Paciente') + ' (' + esc(relTime(a.ts)) + ')').join(', ') + '. Atiende antes de seguir.</p>' + btn('Ir a la alerta', 'go', 'hoy', 'btn-danger btn-sm') + '</div>');
  }
  if (S.mode === 'ejemplo') {
    const realAlerts = S.real.events.filter((a) => a.tipo === 'alerta' && a.nivel === 'riesgo_alto' && a.estado !== 'cerrada');
    if (realAlerts.length) out.push('<div class="banner risk" role="alert"><p><strong>Tienes una alerta de riesgo alto real</strong> mientras exploras el modo ejemplo. Sigue corriendo el tiempo de escalamiento.</p>' + btn('Volver a mis datos', 'exit-demo', '', 'btn-danger btn-sm') + '</div>');
    const why = S.modeReason === 'elegido' ? 'Estás explorando con datos de ejemplo.' : S.modeReason || 'Esta vista no tiene base de datos.';
    out.push('<div class="banner warn"><p><strong>Modo ejemplo.</strong> ' + esc(why) + ' Nada de lo que hagas aquí se guarda; los errores sí se registran, marcados como ejemplo.</p>' +
      (S.caps.db && S.status.uid ? btn('Volver a mis datos', 'exit-demo', '', 'btn-sm') : '') + '</div>');
  }
  if (S.mode === 'real' && S.real.unsaved.size) {
    out.push('<div class="banner risk" role="alert"><p><strong>' + plural(S.real.unsaved.size, 'registro no se ha guardado', 'registros no se han guardado') + '</strong> por una falla de conexión. Siguen en pantalla y sus alertas siguen activas, pero se perderán si recargas.</p>' + btn('Reintentar guardar', 'retry-unsaved', '', 'btn-danger btn-sm') + '</div>');
  }
  if (S.status.db === 'terminal') out.push('<div class="banner risk"><p><strong>Se cerró el acceso a tus datos</strong> (cambió el permiso o la sesión). Recarga la página para reconectar.</p></div>');
  else if (isReadOnly()) out.push('<div class="banner risk"><p><strong>Solo lectura.</strong> Tu acceso no permite guardar. Pide a quien te compartió esta página que te invite como Editor por correo.</p></div>');
  if (S.status.ai === 'denegado') out.push('<div class="banner info"><p>La IA está desactivada porque no se dio permiso. La app sigue funcionando: tú escribes las respuestas y la red de seguridad por palabras clave sigue activa. Recarga la página para volver a pedir permiso.</p></div>');
  return out.join('');
}

/* ---------- Vista principal ---------- */
function renderMain() {
  if (S.mode === 'cargando') {
    return '<div class="boot"><div class="spiral">' + '<svg width="56" height="56" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 16c0-1.1.9-2 2-2s2 .9 2 2.5-1.6 3.5-4 3.5-4.5-2-4.5-5 2.7-6 6.5-6 7 3.3 7 7.5-3.6 8.5-8.5 8.5S7 21.2 7 16 11 6 16.5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>' +
      '<div><strong>Abriendo tu consultorio…</strong><p class="muted small">Conectando con tu espacio privado y con la IA.</p></div></div>';
  }
  const needsOnboarding = S.mode === 'real' && S.real.loaded.clinic && S.real.loaded.patients && !S.real.clinicError && !S.real.clinicExists && !S.real.patients.length && !isReadOnly() && !['registro', 'ajustes'].includes(S.ui.view);
  const body = needsOnboarding ? viewOnboarding() : ({
    hoy: viewHoy, pacientes: viewPacientes, protocolo: viewProtocolo, biblioteca: viewBiblioteca,
    piloto: viewPiloto, registro: viewRegistro, ajustes: viewAjustes
  }[S.ui.view] || viewHoy)();
  // Contenedor fijo para los avisos: que aparezca uno nunca reemplaza el campo donde estás escribiendo.
  return '<div class="main-inner"><div id="banners" class="stack">' + renderBanners() + '</div>' + body + '</div>';
}

/* ---------- Bienvenida (primera vez, base vacía) ---------- */
function viewOnboarding() {
  return '<div class="view-head"><div><h1>Bienvenida a tu copiloto clínico</h1><p class="sub">Antes de agregar pacientes, dinos cómo te presentas. Tus pacientes y sus conversaciones se guardan en tu espacio privado: nadie más que tú los ve, ni siquiera quien te compartió esta página.</p></div></div>' +
    '<div class="card stack-lg">' +
    '<div class="form-grid">' +
    field('Tu nombre, como lo verán tus pacientes', inputF('ob.nombre', { placeholder: 'Alexa' })) +
    field('Minutos para escalar una alerta', inputF('ob.minutos', { type: 'number', value: 10, attrs: 'min="1" max="120"' }), 'por definir con criterio clínico') +
    field('Horario en que revisas', inputF('ob.horario', { value: defaultSettings().horario })) +
    '</div>' +
    field('Tu frase de bienvenida', textareaF('ob.frase', { value: defaultSettings().bienvenida, rows: 2 })) +
    '<div class="row">' + btn('Guardar y agregar mi primer paciente', 'save-onboarding', '', 'btn-primary') + btn('Explorar con datos de ejemplo', 'explore-demo', '', 'btn-ghost') + '</div>' +
    '<p class="small muted">Fuera del alcance del piloto: menores de edad, hospitales psiquiátricos y pacientes en riesgo alto sin un plan de seguridad activo.</p>' +
    '</div>';
}

/* ---------- Hoy ---------- */
function viewHoy() {
  const ps = patients();
  const alerts = activeAlerts();
  const pend = ps.flatMap((p) => pendingInbound(p).map((e) => ({ p, e })));
  const fups = ps.map((p) => ({ p, due: followUpDue(p) })).filter((x) => x.due && x.due <= addDays(startOfDay(new Date()), 1));
  const today = ps.filter((p) => { const n = nextSessionDate(p); return n && dayKey(n) === dayKey(); });
  const reminders = ps.map((p) => ({ p, next: reminderDue(p) })).filter((x) => x.next);
  const mins = Math.round(minutesByDay()[dayKey()] || 0);
  const goal = Number(settings().metaMinutos) || 15;

  let html = '<div class="view-head"><div><h1>Hoy</h1><p class="sub">' + esc(cap1(fmtDateLong.format(new Date()))) + '. Lo que necesita tu atención, en orden de urgencia.</p></div>' +
    (ps.length ? btn('Registrar mensaje de un paciente', 'go', 'pacientes', 'btn-primary') : btn('Agregar paciente', 'new-patient', '', 'btn-primary')) + '</div>';

  html += '<div class="today-strip">' +
    stat(alerts.filter((a) => a.nivel === 'riesgo_alto').length, 'alertas de riesgo alto', alerts.some((a) => a.nivel === 'riesgo_alto') ? 'risk' : '') +
    stat(pend.length, 'mensajes por responder', pend.length ? 'warn' : '') +
    stat(fups.length, 'seguimientos que tocan') +
    stat(mins + '<span class="small muted"> / ' + goal + ' min</span>', 'tiempo hoy en el panel', mins > goal ? 'warn' : '', true) +
    '</div>';

  if (alerts.length) {
    html += '<section class="stack" aria-labelledby="h-alertas"><h2 id="h-alertas">Atender ahora</h2>' + alerts.map(alertCard).join('') + '</section>';
  }
  html += '<div class="grid-2">';
  html += '<section class="card" aria-labelledby="h-pend"><div class="card-head"><h3 id="h-pend">Por responder</h3><span class="small muted">' + plural(pend.length, 'mensaje', 'mensajes') + '</span></div>' +
    (pend.length ? pend.sort((a, b) => levelRank(b.e.nivel) - levelRank(a.e.nivel) || String(a.e.ts).localeCompare(String(b.e.ts))).map(({ p, e }) =>
      '<div class="todo"><span>' + lvlChip(e.nivel) + '</span><div><div class="who">' + esc(p.alias) + ' ' + exampleTag(p) + '</div><div class="what">' + esc(fmtWhen(e.ts)) + ' · ' + esc(clip(e.texto, 110)) + '</div></div>' +
      btn('Abrir', 'open-patient', p.id, 'btn-sm') + '</div>').join('') : '<p class="muted small">No hay mensajes esperando respuesta.</p>') + '</section>';

  html += '<section class="card" aria-labelledby="h-fu"><div class="card-head"><h3 id="h-fu">Seguimientos</h3><span class="small muted">a los 3 o 4 días de cada sesión</span></div>' +
    (fups.length ? fups.map(({ p, due }) =>
      '<div class="todo"><span class="tag accent">' + esc(due < startOfDay(new Date()) ? 'atrasado' : 'hoy') + '</span><div><div class="who">' + esc(p.alias) + ' ' + exampleTag(p) + '</div><div class="what">Última sesión ' + esc(relTime(p.ultimaSesion)) + ' · ' + esc((p.tareas || []).filter((t) => t.estado === 'pendiente').length) + ' tareas pendientes</div></div>' +
      btn('Redactar', 'start-followup', p.id, 'btn-sm') + '</div>').join('') : '<p class="muted small">Ningún seguimiento toca hoy.</p>') + '</section>';

  html += '<section class="card" aria-labelledby="h-ses"><div class="card-head"><h3 id="h-ses">Sesiones de hoy</h3></div>' +
    (today.length ? today.map((p) => '<div class="todo"><span class="tag">' + esc(p.sesion?.hora || '') + '</span><div><div class="who">' + esc(p.alias) + ' ' + exampleTag(p) + '</div><div class="what">' + esc(plural(eventsSinceLastSession(p).filter((e) => e.tipo === 'entrada').length, 'mensaje', 'mensajes')) + ' desde la última sesión</div></div>' +
      btn('Ver resumen', 'open-summary', p.id, 'btn-sm') + '</div>').join('') : '<p class="muted small">No hay sesiones registradas para hoy.</p>') + '</section>';

  html += '<section class="card" aria-labelledby="h-rec"><div class="card-head"><h3 id="h-rec">Recordatorios de cita para mañana</h3></div>' +
    (reminders.length ? reminders.map(({ p, next }) => '<div class="todo"><span class="tag">' + esc(fmtTime.format(next)) + '</span><div><div class="who">' + esc(p.alias) + ' ' + exampleTag(p) + '</div><div class="what">' + esc(cap1(fmtDateLong.format(next))) + '</div></div>' +
      btn('Preparar', 'compose-template', p.id + '|recordatorio', 'btn-sm') + '</div>').join('') : '<p class="muted small">Nada que recordar para mañana.</p>') + '</section>';
  html += '</div>';

  if (!ps.length) {
    html += '<div class="empty"><strong>Todavía no tienes pacientes en el piloto.</strong><p>Agrega de 3 a 4 pacientes adultos, sin riesgo alto y con consentimiento informado firmado.</p><div class="row" style="margin-top:10px">' + btn('Agregar paciente', 'new-patient', '', 'btn-primary') + (S.mode === 'real' ? btn('Explorar con datos de ejemplo', 'explore-demo', '', 'btn-ghost') : '') + '</div></div>';
  }
  return html;
}
function stat(v, k, cls = '', raw = false) {
  return '<div class="stat ' + cls + '"><span class="v">' + (raw ? v : esc(v)) + '</span><span class="k">' + esc(k) + '</span></div>';
}
function cap1(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) : s; }
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function alertCard(a) {
  const p = patientByIdAny(a.pid);
  const s = settings();
  const x = Number(s.minutosEscalamiento) || 10;
  const t0 = alertStart(a);
  const overdue = !a.ackEn && Date.now() - t0 > x * 60000;
  const wrote = a.entradaTs && Math.abs(new Date(a.entradaTs).getTime() - new Date(a.ts).getTime()) > 60000 ? ' · el paciente escribió ' + esc(relTime(a.entradaTs)) : '';
  const ps = (p && p.planSeguridad) || {};
  const contacto = ps.contactoEmergencia || {};
  if (a.nivel !== 'riesgo_alto') {
    return '<div class="alert-card malestar"><div class="row between"><div class="row"><span class="chip lvl-malestar">Atender pronto</span><strong>' + esc(p?.alias || 'Paciente') + '</strong> ' + exampleTag(p) + '<span class="small muted">' + esc(relTime(a.ts)) + '</span></div>' +
      '<div class="row">' + btn('Abrir conversación', 'open-patient', a.pid, 'btn-sm') + btn('Ya lo atendí', 'close-alert', a.id + '|atendido', 'btn-sm') + '</div></div>' +
      '<p class="small">' + esc(a.motivo || 'El malestar no bajó después de la técnica.') + '</p></div>';
  }
  const step = (n, title, sub, state) => '<div class="chain-step ' + state + '"><span class="label">Paso ' + n + '</span><b>' + esc(title) + '</b><span>' + sub + '</span></div>';
  const s1 = a.ackEn ? 'done' : 'on';
  const s3 = !a.ackEn && overdue ? 'on' : 'off';
  return '<div class="alert-card" role="alert">' +
    '<div class="row between"><div class="row"><span class="chip lvl-riesgo_alto">Riesgo alto</span><strong>' + esc(p?.alias || 'Paciente') + '</strong> ' + exampleTag(p) + '<span class="small muted">detectado ' + esc(relTime(a.ts)) + ' por ' + esc(a.fuente === 'red' ? 'la red de seguridad' : a.fuente === 'psicologa' ? 'ti' : 'la IA') + wrote + '</span>' + (a.noGuardado ? '<span class="tag" style="color:var(--risk)">no guardado</span>' : '') + (p && p.activo === false ? '<span class="tag">archivado</span>' : '') + '</div>' +
    '<div class="row">' + btn('Abrir conversación', 'open-patient', a.pid, 'btn-sm') + '</div></div>' +
    (a.ackEn ? '<p class="small"><strong>Atendida</strong> ' + esc(relTime(a.ackEn)) + '. Cierra la alerta cuando el paciente esté a salvo o canalizado.</p>'
      : '<p class="small">' + (overdue ? '<strong>Pasaron más de ' + x + ' minutos sin atender.</strong> Activa el siguiente eslabón: contacto de emergencia y línea de crisis.' : 'Tienes <span class="countdown" data-countdown="' + esc(new Date(t0).toISOString()) + '" data-min="' + x + '">' + x + ':00</span> para atender antes de escalar. Responder desde la conversación cuenta como atenderla.') + '</p>') +
    '<div class="chain">' +
    step(1, 'Tú (psicóloga tratante)', 'Llama o escribe al paciente ahora.', s1) +
    step(2, 'Psicólogo de guardia', 'Disponible en la fase 3. En el piloto se omite.', 'off') +
    step(3, 'Contacto de emergencia y línea de crisis', esc(contacto.nombre || 'Sin contacto registrado') + (contacto.telefono ? ' · <span class="mono">' + esc(contacto.telefono) + '</span>' : '') + '<br>' + esc(s.lineaCrisis) + ' · ' + esc(s.emergencias), s3) +
    '</div>' +
    (ps.calma ? '<p class="small"><span class="label">Plan de seguridad</span><br>Le ayuda: ' + esc(ps.calma) + (ps.razones ? ' · Razones para seguir: ' + esc(ps.razones) : '') + '</p>' : '<p class="small"><strong>Este paciente no tiene plan de seguridad registrado.</strong></p>') +
    '<div class="row">' + (!a.ackEn ? btn('Ya contacté al paciente', 'ack-alert', a.id, 'btn-danger') : '') +
    selectF('res.' + a.id, [['', 'Cerrar alerta con resultado…'], ['a_salvo', 'Contactado y a salvo'], ['canalizado', 'Canalizado a urgencias o psiquiatría'], ['linea_crisis', 'Sin respuesta: se activó contacto o línea de crisis'], ['falsa_alarma', 'Falsa alarma']], '', 'aria-label="Resultado de la alerta"') +
    btn('Cerrar alerta', 'close-alert', a.id + '|', 'btn-sm') + '</div></div>';
}

/* ---------- Pacientes ---------- */
function viewPacientes() {
  const ps = patients();
  if (!ps.length) {
    return '<div class="view-head"><div><h1>Pacientes</h1><p class="sub">Cada paciente tiene su conversación, su plan y su expediente vivo.</p></div>' + btn('Agregar paciente', 'new-patient', '', 'btn-primary') + '</div>' +
      '<div class="empty"><strong>Aún no hay pacientes.</strong><p>Para el piloto elige de 3 a 4 pacientes adultos, sin riesgo alto y con consentimiento informado firmado.</p></div>';
  }
  if (!S.ui.pid || !patientById(S.ui.pid)) S.ui.pid = ps[0].id;
  const p = patientById(S.ui.pid);
  const list = '<div class="plist">' + btn('+ Agregar paciente', 'new-patient', '', 'btn-ghost') + ps.map((x) => {
    const al = activeAlerts(x.id);
    const pend = pendingInbound(x).length;
    const next = nextSessionDate(x);
    const meta = al.some((a) => a.nivel === 'riesgo_alto') ? '<span class="chip lvl-riesgo_alto">Riesgo alto</span>' : pend ? '<span class="chip lvl-malestar">' + plural(pend, 'por responder', 'por responder') + '</span>' : next ? 'Sesión ' + esc(WEEKDAYS[next.getDay()]) + ' ' + esc(x.sesion?.hora || '') : 'Sin sesión fija';
    return '<button type="button" class="pitem" data-act="select-patient" data-arg="' + esc(x.id) + '"' + (x.id === p.id ? ' aria-current="true"' : '') + '><span class="avatar">' + esc(initials(x.alias)) + '</span><span class="nm"><span>' + esc(x.alias) + '</span>' + exampleTag(x) + '</span><span class="meta">' + meta + '</span></button>';
  }).join('') + '</div>';
  return '<div class="view-head"><div><h1>Pacientes</h1><p class="sub">Registra aquí cada mensaje que llega por WhatsApp. La asistente lo clasifica y redacta; tú apruebas antes de enviar.</p></div></div>' +
    '<div class="patients' + (S.ui.mobileDetail ? ' has-detail' : '') + '">' + list + '<div class="stack-lg" style="min-width:0">' + patientDetail(p) + '</div></div>';
}

function patientDetail(p) {
  const h = hoursSinceSession(p);
  const next = nextSessionDate(p);
  const tabs = [['conversacion', 'Conversación'], ['plan', 'Plan'], ['nota', 'Nota de sesión'], ['resumen', 'Resumen']];
  const pend = pendingInbound(p).length;
  let html = '<div class="card stack">' +
    '<button type="button" class="btn btn-ghost btn-sm back-to-list" data-act="back-to-list" style="justify-self:start">← Todos los pacientes</button>' +
    '<div class="phead"><h2><span class="avatar" style="grid-row:auto">' + esc(initials(p.alias)) + '</span>' + esc(p.alias) + ' ' + exampleTag(p) + '</h2>' +
    '<div class="row">' + selectF('tpl.' + p.id, [['', 'Mensajes rápidos…'], ['bienvenida', 'Bienvenida (firmada por ti)'], ['recordatorio', 'Recordatorio de cita'], ['pago', 'Recordatorio de pago'], ['reagendar', 'Reagendar cita'], ['cierre', 'Cierre de ciclo (IA)'], ['manual', 'Escribir mensaje propio']], '', 'data-change="compose-template-select" data-arg="' + esc(p.id) + '" aria-label="Mensajes rápidos"') + '</div></div>' +
    '<div class="facts">' +
    '<span>Sesión: <b>' + (p.sesion && p.sesion.dia !== '' && p.sesion.dia != null ? esc(WEEKDAYS[Number(p.sesion.dia)] + ' ' + (p.sesion.hora || '')) : 'sin día fijo') + '</b></span>' +
    '<span>Última: <b>' + (p.ultimaSesion ? esc(relTime(p.ultimaSesion)) + (h != null ? ' (' + h + ' h entre sesiones)' : '') : 'sin registrar') + '</b></span>' +
    (next ? '<span>Próxima: <b>' + esc(fmtWhen(next.toISOString())) + '</b></span>' : '') +
    '<span>Seguimiento: <b>' + (p.seguimiento?.pausado ? 'en pausa' : 'cada ' + esc(p.seguimiento?.cadaDias || 3) + ' días, tono ' + esc(p.seguimiento?.tono || 'cálido')) + '</b></span>' +
    '<span>Consentimiento: <b>' + (p.consentimiento?.firmado ? 'firmado ' + esc(p.consentimiento.fecha || '') : 'pendiente') + '</b></span>' +
    '</div></div>';
  html += '<div class="ptabs" role="tablist">' + tabs.map(([id, label]) => '<button type="button" role="tab" class="ptab" data-act="ptab" data-arg="' + id + '" aria-selected="' + (S.ui.ptab === id) + '">' + esc(label) + (id === 'conversacion' && pend ? ' (' + pend + ')' : '') + '</button>').join('') + '</div>';
  const body = { conversacion: tabConversacion, plan: tabPlan, nota: tabNota, resumen: tabResumen }[S.ui.ptab] || tabConversacion;
  return html + body(p);
}

/* Conversación */
function tabConversacion(p) {
  const evs = eventsFor(p.id);
  const thread = evs.length ? evs.map((e) => threadItem(p, e)).join('') : '<div class="empty small">Sin mensajes todavía. Cuando el paciente te escriba por WhatsApp, pega aquí su mensaje.</div>';
  const out = S.ui.out && S.ui.out[p.id];
  const compose = '<div class="card stack">' +
    '<div class="card-head"><h3>Registrar mensaje del paciente</h3><span class="small muted">Ctrl + Enter para registrar</span></div>' +
    textareaF('in.' + p.id, { placeholder: 'Pega aquí lo que escribió ' + p.alias + ' por WhatsApp', rows: 3, attrs: 'data-submit="register-inbound" data-submit-arg="' + esc(p.id) + '"' }) +
    '<div class="row between"><div class="row"><span class="small muted">Respuesta rápida:</span>' +
    Object.entries(QUICK_REPLIES).map(([k, v]) => btn(esc(v), 'quick-reply', p.id + '|' + k, 'btn-sm')).join('') + '</div>' +
    '<div class="row"><label class="small muted" for="' + idSafe('inTs.' + p.id) + '">Llegó</label>' + inputF('inTs.' + p.id, { type: 'datetime-local', value: '', attrs: 'style="width:auto"' }) +
    busyBtn('Registrar y analizar', 'register-inbound', p.id, 'btn-primary', 'reg:' + p.id, 'Registrando…') + '</div></div></div>';
  const actions = '<div class="row">' + busyBtn('Redactar seguimiento', 'start-followup', p.id, '', 'fu:' + p.id, 'Redactando…') +
    btn('Escribir mensaje propio', 'compose-template', p.id + '|manual', 'btn-ghost') + '</div>';
  return '<div class="convo"><div class="stack-lg" style="min-width:0">' +
    '<div class="card"><div class="card-head"><h3>Conversación</h3><span class="small muted">' + plural(evs.filter((e) => e.tipo === 'entrada').length, 'mensaje', 'mensajes') + ' del paciente</span></div>' +
    '<div class="thread" id="thread-' + esc(p.id) + '">' + thread + '</div></div>' +
    (out ? outComposer(p, out) : '') + compose + actions + '</div>' +
    '<aside class="card plan-mini" aria-label="Plan activo">' + planMini(p) + '</aside></div>';
}
function threadItem(p, e) {
  if (e.tipo === 'entrada') {
    const meta = '<div class="msg-meta"><span>' + esc(fmtWhen(e.ts)) + '</span>' + lvlChip(e.nivel) +
      (e.rapida ? '<span class="tag">respuesta rápida</span>' : '') +
      (e.intensidad ? '<span class="tag">intensidad ' + esc(e.intensidad) + '/5</span>' : '') +
      (e.temas || []).slice(0, 3).map((t) => '<span class="tag">' + esc(t) + '</span>').join('') +
      (e.nivelAjustadoPor ? '<span class="tag accent">nivel ajustado por ti</span>' : '') +
      (e.noGuardado ? '<span class="tag" style="color:var(--risk)">no guardado</span>' : '') + '</div>';
    let below = '';
    if (e.estado === 'pendiente') below = draftBlock(p, e);
    else if (e.nivel === 'malestar' && e.estado === 'respondido' && !e.ayudo && !e.respondidoSinMensaje) below = helpedBlock(e);
    return '<div class="msg in" id="m-' + esc(e.id) + '"><div class="bubble">' + esc(e.texto) + '</div>' + meta + '</div>' + below;
  }
  if (e.tipo === 'salida') {
    return '<div class="msg out"><div class="bubble">' + esc(e.texto) + '</div><div class="msg-meta"><span>' + esc(SALIDA_LABEL[e.tipoSalida] || 'Mensaje') + '</span><span>' + esc(fmtWhen(e.ts)) + '</span>' +
      (e.editado ? '<span class="tag">editado por ti</span>' : e.borradorIA ? '<span class="tag accent">aprobado sin cambios</span>' : '') +
      (e.noGuardado ? '<span class="tag" style="color:var(--risk)">no guardado</span>' : '') + '</div></div>';
  }
  if (e.tipo === 'alerta') {
    return '<div class="msg sys"><div class="bubble">' + (e.nivel === 'riesgo_alto' ? 'Alerta de riesgo alto' : 'Aviso: atender pronto') + ' · ' + esc(fmtWhen(e.ts)) + ' · ' + esc(e.estado === 'cerrada' ? 'cerrada' + (e.resultado ? ' (' + (ALERT_OUTCOME[e.resultado] || e.resultado) + ')' : '') : e.ackEn ? 'atendida' : 'activa') + '</div></div>';
  }
  if (e.tipo === 'nota') {
    return '<div class="msg sys"><div class="bubble">Sesión registrada · ' + esc(fmtWhen(e.fechaSesion || e.ts)) + (e.estructura && e.estructura.resumen ? ' · ' + esc(clip(e.estructura.resumen, 140)) : '') + '</div></div>';
  }
  return '';
}
const ALERT_OUTCOME = { a_salvo: 'contactado y a salvo', canalizado: 'canalizado', linea_crisis: 'se activó contacto o línea de crisis', falsa_alarma: 'falsa alarma', atendido: 'atendido', nivel_bajado: 'bajaste el nivel' };
function helpedBlock(e) {
  const tec = e.tecnicaId ? techById(e.tecnicaId) : null;
  return '<div class="draft malestar"><div class="row between"><span class="small"><strong>¿Bajó la intensidad?</strong> ' + (tec ? 'Se sugirió: ' + esc(tec.nombre) + '.' : '') + ' Regístralo cuando el paciente te conteste.</span>' +
    '<div class="row">' + btn('Sí, ayudó', 'helped', e.id + '|sí', 'btn-sm') + btn('En parte', 'helped', e.id + '|parcialmente', 'btn-sm') + btn('No bajó', 'helped', e.id + '|no', 'btn-sm') + '</div></div></div>';
}
function draftBlock(p, e) {
  const key = 'cls:' + e.id;
  if (S.ui.busy[key]) {
    return '<div class="draft ' + (e.nivel === 'riesgo_alto' ? 'risk' : '') + '">' + (e.nivel === 'riesgo_alto' ? '<p class="small"><strong>La red de seguridad marcó riesgo alto.</strong> La alerta ya está activa mientras la asistente redacta.</p>' : '') + thinking('La asistente está leyendo el mensaje y redactando…', key) + '</div>';
  }
  const lvlCls = e.nivel === 'riesgo_alto' ? 'risk' : e.nivel === 'malestar' ? 'malestar' : '';
  const hasDraft = e.borrador != null && e.borrador !== '' && !e.borradorDescartado;
  const levelSel = '<label class="row small"><span class="muted">Nivel</span>' + selectF('lvl.' + e.id, LEVELS.map((l) => [l, LEVEL_LABEL[l]]), e.nivel || 'normal', 'data-change="set-level" data-arg="' + esc(e.id) + '" style="width:auto"') + '</label>';
  const src = e.nivelFuente === 'red' ? '<span class="tag">clasificado solo con palabras clave</span>' : e.nivelIA && e.nivelIA !== e.nivel ? '<span class="tag">la IA dijo: ' + esc(LEVEL_LABEL[e.nivelIA]) + '</span>' : '';
  const tec = e.tecnicaId ? techById(e.tecnicaId) : null;
  const rec = e.recursoId ? resourceById(e.recursoId) : null;
  const task = e.tareaId ? (p.tareas || []).find((t) => t.id === e.tareaId) : null;
  let html = '<div class="draft ' + lvlCls + '"><div class="row between"><div class="row"><strong>' + (hasDraft ? (e.borradorFuente === 'plantilla' ? 'Respuesta sugerida (plantilla)' : 'Borrador de la asistente') : 'Tu respuesta') + '</strong>' + src + '</div>' + levelSel + '</div>';
  if (e.notaIA) html += '<p class="ai-note">' + esc(e.notaIA) + '</p>';
  if (e.errorIA) html += '<p class="small" style="color:var(--warn)">' + esc(aiErrorCopy({ code: e.errorIA })) + '</p>';
  if (e.detenidoPorUsuario) html += '<p class="small" style="color:var(--warn)">' + esc(AI_ERROR_COPY.cancelado) + '</p>';
  if ((e.problemasIA || []).some((x) => x === 'tecnica_fuera_del_plan' || x === 'recurso_fuera_de_lista')) html += '<p class="small" style="color:var(--risk)"><strong>La asistente sugirió algo que no está en el plan o en tu lista curada.</strong> Revisa el texto antes de aprobar.</p>';
  if ((e.problemasIA || []).includes('se_presenta_como_psicologa')) html += '<p class="small" style="color:var(--risk)"><strong>El borrador habla como si fueras tú.</strong> La asistente debe presentarse como tu asistente.</p>';
  if (tec || rec || task) {
    html += '<div class="row small">' + (tec ? '<span class="tag accent">técnica: ' + esc(tec.nombre) + '</span>' : '') + (rec ? '<span class="tag accent">recurso: ' + esc(rec.titulo) + '</span>' : '') +
      (task && e.tareaEstado && task.estado !== e.tareaEstado ? btn('Marcar tarea "' + esc(clip(task.texto, 40)) + '" como ' + (e.tareaEstado === 'hecha' ? 'hecha' : 'no hecha'), 'task-from-msg', e.id, 'btn-ghost btn-sm') : '') + '</div>';
  }
  const dflt = hasDraft ? e.borrador : '';
  html += textareaF('draft.' + e.id, { value: dflt, rows: 5, placeholder: 'Escribe la respuesta que enviarás por WhatsApp', attrs: 'aria-label="Respuesta para ' + esc(p.alias) + '" data-submit="approve-draft" data-submit-arg="' + esc(e.id) + '"' });
  if (S.ui.open['discard.' + e.id]) {
    html += '<div class="row">' + selectF('why.' + e.id, [['tono', 'El tono no es adecuado'], ['inexacto', 'Información inexacta'], ['fuera_del_plan', 'Se sale del plan'], ['muy_largo', 'Demasiado largo'], ['riesgo_mal_evaluado', 'El nivel de riesgo está mal'], ['otro', 'Otro motivo']], 'tono', 'style="width:auto" aria-label="Motivo del descarte"') +
      btn('Confirmar descarte', 'confirm-discard', e.id, 'btn-sm') + btn('Cancelar', 'toggle-open', 'discard.' + e.id, 'btn-ghost btn-sm') + '</div>';
  }
  html += '<div class="row between"><div class="row">' + btn('Aprobar y copiar', 'approve-draft', e.id, 'btn-primary') +
    (AI.available() ? btn(hasDraft ? 'Regenerar' : 'Redactar con IA', 'classify', e.id, 'btn-sm') : '') +
    (hasDraft && !S.ui.open['discard.' + e.id] ? btn('Descartar borrador', 'toggle-open', 'discard.' + e.id, 'btn-ghost btn-sm') : '') + '</div>' +
    btn('Ya lo atendí por otro medio', 'mark-handled', e.id, 'btn-ghost btn-sm') + '</div>' +
    '<p class="small faint">Revisa antes de enviar. Al aprobar, el texto se copia para que lo pegues en WhatsApp y queda en el expediente.</p></div>';
  return html;
}
function outComposer(p, out) {
  const key = 'out:' + p.id;
  const busy = !!S.ui.busy[key];
  const title = { seguimiento: 'Seguimiento', bienvenida: 'Mensaje de bienvenida', recordatorio: 'Recordatorio de cita', pago: 'Recordatorio de pago', reagendar: 'Reagendar cita', cierre: 'Cierre de ciclo', resumen_sesion: 'Resumen de la sesión para el paciente', manual: 'Mensaje propio' }[out.kind] || 'Mensaje';
  return '<div class="draft"><div class="row between"><strong>' + esc(title) + '</strong><span class="small muted">' + (out.fuente === 'ia' ? 'redactado por la asistente' : out.fuente === 'plantilla' ? 'plantilla' : 'escrito por ti') + '</span></div>' +
    (busy ? thinking('La asistente está redactando…', key) : '') +
    (out.aviso ? '<p class="small" style="color:var(--risk)"><strong>' + esc(out.aviso) + '</strong></p>' : '') +
    textareaF('out.' + p.id, { value: '', rows: 6, placeholder: 'Escribe el mensaje', attrs: (busy ? 'readonly ' : '') + 'aria-label="' + esc(title) + '" data-submit="approve-out" data-submit-arg="' + esc(p.id) + '"' }) +
    '<div class="row">' + btn('Aprobar y copiar', 'approve-out', p.id, 'btn-primary', busy ? 'disabled' : '') + btn(busy ? 'Detener y cancelar' : 'Cancelar', 'cancel-out', p.id, 'btn-ghost') + '</div></div>';
}
function planMini(p) {
  const tareas = (p.tareas || []).filter((t) => t.estado !== 'archivada');
  const tec = (p.tecnicas || []).map(techById).filter(Boolean);
  const ps = p.planSeguridad || {};
  return '<div><span class="label">Tareas</span>' + (tareas.length ? '<ul>' + tareas.map((t) => '<li class="' + (t.estado === 'hecha' ? 'task-done' : '') + '">' + esc(t.texto) + (t.estado === 'no_hecha' ? ' <span class="tag">no hecha</span>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">Sin tareas.</p>') + '</div>' +
    '<div><span class="label">Técnicas aprobadas</span>' + (tec.length ? '<ul>' + tec.map((t) => '<li>' + esc(t.nombre) + '</li>').join('') + '</ul>' : '<p class="muted">Ninguna aprobada. Apruébalas en Plan.</p>') + '</div>' +
    '<div><span class="label">Plan de seguridad</span>' + (ps.calma || ps.senales ? '<p>Señales: ' + esc(ps.senales || '—') + '</p><p>Le ayuda: ' + esc(ps.calma || '—') + '</p>' : '<p style="color:var(--risk)">Sin plan de seguridad.</p>') + '</div>' +
    btn('Editar plan', 'ptab', 'plan', 'btn-ghost btn-sm');
}

/* Plan */
function tabPlan(p) {
  const k = (x) => 'pl.' + p.id + '.' + x;
  const ps = p.planSeguridad || {};
  const ce = ps.contactoEmergencia || {};
  const tareas = (p.tareas || []).filter((t) => t.estado !== 'archivada');
  const groups = Object.keys(SITUACIONES).map((sit) => [sit, allTechniques().filter((t) => t.situacion === sit)]).filter(([, l]) => l.length);
  const approved = new Set(p.tecnicas || []);
  return '<div class="grid-2">' +
    '<section class="card stack"><div class="card-head"><h3>Datos y seguimiento</h3></div><div class="form-grid">' +
    field('Alias o iniciales', inputF(k('alias'), { value: p.alias })) +
    field('Día de sesión', selectF(k('dia'), [['', 'Sin día fijo']].concat(WEEKDAYS.map((d, i) => [String(i), cap1(d)])), p.sesion?.dia ?? '')) +
    field('Hora', inputF(k('hora'), { type: 'time', value: p.sesion?.hora || '18:00' })) +
    field('Seguimiento cada', selectF(k('cada'), dayOptions(p.seguimiento?.cadaDias || 3), String(p.seguimiento?.cadaDias || 3))) +
    field('Tono', selectF(k('tono'), [['cálido', 'Cálido'], ['directo', 'Directo'], ['breve', 'Breve']], p.seguimiento?.tono || 'cálido')) +
    field('Consentimiento firmado el', inputF(k('consent'), { type: 'date', value: p.consentimiento?.fecha || '' })) +
    '</div>' + checkF(k('pausa'), 'Pausar seguimientos (el paciente lo pidió o se siente vigilado)', !!p.seguimiento?.pausado) +
    '<div class="row">' + btn('Guardar datos', 'save-plan-basics', p.id, 'btn-primary') + '</div></section>' +

    '<section class="card stack"><div class="card-head"><h3>Plan de seguridad</h3><span class="small muted">elaborado en sesión</span></div>' +
    field('Señales de alerta', textareaF(k('senales'), { value: ps.senales || '', rows: 2 })) +
    field('Lo que le ayuda a calmarse', textareaF(k('calma'), { value: ps.calma || '', rows: 2 })) +
    field('Personas de apoyo', inputF(k('apoyo'), { value: ps.apoyo || '' }), 'solo nombres; la IA los ve') +
    field('Razones para seguir', textareaF(k('razones'), { value: ps.razones || '', rows: 2 })) +
    '<div class="form-grid">' + field('Contacto de emergencia', inputF(k('ceNombre'), { value: ce.nombre || '' })) + field('Teléfono', inputF(k('ceTel'), { type: 'tel', value: ce.telefono || '' }), 'la IA no lo ve') + '</div>' +
    '<div class="row">' + btn('Guardar plan de seguridad', 'save-safety', p.id, 'btn-primary') + '</div></section>' +

    '<section class="card stack"><div class="card-head"><h3>Tareas acordadas</h3></div>' +
    (tareas.length ? '<ul class="list">' + tareas.map((t) => '<li><div class="' + (t.estado === 'hecha' ? 'task-done' : '') + '">' + esc(t.texto) + '</div><div class="row">' +
      '<div class="seg" role="group" aria-label="Estado de la tarea">' + [['pendiente', 'Pendiente'], ['hecha', 'Hecha'], ['no_hecha', 'No hecha']].map(([v, l]) => '<button type="button" data-act="task-state" data-arg="' + esc(p.id + '|' + t.id + '|' + v) + '" aria-pressed="' + (t.estado === v) + '">' + l + '</button>').join('') + '</div>' +
      btn('Archivar', 'task-state', p.id + '|' + t.id + '|archivada', 'btn-ghost btn-sm') + '</div></li>').join('') + '</ul>' : '<p class="muted small">Sin tareas. Agrégalas aquí o desde la nota de sesión.</p>') +
    '<div class="row">' + inputF(k('newTask'), { placeholder: 'Nueva tarea, por ejemplo: dibujar espirales cuando sienta una crisis', attrs: 'style="flex:1;min-width:200px" data-submit="add-task" data-submit-arg="' + esc(p.id) + '"' }) + btn('Agregar', 'add-task', p.id) + '</div></section>' +

    '<section class="card stack"><div class="card-head"><h3>Técnicas aprobadas</h3><span class="small muted">la IA solo sugiere las marcadas</span></div>' +
    groups.map(([sit, list]) => '<div><span class="label">' + esc(SITUACIONES[sit]) + '</span><div class="stack" style="gap:6px;margin-top:6px">' + list.map((t) =>
      '<label class="check"><input type="checkbox" data-change="toggle-tech" data-arg="' + esc(p.id + '|' + t.id) + '"' + (approved.has(t.id) ? ' checked' : '') + '><span><strong>' + esc(t.nombre) + '</strong> <span class="small muted">' + esc(clip(t.pasos, 90)) + '</span></span></label>').join('') + '</div></div>').join('') +
    '</section>' +

    '<section class="card stack"><div class="card-head"><h3>Expediente</h3></div>' +
    field('Temas de trabajo', textareaF(k('temas'), { value: (p.temas || []).join('\n'), rows: 3 }), 'uno por línea') +
    field('Pendientes clínicos', textareaF(k('pendientes'), { value: (p.pendientes || []).join('\n'), rows: 3 }), 'uno por línea') +
    '<div class="row">' + btn('Guardar expediente', 'save-record', p.id, 'btn-primary') + '</div></section>' +

    '<section class="card stack"><div class="card-head"><h3>Evaluación del piloto</h3></div>' +
    field('¿Usa ChatGPT u otra IA entre sesiones?', selectF(k('gpt'), [['', 'Aún no se le pregunta'], ['no', 'No'], ['a_veces', 'A veces'], ['si', 'Sí, seguido'], ['dejo', 'La usaba y dejó de hacerlo']], p.chatGPT || ''), 'se pregunta al final') +
    field('Valoración del paciente (1 a 5)', selectF(k('val'), [['', 'Sin valorar'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], p.valoracionPaciente == null ? '' : String(p.valoracionPaciente))) +
    '<div class="row">' + btn('Guardar evaluación', 'save-eval', p.id, 'btn-primary') + '</div>' +
    '<hr class="divider">' +
    (S.ui.open['del.' + p.id]
      ? '<div class="stack"><p class="small"><strong>Esto borra a ' + esc(p.alias) + ' y todo su historial.</strong> Úsalo cuando el paciente pide que se borre su información. No se puede deshacer. Escribe su alias para confirmar.</p>' +
        inputF('delc.' + p.id, { placeholder: p.alias }) + '<div class="row">' + btn('Borrar definitivamente', 'delete-patient', p.id, 'btn-danger btn-sm') + btn('Cancelar', 'toggle-open', 'del.' + p.id, 'btn-ghost btn-sm') + '</div></div>'
      : '<div class="row">' + btn('Archivar paciente', 'archive-patient', p.id, 'btn-ghost btn-sm') + btn('Borrar paciente y su historial…', 'toggle-open', 'del.' + p.id, 'btn-ghost btn-sm') + '</div>') +
    '</section></div>';
}

/* Nota de sesión */
function tabNota(p) {
  const key = 'note:' + p.id;
  const draft = S.ui.noteDraft && S.ui.noteDraft[p.id];
  const notes = eventsFor(p.id).filter((e) => e.tipo === 'nota').slice().reverse();
  let html = '<div class="grid-2"><section class="card stack"><div class="card-head"><h3>Nota al salir de sesión</h3><span class="small muted">1 a 2 minutos</span></div>' +
    '<p class="small muted">Escribe o pega la transcripción de tu nota de voz, como si se la dijeras a tu asistente: "Ana, trabajamos ansiedad por el trabajo, le dejé el diario de emociones, revisar en dos semanas lo de su mamá".</p>' +
    field('Fecha y hora de la sesión', inputF('noteTs.' + p.id, { type: 'datetime-local', value: '' })) +
    textareaF('note.' + p.id, { rows: 6, placeholder: 'Lo que trabajaron, la tarea que dejaste y lo que hay que revisar', attrs: 'data-submit="structure-note" data-submit-arg="' + esc(p.id) + '"' }) +
    (S.ui.busy[key] ? thinking('La asistente está ordenando tu nota…', key) : '') +
    '<div class="row">' + (AI.available() ? busyBtn('Convertir en expediente', 'structure-note', p.id, 'btn-primary', key, 'Ordenando…') : '') + btn('Guardar nota sin IA', 'save-note-plain', p.id, AI.available() ? 'btn-ghost' : 'btn-primary') + '</div></section>';
  if (draft) {
    const dk = (x) => 'nd.' + p.id + '.' + x;
    html += '<section class="card stack"><div class="card-head"><h3>Revisa antes de guardar</h3><span class="small muted">nada se guarda sin tu clic</span></div>' +
      (draft.resumen ? field('Resumen para el expediente', textareaF(dk('res'), { value: draft.resumen, rows: 3 })) : '') +
      (draft.tareas.length ? '<div><span class="label">Tareas nuevas</span><div class="stack" style="gap:6px;margin-top:6px">' + draft.tareas.map((t, i) => checkF(dk('t' + i), esc(t), true)).join('') + '</div></div>' : '') +
      (draft.tecnicas.length ? '<div><span class="label">Técnicas sugeridas para aprobar</span><div class="stack" style="gap:6px;margin-top:6px">' + draft.tecnicas.map((id) => checkF(dk('k' + id), esc(techById(id)?.nombre || id) + ((p.tecnicas || []).includes(id) ? ' <span class="small muted">(ya aprobada)</span>' : ''), true)).join('') + '</div></div>' : '') +
      (draft.temas.length ? '<p class="small"><span class="label">Temas</span><br>' + draft.temas.map((t) => '<span class="tag">' + esc(t) + '</span>').join(' ') + '</p>' : '') +
      (draft.pendientes.length ? '<p class="small"><span class="label">Pendientes</span><br>' + draft.pendientes.map((t) => esc(t)).join('<br>') + (draft.revisarEnDias ? ' <span class="tag accent">revisar en ' + esc(draft.revisarEnDias) + ' días</span>' : '') + '</p>' : '') +
      (draft.aviso ? '<p class="small" style="color:var(--risk)"><strong>' + esc(draft.aviso) + '</strong></p>' : '') +
      field('Seguimiento en', selectF(dk('fu'), dayOptions(draft.seguimientoEnDias || p.seguimiento?.cadaDias || 3), String(draft.seguimientoEnDias || p.seguimiento?.cadaDias || 3))) +
      (draft.mensaje ? field('Resumen para enviar al paciente', textareaF(dk('msg'), { value: draft.mensaje, rows: 4 })) : '') +
      '<div class="row">' + btn('Guardar en expediente', 'save-note', p.id, 'btn-primary') + btn('Descartar', 'discard-note', p.id, 'btn-ghost') + '</div></section>';
  } else {
    html += '<section class="card stack"><div class="card-head"><h3>Notas anteriores</h3></div>' + (notes.length ? '<ul class="list">' + notes.slice(0, 8).map((n) =>
      '<li><div><strong>' + esc(fmtWhen(n.fechaSesion || n.ts)) + '</strong><br><span class="small">' + esc(clip((n.estructura && n.estructura.resumen) || n.texto, 260)) + '</span></div></li>').join('') + '</ul>' : '<p class="muted small">Aún no hay notas de sesión.</p>') + '</section>';
  }
  return html + '</div>';
}

/* Resumen */
function tabResumen(p) {
  const key = 'sum:' + p.id;
  const streaming = S.ui.stream[key];
  const saved = p.ultimoResumen;
  const evs = eventsSinceLastSession(p);
  const closeKey = 'out:' + p.id;
  return '<div class="grid-2"><section class="card stack"><div class="card-head"><h3>Resumen antes de la sesión</h3><span class="small muted">' + (p.ultimaSesion ? 'desde ' + esc(relTime(p.ultimaSesion)) : 'últimos 14 días') + '</span></div>' +
    (S.ui.busy[key] ? (streaming ? '<p class="summary-text">' + esc(streaming) + '</p>' : '') + thinking('La asistente está leyendo la semana…', key)
      : saved && saved.texto ? '<p class="summary-text">' + esc(saved.texto) + '</p><p class="small faint">Redactado ' + esc(relTime(saved.ts)) + (saved.fuente === 'ia' ? ' por la asistente' : ' automáticamente') + '</p>'
        : '<p class="summary-text">' + esc(deterministicSummary(p)) + '</p><p class="small faint">Conteo automático, sin IA.</p>') +
    '<div class="row">' + (AI.available() ? busyBtn(saved ? 'Actualizar resumen' : 'Redactar resumen con IA', 'gen-summary', p.id, 'btn-primary', key, 'Redactando…') : '') + '</div>' +
    '<hr class="divider"><div><span class="label">Conteo automático</span><p class="small">' + esc(deterministicSummary(p)) + '</p></div></section>' +
    '<section class="card stack"><div class="card-head"><h3>Actividad desde la última sesión</h3></div>' +
    (evs.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Cuándo</th><th>Qué</th><th>Nivel</th></tr></thead><tbody>' + evs.map((e) =>
      '<tr><td class="num">' + esc(fmtWhen(e.ts)) + '</td><td>' + esc(e.tipo === 'entrada' ? clip(e.texto, 70) : e.tipo === 'salida' ? (SALIDA_LABEL[e.tipoSalida] || 'Mensaje') + ' enviado' : e.tipo === 'alerta' ? 'Alerta' : 'Evento') + '</td><td>' + (e.tipo === 'entrada' || e.tipo === 'alerta' ? lvlChip(e.nivel) : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted small">Sin actividad registrada.</p>') +
    '<hr class="divider"><div class="stack"><span class="label">Al cerrar un ciclo de terapia</span><p class="small muted">La asistente redacta un resumen del proceso para el paciente: lo que aprendió y las herramientas que le funcionaron.</p>' +
    '<div class="row">' + (AI.available() ? busyBtn('Redactar cierre de ciclo', 'compose-template', p.id + '|cierre', '', closeKey, 'Redactando…') : '<span class="small muted">Requiere la IA.</span>') + '</div></div></section></div>';
}

/* ---------- Protocolo de crisis ---------- */
function viewProtocolo() {
  const s = settings();
  const x = Number(s.minutosEscalamiento) || 10;
  const history = allEvents().filter((e) => e.tipo === 'alerta').slice().reverse();
  return '<div class="view-head"><div><h1>Protocolo de crisis</h1><p class="sub">Ante un riesgo alto, siempre responde un humano. La IA nunca maneja sola un riesgo alto: acompaña con un guion acotado mientras llegas tú.</p></div></div>' +
    '<section class="card stack" aria-label="Diagrama del protocolo"><div class="card-head"><h2>Protocolo de escalamiento · 3 niveles</h2></div>' +
    '<div class="flow"><div class="flow-center flow-node"><b>Paciente escribe por WhatsApp</b>Tú lo registras en el panel</div><div class="flow-arrow">↓</div>' +
    '<div class="flow-center flow-node"><b>La IA clasifica el nivel</b>y la red de seguridad revisa palabras clave</div><div class="flow-arrow">↓</div>' +
    '<div class="flow-row">' +
    '<div class="stack" style="gap:6px"><div class="flow-node ok"><b>Día normal</b>dudas, tareas, recursos</div><div class="flow-arrow">↓</div><div class="flow-node">Responde con el plan de la psicóloga</div><div class="flow-arrow">↓</div><div class="flow-node">Resumen en el panel antes de la sesión</div></div>' +
    '<div class="stack" style="gap:6px"><div class="flow-node warn"><b>Malestar intenso</b>ansiedad, pánico, llanto</div><div class="flow-arrow">↓</div><div class="flow-node">Guía con las técnicas del plan del paciente</div><div class="flow-arrow">↓</div><div class="flow-node"><b>¿Bajó la intensidad?</b>sí: queda en el resumen · no: aviso para responder pronto</div></div>' +
    '<div class="stack" style="gap:6px"><div class="flow-node risk"><b>Riesgo alto</b>plan, intención o medios</div><div class="flow-arrow">↓</div><div class="flow-node"><b>Aviso inmediato a la psicóloga</b>alerta y sonido en el panel</div><div class="flow-arrow">↓ sin respuesta en ' + x + ' min</div><div class="flow-node">Psicólogo de guardia (fase 3)</div><div class="flow-arrow">↓ sin respuesta</div><div class="flow-node risk">Contacto de emergencia y línea de crisis</div></div>' +
    '</div></div>' +
    '<p class="small muted">En el piloto la alerta aparece en este panel y suena si está abierto. En la fase 2 el aviso será una llamada automática que despierta, no un mensaje que se pierde.</p></section>' +
    '<div class="grid-2"><section class="card stack"><div class="card-head"><h3>Tiempos y contactos</h3></div><div class="form-grid">' +
    field('Minutos para escalar (X)', inputF('pr.min', { type: 'number', value: x, attrs: 'min="1" max="120"' }), 'por decidir con criterio clínico') +
    field('Emergencias', inputF('pr.em', { value: s.emergencias })) + '</div>' +
    field('Línea de crisis', inputF('pr.linea', { value: s.lineaCrisis })) +
    field('Horario en que respondes', inputF('pr.horario', { value: s.horario })) +
    checkF('pr.sonido', 'Sonar al detectar riesgo alto (con el panel abierto)', !!s.sonidoAlerta) +
    '<div class="row">' + btn('Guardar', 'save-protocol', '', 'btn-primary') + btn('Probar sonido', 'test-sound', '', 'btn-ghost') + '</div></section>' +
    '<section class="card stack"><div class="card-head"><h3>Reglas que no cambian</h3></div><ul class="list">' +
    ['La IA nunca diagnostica ni cambia el tratamiento: solo ejecuta lo que aprobaste.',
      'Palabras de ideación suicida, autolesión, medios, plan o violencia activan riesgo alto aunque la IA diga otra cosa.',
      'Si la IA falla, el mensaje se clasifica con la red de seguridad y te pide revisar el nivel.',
      'Cada respuesta la redacta la IA y tú la apruebas antes de enviarla.',
      'El paciente conoce las reglas desde el inicio: quién responde, cuándo y qué pasa si nadie contesta (va en el mensaje de bienvenida).'].map((t) => '<li><div>' + esc(t) + '</div></li>').join('') + '</ul></section></div>' +
    '<section class="card stack"><div class="card-head"><h3>Historial de alertas</h3><span class="small muted">' + plural(history.length, 'alerta', 'alertas') + '</span></div>' +
    (history.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Paciente</th><th>Nivel</th><th>Detectada</th><th>Atendida en</th><th>Resultado</th><th>Escaló</th></tr></thead><tbody>' + history.map((a) => {
      const mins = a.ackEn ? Math.round((new Date(a.ackEn) - new Date(a.ts)) / 60000) : null;
      return '<tr><td>' + esc(patientByIdAny(a.pid)?.alias || '—') + '</td><td>' + lvlChip(a.nivel) + '</td><td class="num">' + esc(fmtWhen(a.ts)) + '</td><td class="n">' + (mins != null ? mins + ' min' : a.estado === 'cerrada' ? '—' : 'pendiente') + '</td><td>' + esc(ALERT_OUTCOME[a.resultado] || (a.estado === 'cerrada' ? 'cerrada' : 'activa')) + '</td><td>' + (a.escaladaEn ? 'sí' : 'no') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="muted small">Sin alertas. Así debe verse casi siempre.</p>') + '</section>';
}

/* ---------- Biblioteca ---------- */
function viewBiblioteca() {
  const s = settings();
  const count = (id) => patients().filter((p) => (p.tecnicas || []).includes(id)).length;
  const own = new Set((s.tecnicasPropias || []).map((t) => t.id));
  return '<div class="view-head"><div><h1>Biblioteca</h1><p class="sub">Técnicas por situación y recursos curados. La IA sugiere solo lo que está aquí y tú apruebas con un clic qué recibe cada paciente.</p></div></div>' +
    '<div class="grid-2"><section class="card stack"><div class="card-head"><h2>Técnicas por situación</h2></div>' +
    Object.keys(SITUACIONES).map((sit) => {
      const list = allTechniques().filter((t) => t.situacion === sit);
      if (!list.length) return '';
      return '<div><span class="label">' + esc(SITUACIONES[sit]) + '</span><ul class="list" style="margin-top:6px">' + list.map((t) =>
        '<li><div><strong>' + esc(t.nombre) + '</strong> <span class="small muted">· ' + plural(count(t.id), 'paciente', 'pacientes') + '</span><br><span class="small">' + esc(t.pasos) + '</span></div>' +
        (own.has(t.id) ? btn('Quitar', 'remove-tech', t.id, 'btn-ghost btn-sm') : '') + '</li>').join('') + '</ul></div>';
    }).join('') +
    '<hr class="divider"><h3>Agregar técnica propia</h3><div class="form-grid">' + field('Nombre', inputF('bt.nombre')) + field('Situación', selectF('bt.sit', Object.entries(SITUACIONES), 'ansiedad')) + '</div>' +
    field('Pasos, como los leerá el paciente', textareaF('bt.pasos', { rows: 3 })) + '<div class="row">' + btn('Agregar técnica', 'add-tech', '', 'btn-primary') + '</div></section>' +
    '<section class="card stack"><div class="card-head"><h2>Recursos curados</h2><span class="small muted">libros, lecturas, audios</span></div>' +
    '<p class="small muted">Si un paciente pregunta "¿tienes un libro sobre este tema?", la asistente responde solo con esta lista, nunca con recomendaciones abiertas de internet.</p>' +
    ((s.recursos || []).length ? '<ul class="list">' + s.recursos.map((r) => '<li><div><strong>' + esc(r.titulo) + '</strong>' + (r.autor ? ' <span class="small muted">· ' + esc(r.autor) + '</span>' : '') + (r.tema ? '<br><span class="tag">' + esc(r.tema) + '</span>' : '') + '</div>' + btn('Quitar', 'remove-resource', r.id, 'btn-ghost btn-sm') + '</li>').join('') + '</ul>' : '<div class="empty small">Aún no hay recursos. Agrega los que recomiendas en consulta.</div>') +
    '<hr class="divider"><h3>Agregar recurso</h3><div class="form-grid">' + field('Título', inputF('br.titulo')) + field('Autor', inputF('br.autor')) + field('Tema', inputF('br.tema', { placeholder: 'apego, duelo, ansiedad…' })) + '</div>' +
    '<div class="row">' + btn('Agregar recurso', 'add-resource', '', 'btn-primary') + '</div></section></div>';
}

/* ---------- Piloto ---------- */
function viewPiloto() {
  const weeks = pilotWeeks();
  const cur = clamp(Number(S.ui.week) || currentWeekN(), 1, weeks.length);
  const week = weeks[cur - 1];
  const rows = weekMetrics(week);
  const mins = minutesByDay();
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.from, i));
  const dayVals = days.map((d) => Math.round(mins[dayKey(d)] || 0));
  const goal = Number(settings().metaMinutos) || 15;
  const activeDays = dayVals.filter((v) => v > 0);
  const avg = activeDays.length ? Math.round(activeDays.reduce((a, b) => a + b, 0) / activeDays.length) : 0;
  const withSpont = rows.filter((r) => r.espontaneos > 0).length;
  const crit1 = rows.length ? withSpont >= Math.ceil(rows.length / 2) : null;
  const crit2 = activeDays.length ? avg < goal : null;
  const fupsSent = rows.reduce((a, r) => a + r.seguimientos, 0);
  const fupsAns = rows.reduce((a, r) => a + r.respondidos, 0);
  const q = qualityTotals();
  const mark = (v) => '<span class="mark ' + (v === null ? 'na' : v ? 'yes' : 'no') + '" aria-label="' + (v === null ? 'sin datos' : v ? 'se cumple' : 'no se cumple') + '">' + (v === null ? '–' : v ? '✓' : '!') + '</span>';
  return '<div class="view-head"><div><h1>Piloto de 4 semanas</h1><p class="sub">Probar el concepto con tus pacientes antes de programar nada: la IA redacta y tú apruebas cada mensaje. Esta hoja es el prototipo del panel.</p></div>' +
    '<div class="seg-scroll"><div class="seg" role="group" aria-label="Semana">' + weeks.map((w) => '<button type="button" data-act="set-week" data-arg="' + w.n + '" aria-pressed="' + (w.n === cur) + '">Semana ' + w.n + '</button>').join('') + '</div></div></div>' +
    '<section class="card"><div class="card-head"><h2>Criterio de éxito</h2><span class="small muted">' + esc(fmtDate.format(week.from)) + ' – ' + esc(fmtDate.format(addDays(week.to, -1))) + '</span></div>' +
    '<div class="criterion">' + mark(crit1) + '<div><strong>Los pacientes escriben entre sesiones sin que se les insista</strong><p class="small muted">' + withSpont + ' de ' + rows.length + ' pacientes escribieron por iniciativa propia esta semana (sin un seguimiento en las 48 h previas).</p></div></div>' +
    '<div class="criterion">' + mark(crit2) + '<div><strong>A ' + esc(psiName()) + ' le toma menos de ' + goal + ' minutos al día</strong><p class="small muted">Promedio ' + avg + ' min en los días con actividad (tiempo activo en el panel; no incluye copiar y pegar en WhatsApp).</p></div></div></section>' +
    '<section class="card stack"><div class="card-head"><h2>Qué medimos</h2></div><div class="table-wrap"><table class="t"><thead><tr><th>Paciente</th><th>Mensajes</th><th>Espontáneos</th><th style="min-width:220px">Horario</th><th>Seguimientos respondidos</th><th>Tareas</th><th>¿Usa ChatGPT?</th><th>Valoración</th></tr></thead><tbody>' +
    (rows.length ? rows.map((r) => {
      const max = Math.max(1, ...r.hours);
      return '<tr><td><strong>' + esc(r.p.alias) + '</strong> ' + exampleTag(r.p) + '</td><td class="n">' + r.mensajes + '</td><td class="n">' + r.espontaneos + '</td><td><div class="hours" aria-label="Mensajes por hora">' + r.hours.map((h, i) => '<i title="' + i + ':00 · ' + h + '" style="opacity:' + (h ? (0.25 + 0.75 * h / max).toFixed(2) : 0.07) + '"></i>').join('') + '</div><div class="hours-axis"><span>0 h</span><span>12 h</span><span>23 h</span></div></td>' +
        '<td class="n">' + (r.seguimientos ? r.respondidos + ' de ' + r.seguimientos : '—') + '</td><td class="n">' + (r.tareasTotal ? r.tareasHechas + ' de ' + r.tareasTotal : '—') + '</td><td>' + esc({ no: 'No', a_veces: 'A veces', si: 'Sí', dejo: 'Dejó de usarla', '': 'Sin preguntar' }[r.chatGPT] || 'Sin preguntar') + '</td><td class="n">' + (r.valoracion ? esc(r.valoracion) + ' / 5' : '—') + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="muted">Sin pacientes.</td></tr>') + '</tbody></table></div>' +
    '<p class="small muted">Tasa de respuesta a seguimientos: ' + (fupsSent ? Math.round(100 * fupsAns / fupsSent) + '% (' + fupsAns + ' de ' + fupsSent + ')' : 'sin seguimientos esta semana') + '. "¿Usa ChatGPT?" y la valoración se registran en el Plan de cada paciente.</p></section>' +
    '<div class="grid-2"><section class="card stack"><div class="card-head"><h3>Minutos al día que inviertes</h3><span class="small muted">meta: menos de ' + goal + '</span></div>' + minutesChart(days, dayVals, goal) + '</section>' +
    '<section class="card stack"><div class="card-head"><h3>Calidad de la asistente</h3><span class="small muted">todas tus sesiones</span></div>' +
    '<dl class="kv"><dt>Borradores redactados</dt><dd class="num">' + q.generados + '</dd><dt>Aprobados sin cambios</dt><dd class="num">' + q.sinCambios + pct(q.sinCambios, q.aprobados) + '</dd><dt>Aprobados con edición</dt><dd class="num">' + q.editados + pct(q.editados, q.aprobados) + '</dd><dt>Descartados</dt><dd class="num">' + q.descartados + '</dd><dt>Niveles que corregiste</dt><dd class="num">' + q.ajustes + '</dd><dt>Fallas de la IA</dt><dd class="num">' + q.fallas + ' de ' + q.llamadas + ' llamadas</dd><dt>Tiempo promedio de la IA</dt><dd class="num">' + (q.llamadas ? (q.ms / Math.max(1, q.llamadas) / 1000).toFixed(1) + ' s' : '—') + '</dd></dl>' +
    field('Tu valoración del piloto (1 a 5)', selectF('pi.val', [['', 'Sin valorar'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], settings().valoracionPsicologa == null ? '' : String(settings().valoracionPsicologa), 'data-change="save-psi-rating"')) +
    '</section></div>';
}
function pct(a, b) { return b ? ' <span class="small muted">(' + Math.round(100 * a / b) + '%)</span>' : ''; }
function minutesChart(days, vals, goal) {
  const W = 420, H = 180, pl = 30, pr = 8, pt = 12, pb = 26;
  const max = Math.max(goal * 1.4, ...vals, 1);
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W - pl - pr) / days.length;
  const ticks = [0, Math.round(goal / 2), goal, Math.round(max)].filter((v, i, a) => a.indexOf(v) === i && v <= max);
  return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Minutos por día; meta ' + goal + ' minutos">' +
    ticks.map((t) => '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text x="' + (pl - 6) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + t + '</text>').join('') +
    vals.map((v, i) => {
      const x = pl + i * bw + bw * 0.18, w = bw * 0.64, top = y(v);
      return '<rect class="bar' + (v > goal ? ' over' : '') + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0, H - pb - top).toFixed(1) + '" rx="2"><title>' + esc(fmtDate.format(days[i])) + ': ' + v + ' min</title></rect>' +
        (v ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (top - 4).toFixed(1) + '" text-anchor="middle">' + v + '</text>' : '') +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(WEEKDAYS_SHORT[days[i].getDay()]) + '</text>';
    }).join('') +
    '<line class="goal" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(goal).toFixed(1) + '" y2="' + y(goal).toFixed(1) + '"/></svg>';
}
/* Sesiones con telemetría: las guardadas de esta persona más la actual (en memoria, más reciente). */
function sessionsForStats() {
  const list = S.sessions.filter((s) => s && s.sessionId !== SESSION_ID);
  return Telemetry.data ? list.concat([Telemetry.data]) : list;
}
/* realOnly: ignora contadores de modo ejemplo (prefijo "ejemplo."). En modo ejemplo la vista muestra los de ejemplo. */
function qualityTotals(realOnly) {
  const pre = !realOnly && S.mode === 'ejemplo' ? 'ejemplo.' : '';
  const t = { generados: 0, sinCambios: 0, editados: 0, descartados: 0, ajustes: 0, llamadas: 0, fallas: 0, ms: 0, aprobados: 0 };
  for (const s of sessionsForStats()) {
    const c = s.counts || {};
    t.generados += c[pre + 'borradores_generados'] || 0;
    t.sinCambios += c[pre + 'aprobados_sin_cambios'] || 0;
    t.editados += c[pre + 'aprobados_editados'] || 0;
    t.descartados += c[pre + 'borradores_descartados'] || 0;
    t.ajustes += c[pre + 'niveles_ajustados'] || 0;
    if (pre) { t.llamadas += c['ejemplo.ia_llamadas'] || 0; continue; }
    t.llamadas += (s.ai && s.ai.calls) || 0;
    t.fallas += (s.ai && s.ai.fails) || 0;
    t.ms += (s.ai && s.ai.totalMs) || 0;
  }
  t.aprobados = t.sinCambios + t.editados;
  return t;
}

/* ---------- Registro de errores ---------- */
function viewRegistro() {
  const all = ErrorLog.all();
  const f = S.ui.logFilter;
  const q = fold(f.q);
  const list = all.filter((e) => (f.sev === 'todas' || e.severity === f.sev) && (f.cat === 'todas' || e.category === f.cat) &&
    (f.estado === 'todos' || (f.estado === 'abierto' ? e.status !== 'resuelto' : e.status === 'resuelto')) &&
    (!q || fold([e.message, e.code, e.module, e.note].join(' ')).includes(q)));
  const open = all.filter((e) => e.status !== 'resuelto');
  const bySev = (s) => open.filter((e) => e.severity === s && e.mode !== 'ejemplo').length;
  const unsynced = ErrorLog.pendingCount();
  const syncLine = ErrorLog.remoteOk && ErrorLog.noCreate
    ? 'La base compartida está llena: las entradas nuevas solo quedan en este navegador (' + unsynced + ' pendientes). Usa "Copiar reporte" o "Descargar JSON" y pide liberar espacio.'
    : ErrorLog.remoteOk
    ? 'Se guarda en el registro compartido de este artefacto' + (ErrorLog.remoteLoaded ? '' : ' (cargando…)') + (unsynced ? ' · ' + unsynced + ' por sincronizar' : '') + '. Claude puede leerlo para optimizar la herramienta.'
    : 'Solo en este navegador: ' + ErrorLog.remoteReason + '. Usa "Copiar reporte" o "Descargar" para enviarlo.';
  const sevOpts = [['todas', 'Todas las severidades']].concat(Object.keys(SEV_LABEL).map((k) => [k, SEV_LABEL[k]]));
  const catOpts = [['todas', 'Todas las categorías']].concat(Object.keys(CAT_LABEL).map((k) => [k, CAT_LABEL[k]]));
  return '<div class="view-head"><div><h1>Registro de errores</h1><p class="sub">Todo lo que falla, y cada vez que la IA se equivoca o tú corriges su trabajo, queda aquí para mejorar la herramienta después del piloto. No guarda textos de pacientes ni teléfonos.</p></div>' +
    '<div class="row">' + btn('Reportar un problema', 'open-report', '', 'btn-primary') + btn('Copiar reporte', 'copy-report', '') + (S.caps.downloads ? btn('Descargar JSON', 'download-log', '') : '') + '</div></div>' +
    '<div class="banner ' + (ErrorLog.remoteOk && !ErrorLog.noCreate ? 'info' : 'warn') + '"><p class="small">' + esc(syncLine) + '</p></div>' +
    '<div class="today-strip">' + stat(bySev('critica'), 'críticas abiertas', bySev('critica') ? 'risk' : '') + stat(bySev('alta'), 'altas abiertas', bySev('alta') ? 'warn' : '') + stat(bySev('media'), 'medias abiertas') + stat(bySev('baja'), 'bajas abiertas') + '</div>' +
    '<section class="card stack"><div class="row">' +
    selectF('lf.sev', sevOpts, f.sev, 'data-change="log-filter" data-arg="sev" style="width:auto" aria-label="Severidad"') +
    selectF('lf.cat', catOpts, f.cat, 'data-change="log-filter" data-arg="cat" style="width:auto" aria-label="Categoría"') +
    selectF('lf.estado', [['abierto', 'Abiertos'], ['resuelto', 'Resueltos'], ['todos', 'Todos']], f.estado, 'data-change="log-filter" data-arg="estado" style="width:auto" aria-label="Estado"') +
    inputF('lf.q', { placeholder: 'Buscar', value: f.q, attrs: 'data-live-filter="q" style="width:auto;flex:1;min-width:160px" aria-label="Buscar en el registro"' }) + '</div>' +
    '<div class="log-list">' + (list.length ? list.slice(0, 200).map(logRow).join('') : '<div class="empty small">' + (all.length ? 'Nada coincide con el filtro.' : 'Sin errores registrados. Si algo se comporta raro, usa "Reportar un problema".') + '</div>') + '</div>' +
    (list.length > 200 ? '<p class="small muted">Se muestran 200 de ' + list.length + '. Usa los filtros o descarga el JSON para verlos todos.</p>' : '') + '</section>' +
    '<section class="card stack"><div class="card-head"><h3>Análisis con Claude</h3><span class="small muted">usa tu cuenta de Claude</span></div>' +
    '<p class="small muted">Claude lee el reporte (sin datos de pacientes) y propone qué optimizar primero.</p>' +
    (S.ui.busy['analisis'] ? (S.ui.analysis ? '<div class="report-out">' + esc(S.ui.analysis) + '</div>' : '') + thinking('Claude está leyendo el registro…', 'analisis') : S.ui.analysis ? '<div class="report-out">' + esc(S.ui.analysis) + '</div>' : '') +
    '<div class="row">' + (AI.available() ? busyBtn('Analizar el registro', 'analyze-log', '', '', 'analisis', 'Analizando…') : '<span class="small muted">La IA no está disponible en esta vista.</span>') + '</div></section>' +
    diagnosticsCard();
}
function logRow(e) {
  const id = 'log.' + e.id;
  const det = { categoria: CAT_LABEL[e.category] || e.category, modulo: MOD_LABEL[e.module] || e.module, codigo: e.code, veces: e.count, motivos: e.motivos || undefined, primeraVez: e.firstSeen, ultimaVez: e.lastSeen, reabierto: e.vecesReabierto || undefined, resuelto: e.resolvedAt || undefined, sesion: e.sessionId, modo: e.mode, version: e.appVersion, red: e.riskVersion || undefined, entorno: e.env, detalle: e.detail };
  return '<details class="log-row ' + esc(e.severity) + (e.status === 'resuelto' ? ' resuelto' : '') + '" id="' + esc(idSafe(id)) + '" data-open-key="' + esc(id) + '"' + (S.ui.open[id] ? ' open' : '') + '>' +
    '<summary><div class="stack" style="gap:2px;min-width:0"><div class="row"><span class="sev sev-' + esc(e.severity) + '">' + esc(SEV_LABEL[e.severity] || e.severity) + '</span><span class="small muted">' + esc(CAT_LABEL[e.category] || e.category) + ' · ' + esc(MOD_LABEL[e.module] || e.module) + '</span>' + (e.status === 'resuelto' ? '<span class="tag">resuelto</span>' : '') + (e.mode === 'ejemplo' ? '<span class="example-tag">ejemplo</span>' : '') + (e.vecesReabierto ? '<span class="tag">reabierto</span>' : '') + (!e.synced ? '<span class="tag">sin sincronizar</span>' : '') + '</div>' +
    '<div class="msgline">' + esc(e.message || e.code) + '</div><div class="times">' + esc(e.code) + ' · ×' + esc(e.count) + '</div></div><div class="when">' + esc(relTime(e.lastSeen)) + '</div></summary>' +
    '<div class="log-detail">' + (e.note ? '<p class="small"><span class="label">Nota</span><br>' + esc(e.note) + '</p>' : '') + '<pre>' + esc(safeJson(det)) + '</pre>' +
    '<div class="row">' + (e.status === 'resuelto' ? btn('Reabrir', 'log-status', e.id + '|abierto', 'btn-sm') : btn('Marcar resuelto', 'log-status', e.id + '|resuelto', 'btn-sm')) + '</div></div></details>';
}
function diagnosticsCard() {
  const st = S.status;
  const rows = [
    ['Versión', 'v' + APP_VERSION], ['Sesión', SESSION_ID], ['Modo', S.mode === 'real' ? 'tus datos' : S.mode],
    ['Base de datos', { ok: 'conectada', no: 'no disponible', solo_lectura: 'solo lectura', sin_identidad: 'sin identidad (no se puede guardar)', cargando: 'conectando' }[st.db] || st.db],
    ['IA', { ok: 'disponible', cargando: 'sin usar todavía', denegado: 'sin permiso', no: 'no disponible', limitado: 'límite alcanzado' }[st.ai] || st.ai],
    ['Registro compartido', ErrorLog.stateLabel()],
    ['Motor de dibujo', st.morph === 'ok' ? 'morphdom' : 'respaldo (innerHTML)'],
    ['Descargas', S.caps.downloads ? 'disponibles' : 'no disponibles'],
    ['Navegador', (envInfo().navegador + ' · ' + envInfo().sistema + ' · ' + envInfo().pantalla)]
  ];
  return '<section class="card"><div class="card-head"><h3>Diagnóstico</h3></div><dl class="kv">' + rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd class="mono">' + esc(v) + '</dd>').join('') + '</dl></section>';
}

/* ---------- Ajustes ---------- */
function viewAjustes() {
  const s = settings();
  return '<div class="view-head"><div><h1>Ajustes</h1><p class="sub">Cómo te presentas, cómo se mide el piloto y dónde viven tus datos.</p></div></div>' +
    '<div class="grid-2"><section class="card stack"><div class="card-head"><h3>Tu perfil</h3></div>' +
    field('Tu nombre, como lo verán tus pacientes', inputF('st.nombre', { value: s.psicologa, placeholder: 'Alexa' })) +
    field('Frase de bienvenida', textareaF('st.frase', { value: s.bienvenida, rows: 2 })) +
    field('Horario en que revisas', inputF('st.horario', { value: s.horario })) +
    '<div class="form-grid">' + field('Inicio del piloto', inputF('st.inicio', { type: 'date', value: s.inicioPiloto })) + field('Meta de minutos al día', inputF('st.meta', { type: 'number', value: s.metaMinutos, attrs: 'min="1" max="240"' })) + '</div>' +
    '<div class="row">' + btn('Guardar', 'save-settings', '', 'btn-primary') + '</div></section>' +
    '<section class="card stack"><div class="card-head"><h3>Tus datos</h3></div>' +
    '<p class="small">Tus pacientes, conversaciones y notas viven en tu espacio privado de este artefacto: solo tú los ves, ni siquiera el dueño del artefacto. El registro de errores y el tiempo de uso son compartidos y no contienen textos de pacientes.</p>' +
    '<p class="small muted">Usa alias o iniciales, no nombres completos. Las conversaciones nunca se usan para entrenar modelos de IA.</p>' +
    '<div class="row">' + (S.caps.downloads ? btn('Descargar mis datos (JSON)', 'export-data', '') : '<span class="small muted">Las descargas no están disponibles en esta vista.</span>') + '</div>' +
    '<hr class="divider"><div class="row">' + (S.mode === 'ejemplo' ? (S.caps.db && S.status.uid ? btn('Volver a mis datos', 'exit-demo', '', 'btn-primary') : '<span class="small muted">Sin base de datos en esta vista: solo modo ejemplo.</span>') : btn('Explorar con datos de ejemplo', 'explore-demo', '')) + '</div></section></div>' +
    diagnosticsCard();
}

/* ---------- Ventanas ---------- */
function renderModal() {
  const m = S.ui.modal;
  if (!m) return '';
  let inner = '';
  if (m.kind === 'new-patient') {
    inner = '<h2 id="modal-title">Agregar paciente</h2>' +
      '<p class="small muted">Para el piloto: adultos, sin riesgo alto y con consentimiento informado firmado. Usa un alias o iniciales.</p>' +
      '<div class="form-grid">' + field('Alias o iniciales', inputF('np.alias', { placeholder: 'Ana' })) +
      field('Día de sesión', selectF('np.dia', [['', 'Sin día fijo']].concat(WEEKDAYS.map((d, i) => [String(i), cap1(d)])), '1')) +
      field('Hora', inputF('np.hora', { type: 'time', value: '18:00' })) +
      field('Seguimiento cada', selectF('np.cada', [['3', '3 días'], ['4', '4 días']], '3')) +
      field('Tono', selectF('np.tono', [['cálido', 'Cálido'], ['directo', 'Directo'], ['breve', 'Breve']], 'cálido')) +
      field('Consentimiento firmado el', inputF('np.consentFecha', { type: 'date', value: dayKey() })) + '</div>' +
      checkF('np.adulto', 'Es mayor de 18 años') +
      checkF('np.consent', 'Firmó el consentimiento informado: qué se registra, quién lo lee, en cuánto tiempo se responde y qué pasa en una crisis') +
      checkF('np.riesgo', 'Tiene riesgo alto actual <strong>sin</strong> plan de seguridad activo') +
      (m.error ? '<p class="small" role="alert" style="color:var(--risk)">' + esc(m.error) + '</p>' : '') +
      '<div class="row">' + btn('Agregar', 'create-patient', '', 'btn-primary') + btn('Cancelar', 'close-modal', '', 'btn-ghost') + '</div>';
  } else if (m.kind === 'report') {
    inner = '<h2 id="modal-title">Reportar un problema</h2>' +
      '<p class="small muted">Describe qué hiciste, qué esperabas y qué pasó. No incluyas nombres ni mensajes de pacientes.</p>' +
      field('¿Qué pasó?', textareaF('rep.texto', { rows: 5, placeholder: 'Ej.: al aprobar el borrador no se copió el texto y tuve que escribirlo a mano.' })) +
      '<div class="form-grid">' + field('¿Dónde?', selectF('rep.mod', Object.entries(MOD_LABEL).filter(([k]) => !['telemetria', 'datos'].includes(k)), S.ui.reportModule || 'app')) +
      field('¿Qué tan grave?', selectF('rep.sev', [['baja', 'Molestia menor'], ['media', 'Me hizo perder tiempo'], ['alta', 'No pude hacer algo importante'], ['critica', 'Afecta la seguridad de un paciente']], 'media')) + '</div>' +
      (m.error ? '<p class="small" role="alert" style="color:var(--risk)">' + esc(m.error) + '</p>' : '') +
      '<div class="row">' + btn('Enviar al registro', 'submit-report', '', 'btn-primary') + btn('Cancelar', 'close-modal', '', 'btn-ghost') + '</div>';
  } else if (m.kind === 'copy') {
    inner = '<h2 id="modal-title">Copia este texto</h2><p class="small muted">El navegador no permitió copiar automáticamente. Selecciónalo y cópialo.</p>' +
      '<textarea class="input" id="copy-box" rows="10" readonly>' + esc(m.text) + '</textarea><div class="row">' + btn('Listo', 'close-modal', '', 'btn-primary') + '</div>';
  }
  return '<div class="modal-back" data-act="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' + inner + '</div></div>';
}


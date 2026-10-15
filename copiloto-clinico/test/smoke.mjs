import { open, flushed } from './harness.mjs';
const results = [];
const ok = (name, cond, extra = '') => results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : ''));

// 1) Real mode, empty store → onboarding → create patient → register risky message
{
  const { browser, page, errors } = await open({ mock: { ai: 'normal' } });
  await page.waitForSelector('text=Bienvenida a tu copiloto clínico', { timeout: 3000 }).catch(() => {});
  ok('onboarding shown', await page.isVisible('text=Bienvenida a tu copiloto clínico'));
  await page.fill('#f-ob_nombre', 'Alexa');
  await page.click('[data-act="save-onboarding"]');
  await page.waitForSelector('#modal-title', { timeout: 2000 });
  await page.fill('#f-np_alias', 'Ana');
  await page.check('#f-np_adulto'); await page.check('#f-np_consent');
  await page.click('[data-act="create-patient"]');
  await page.waitForTimeout(300);
  ok('patient created in store', await page.evaluate(() => [...window.__STORE.keys()].some((k) => k.includes('/clinic/patients/'))));
  await page.click('[data-act="ptab"][data-arg="conversacion"]');
  await page.waitForTimeout(150);
  const ta = await page.$('textarea[data-f^="in."]');
  await ta.fill('Ya no quiero vivir, tengo las pastillas');
  await page.click('[data-act="register-inbound"]');
  await page.waitForTimeout(800);
  await flushed(page);
  const st = await page.evaluate(() => {
    const evs = [...window.__STORE.entries()].filter(([k]) => k.includes('/clinic/events/')).map(([, v]) => v);
    const errs = [...window.__STORE.entries()].filter(([k]) => k.startsWith('errors/')).map(([, v]) => v);
    return { evs, errs };
  });
  const entrada = st.evs.find((e) => e.tipo === 'entrada');
  ok('entrada final nivel riesgo_alto despite AI normal', entrada && entrada.nivel === 'riesgo_alto', JSON.stringify(entrada && { nivel: entrada.nivel, nivelIA: entrada.nivelIA, nivelRed: entrada.nivelRed }));
  ok('alert created', st.evs.some((e) => e.tipo === 'alerta' && e.nivel === 'riesgo_alto'));
  ok('discrepancia_red_ia logged to shared errors', st.errs.some((e) => e.code === 'discrepancia_red_ia' && e.severity === 'alta'), st.errs.map((e) => e.code).join(','));
  ok('error log has no patient text', !JSON.stringify(st.errs).includes('pastillas'));
  // approve draft
  await page.click('[data-act="approve-draft"]');
  await page.waitForTimeout(300);
  const out = await page.evaluate(() => [...window.__STORE.values()].filter((v) => v.tipo === 'salida').length);
  ok('approved salida stored', out === 1);
  // error log view
  await page.click('[data-act="go"][data-arg="registro"]');
  await page.waitForTimeout(300);
  ok('registro shows discrepancy', await page.isVisible('text=discrepancia_red_ia'));
  await page.click('[data-act="copy-report"]');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok('report copied', clip.includes('# Registro de errores'), clip.slice(0, 60));
  // all views render without crash
  for (const v of ['hoy', 'pacientes', 'protocolo', 'biblioteca', 'piloto', 'registro', 'ajustes']) {
    await page.click('[data-act="go"][data-arg="' + v + '"]');
    await page.waitForTimeout(120);
    const crashed = await page.isVisible('text=Algo falló al mostrar esta sección');
    ok('view ' + v + ' renders', !crashed);
  }
  for (const t of ['conversacion', 'plan', 'nota', 'resumen']) {
    await page.click('[data-act="go"][data-arg="pacientes"]'); await page.waitForTimeout(80);
    await page.click('[data-act="ptab"][data-arg="' + t + '"]'); await page.waitForTimeout(120);
    ok('ptab ' + t + ' renders', !(await page.isVisible('text=Algo falló al mostrar esta sección')));
  }
  await flushed(page);
  const runtimeErrs = await page.evaluate(() => [...window.__STORE.values()].filter((v) => v.category === 'runtime').map((v) => v.message));
  ok('no runtime errors logged', runtimeErrs.length === 0, runtimeErrs.join(' | '));
  ok('no console/page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
}
// 2) No window.claude at all → example mode
{
  const { browser, page, errors } = await open({ withMock: false });
  await page.waitForTimeout(300);
  ok('demo banner without claude', await page.isVisible('text=Modo ejemplo.'));
  ok('demo patients listed on Hoy', await page.isVisible('text=Por responder'));
  for (const v of ['hoy', 'pacientes', 'protocolo', 'biblioteca', 'piloto', 'registro', 'ajustes']) {
    await page.click('[data-act="go"][data-arg="' + v + '"]'); await page.waitForTimeout(100);
    ok('demo view ' + v, !(await page.isVisible('text=Algo falló al mostrar esta sección')));
  }
  ok('no console/page errors (no claude)', errors.length === 0, errors.join(' | '));
  await browser.close();
}
// 3) AI failing → fallback classification logged
{
  const { browser, page, errors } = await open({ mock: { ai: 'fail' } });
  await page.click('[data-act="explore-demo"]');
  await page.waitForTimeout(100);
  await page.click('[data-act="go"][data-arg="pacientes"]');
  await page.waitForTimeout(100);
  await page.fill('textarea[data-f^="in."]', 'tengo un ataque de panico');
  await page.click('[data-act="register-inbound"]');
  await page.waitForTimeout(600);
  await flushed(page);
  const errs = await page.evaluate(() => [...window.__STORE.entries()].filter(([k]) => k.startsWith('errors/')).map(([, v]) => v.code));
  ok('ai failure logged', errs.includes('upstream_error'), errs.join(','));
  ok('fallback classification logged', errs.includes('clasificado_sin_ia_upstream_error'));
  ok('no console/page errors (ai fail)', errors.length === 0, errors.join(' | '));
  await browser.close();
}
console.log(results.join('\n'));

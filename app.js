"use strict";
const CFG = window.EFS_CONFIG || {};
const DEMO = new URLSearchParams(location.search).has("demo");
const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const NOMBRES = {sentadillas:"Sentadillas",saltosTijera:"Saltos de tijera",rodillasArriba:"Rodillas arriba",flexionPared:"Flexiones en pared",zancadas:"Zancadas",plancha:"Plancha"};
const nombreEj = k => NOMBRES[k] || (k ? k.replace(/-/g, " ") : "—");

// ---- Mismo login que la app (Credenciales.slug / correoInterno) ----
function slug(t) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
}
const normalizarCodigo = c => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
const correoInterno = (n, c) => `${slug(n)}.${normalizarCodigo(c).toLowerCase()}@${CFG.DOMINIO_CORREO || "efs.waldendos.mx"}`;

// ---- Cliente mínimo de Supabase (REST) ----
const configurado = () => CFG.SUPABASE_URL && !/TU-PROYECTO/.test(CFG.SUPABASE_URL) && CFG.SUPABASE_ANON_KEY && !/PEGA_AQUI/.test(CFG.SUPABASE_ANON_KEY);
let sesion = JSON.parse(sessionStorage.getItem("efs_sesion") || "null");
async function api(ruta, opts = {}) {
  const h = {apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json", ...(opts.headers || {})};
  if (sesion) h.Authorization = "Bearer " + sesion.access_token;
  const r = await fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + ruta, {...opts, headers: h});
  const txt = await r.text();
  if (!r.ok) throw new Error(traducir(r.status, txt));
  return txt ? JSON.parse(txt) : null;
}
function traducir(s, t) {
  if (/invalid login|invalid_grant/i.test(t)) return "Nombre, código o contraseña incorrectos.";
  if (s === 401 || /jwt expired/i.test(t)) { salir(); return "Tu sesión expiró, vuelve a entrar."; }
  if (s >= 500) return "El servidor no responde, intenta más tarde.";
  return "No se pudo completar la solicitud.";
}
async function entrar(nombre, codigo, pass) {
  sesion = await api("/auth/v1/token?grant_type=password", {method: "POST", body: JSON.stringify({email: correoInterno(nombre, codigo), password: pass})});
  sessionStorage.setItem("efs_sesion", JSON.stringify(sesion));
}
function salir() { sesion = null; sessionStorage.removeItem("efs_sesion"); }

// ---- Cálculos ----
const DIA = 86400000;
const diaLocal = d => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
function lunes(d) { const x = new Date(diaLocal(d)); const w = (x.getDay() + 6) % 7; return x.getTime() - w * DIA; }
function racha(ses) {
  const dias = new Set(ses.map(s => diaLocal(s.fecha)));
  let d = diaLocal(Date.now()); if (!dias.has(d)) d -= DIA;
  let n = 0; while (dias.has(d)) { n++; d -= DIA; } return n;
}
function porSemana(ses, n = 8) {
  const base = lunes(Date.now()), out = [];
  for (let i = n - 1; i >= 0; i--) { const ini = base - i * 7 * DIA; out.push({ini, n: ses.filter(s => { const t = +new Date(s.fecha); return t >= ini && t < ini + 7 * DIA; }).length}); }
  return out;
}
function records(ses) {
  const m = {};
  for (const s of ses) if (s.tipo === "ejercicio" && s.ejercicio) m[s.ejercicio] = Math.max(m[s.ejercicio] || 0, s.reps || 0);
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
const fechaCorta = t => new Date(t).toLocaleDateString("es-MX", {day: "numeric", month: "short"});
const minutos = ses => Math.round(ses.reduce((a, s) => a + (s.segundos || 0), 0) / 60);

// ---- Gráficas SVG ----
function barras(datos, color = "#2e9e6a") {
  const W = 460, H = 180, max = Math.max(1, ...datos.map(d => d.v)), bw = W / datos.length;
  return `<svg viewBox="0 0 ${W} ${H + 24}" width="100%" role="img">` + datos.map((d, i) => {
    const h = Math.round((d.v / max) * (H - 20)), x = i * bw + 6, y = H - h;
    return `<rect x="${x}" y="${y}" width="${bw - 12}" height="${h}" rx="6" fill="${color}"/>` +
      `<text x="${x + (bw - 12) / 2}" y="${y - 5}" font-size="12" text-anchor="middle" fill="#1d2433">${d.v}</text>` +
      `<text x="${x + (bw - 12) / 2}" y="${H + 16}" font-size="11" text-anchor="middle" fill="#6b7385">${esc(d.l)}</text>`;
  }).join("") + `</svg>`;
}
function linea(ses, ej) {
  const pts = ses.filter(s => s.ejercicio === ej).sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).slice(-15);
  if (pts.length < 2) return `<p class="nota">Aún no hay suficientes sesiones de ${esc(nombreEj(ej))}.</p>`;
  const W = 460, H = 170, max = Math.max(...pts.map(p => p.reps)) * 1.1, sx = (W - 30) / (pts.length - 1);
  const xy = pts.map((p, i) => [15 + i * sx, H - (p.reps / max) * (H - 20)]);
  return `<svg viewBox="0 0 ${W} ${H + 22}" width="100%"><polyline fill="none" stroke="#1b3a6b" stroke-width="3" points="${xy.map(p => p.join(",")).join(" ")}"/>` +
    xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#f08a24"/>`).join("") +
    `<text x="15" y="${H + 18}" font-size="11" fill="#6b7385">${fechaCorta(pts[0].fecha)}</text><text x="${W - 15}" y="${H + 18}" font-size="11" text-anchor="end" fill="#6b7385">${fechaCorta(pts.at(-1).fecha)}</text></svg>`;
}

// ---- Vistas ----
function vistaLogin(msg = "") {
  document.getElementById("usuario").innerHTML = "";
  $app.innerHTML = `<div class="card login"><h2>Entra a tu avance</h2>
  <p class="nota">Usa los mismos datos con los que te registraste en la app Jugamos y Convivimos.</p>
  <form id="f"><label>Nombre completo</label><input id="n" autocomplete="name" required>
  <label>Código de grupo</label><input id="c" autocapitalize="characters" required>
  <label>Contraseña</label><input id="p" type="password" autocomplete="current-password" required>
  <div class="err" id="e">${esc(msg)}</div><button style="width:100%">Entrar</button></form>
  ${configurado() ? "" : `<p class="nota">⚠️ El portal aún no está conectado al servidor. <a href="?demo=1">Ver demostración</a></p>`}
  <p class="nota">¿Olvidaste tu contraseña? Pídele a tu maestro que la restablezca.</p></div>`;
  document.getElementById("f").onsubmit = async ev => {
    ev.preventDefault(); const e = document.getElementById("e"); e.textContent = "Entrando…";
    try { await entrar(n.value, c.value, p.value); await inicio(); } catch (x) { e.textContent = x.message; }
  };
}
function barraUsuario(perfil) {
  document.getElementById("usuario").innerHTML = `<span>${esc(perfil.nombre)} · ${esc(perfil.grupo)}</span>` + (DEMO ? "" : `<button class="sec" id="salir">Salir</button>`);
  const b = document.getElementById("salir"); if (b) b.onclick = () => { salir(); vistaLogin(); };
}
function vistaAlumno(perfil, ses, volver) {
  const sem = porSemana(ses), rec = records(ses), esta = sem.at(-1).n;
  const top = rec[0]?.[0];
  $app.innerHTML = `${volver ? `<p><a href="#" id="volver">← Volver al grupo</a></p>` : ""}
  <h2 style="font-size:22px">${volver ? esc(perfil.nombre) : "¡Hola, " + esc(perfil.nombre.split(" ")[0]) + "!"}</h2>
  <div class="kpis"><div class="kpi"><b>🔥 ${racha(ses)}</b><span>días de racha</span></div>
  <div class="kpi"><b>${esta}</b><span>sesiones esta semana</span></div>
  <div class="kpi"><b>${ses.length}</b><span>sesiones en total</span></div>
  <div class="kpi"><b>${minutos(ses)}</b><span>minutos activos</span></div></div><br>
  <div class="grid2"><div class="card"><h2>Sesiones por semana</h2>${barras(sem.map(s => ({v: s.n, l: fechaCorta(s.ini)})))}</div>
  <div class="card"><h2>Progreso en ${esc(nombreEj(top))}</h2>${top ? linea(ses, top) : '<p class="nota">Sin registros todavía.</p>'}</div></div>
  <div class="grid2"><div class="card"><h2>🏆 Mis récords</h2>${rec.length ? `<table><tr><th>Ejercicio</th><th>Mejor marca</th></tr>${rec.map(([k, v]) => `<tr><td>${esc(nombreEj(k))}</td><td><b>${v}</b> reps</td></tr>`).join("")}</table>` : '<p class="nota">Aún no hay récords.</p>'}</div>
  <div class="card"><h2>Últimas sesiones</h2><table><tr><th>Fecha</th><th>Actividad</th><th>Reps</th></tr>${ses.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 8).map(s => `<tr><td>${fechaCorta(s.fecha)}</td><td>${esc(s.tipo === "talento" ? "Rutina " + nombreEj(s.rutina) : nombreEj(s.ejercicio))}</td><td>${s.reps || "—"}</td></tr>`).join("")}</table></div></div>`;
  if (volver) document.getElementById("volver").onclick = e => { e.preventDefault(); volver(); };
}
function vistaGrupo(perfil, grupos, gi, alumnos, ses) {
  const g = grupos[gi];
  const filas = alumnos.map(a => { const s = ses.filter(x => x.perfil_id === a.id); return {a, s, sem: porSemana(s, 1)[0].n, racha: racha(s), ult: s.reduce((m, x) => Math.max(m, +new Date(x.fecha)), 0)}; })
    .sort((x, y) => y.sem - x.sem || x.a.nombre.localeCompare(y.a.nombre));
  const activos = filas.filter(f => f.sem > 0).length;
  const promedio = alumnos.length ? (filas.reduce((a, f) => a + f.sem, 0) / alumnos.length).toFixed(1) : "0";
  const rec = records(ses).slice(0, 6);
  $app.innerHTML = `${grupos.length > 1 ? `<label>Grupo</label><select id="g">${grupos.map((x, i) => `<option value="${i}" ${i === gi ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}</select><br><br>` : ""}
  <h2 style="font-size:22px">Grupo ${esc(g.nombre)}</h2>
  <div class="kpis"><div class="kpi"><b>${alumnos.length}</b><span>${g.tipo === "talento" ? "participantes" : "alumnos"}</span></div>
  <div class="kpi"><b>${activos}</b><span>activos esta semana</span></div>
  <div class="kpi"><b>${promedio}</b><span>sesiones por alumno (semana)</span></div>
  <div class="kpi"><b>${ses.length}</b><span>sesiones registradas</span></div></div><br>
  <div class="grid2"><div class="card"><h2>Sesiones del grupo por semana</h2>${barras(porSemana(ses).map(s => ({v: s.n, l: fechaCorta(s.ini)})), "#1b3a6b")}</div>
  <div class="card"><h2>🏆 Récords del grupo</h2><table><tr><th>Ejercicio</th><th>Mejor</th><th>Quién</th></tr>${rec.map(([k, v]) => { const q = ses.find(s => s.ejercicio === k && s.reps === v); return `<tr><td>${esc(nombreEj(k))}</td><td><b>${v}</b></td><td>${esc(alumnos.find(a => a.id === q?.perfil_id)?.nombre || "")}</td></tr>`; }).join("")}</table></div></div>
  <div class="card"><h2>Alumnos</h2><p class="nota">Toca un nombre para ver su avance. Códigos para compartir — alumnos: <b>${esc(g.codigo_alumnos || "—")}</b>${g.codigo_maestros ? ` · maestros: <b>${esc(g.codigo_maestros)}</b>` : ""}</p>
  <table><tr><th>Nombre</th><th>Esta semana</th><th>Racha</th><th>Total</th><th>Última sesión</th></tr>
  ${filas.map((f, i) => `<tr class="clic" data-i="${i}"><td>${esc(f.a.nombre)}</td><td><span class="pill ${f.sem ? "" : "no"}">${f.sem}</span></td><td>🔥 ${f.racha}</td><td>${f.s.length}</td><td>${f.ult ? fechaCorta(f.ult) : "—"}</td></tr>`).join("")}</table></div>`;
  const sel = document.getElementById("g"); if (sel) sel.onchange = () => cargarGrupo(perfil, grupos, +sel.value);
  document.querySelectorAll("tr.clic").forEach(tr => tr.onclick = () => { const f = filas[+tr.dataset.i]; vistaAlumno({...f.a, grupo: g.nombre}, f.s, () => vistaGrupo(perfil, grupos, gi, alumnos, ses)); scrollTo(0, 0); });
}

// ---- Datos ----
async function cargarGrupo(perfil, grupos, gi) {
  if (DEMO) { const d = demoDatos(); return vistaGrupo(perfil, grupos, gi, d.alumnos, d.sesiones); }
  const g = grupos[gi];
  const alumnos = await api(`/rest/v1/perfiles?select=id,nombre,rol&grupo_id=eq.${g.id}&rol=neq.maestro&order=nombre`);
  const ids = alumnos.map(a => a.id);
  const ses = ids.length ? await api(`/rest/v1/sesiones?select=perfil_id,tipo,ejercicio,rutina,reps,segundos,fecha&perfil_id=in.(${ids.join(",")})&order=fecha.desc&limit=10000`) : [];
  vistaGrupo(perfil, grupos, gi, alumnos, ses);
}
async function inicio() {
  if (DEMO) {
    document.getElementById("demo").hidden = false;
    const d = demoDatos(), vista = new URLSearchParams(location.search).get("vista");
    if (vista === "alumno") { const p = {...d.alumnos[0], grupo: "5° A"}; barraUsuario(p); return vistaAlumno(p, d.sesiones.filter(s => s.perfil_id === p.id)); }
    const p = {nombre: "Mtra. Laura Gómez", grupo: "Maestra"}; barraUsuario(p);
    return vistaGrupo(p, [{nombre: "5° A", tipo: "alumnos", codigo_alumnos: "K7Q2MX"}], 0, d.alumnos, d.sesiones);
  }
  if (!configurado() || !sesion) return vistaLogin();
  $app.innerHTML = `<p class="nota">Cargando…</p>`;
  try {
    const [p] = await api(`/rest/v1/perfiles?select=id,nombre,rol,grupos(nombre)&id=eq.${sesion.user.id}`);
    if (!p) { salir(); return vistaLogin("Tu cuenta no tiene perfil. Regístrate desde la app."); }
    const perfil = {...p, grupo: p.grupos?.nombre || ""};
    barraUsuario(perfil);
    if (p.rol === "maestro") {
      const grupos = await api("/rest/v1/rpc/mis_grupos", {method: "POST", body: "{}"});
      return grupos.length ? cargarGrupo(perfil, grupos, 0) : ($app.innerHTML = `<div class="card">Aún no tienes grupos asignados.</div>`);
    }
    const ses = await api(`/rest/v1/sesiones?select=tipo,ejercicio,rutina,reps,segundos,fecha&perfil_id=eq.${p.id}&order=fecha.desc&limit=5000`);
    vistaAlumno(perfil, ses);
  } catch (e) { vistaLogin(e.message); }
}
function demoDatos() {
  const nombres = ["Valeria Hernández", "Diego Martínez", "Sofía Ramírez", "Mateo López", "Regina Torres", "Santiago Cruz", "Camila Flores", "Emiliano Ruiz", "Ximena Díaz", "Leonardo Vargas"];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ejs = ["sentadillas", "saltosTijera", "rodillasArriba", "flexionPared"];
  const alumnos = nombres.map((n, i) => ({id: "a" + i, nombre: n})), sesiones = [];
  alumnos.forEach((a, i) => {
    const constancia = 0.75 - i * 0.07;
    for (let d = 55; d >= 0; d--) {
      if (rnd() > constancia) continue;
      const ej = ejs[Math.floor(rnd() * ejs.length)];
      sesiones.push({perfil_id: a.id, tipo: "ejercicio", ejercicio: ej, reps: Math.round(12 + (55 - d) * 0.35 + rnd() * 8 - i), segundos: 60, fecha: new Date(diaLocal(Date.now()) - d * DIA + 10 * 3600000).toISOString()});
    }
  });
  return {alumnos, sesiones};
}
inicio();

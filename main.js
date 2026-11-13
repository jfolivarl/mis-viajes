/* Mis viajes · álbum interactivo de viajes en forma de visor
   Dos caras: la pública enseña viajes y recuerdos de ejemplo (viajes.js del repositorio)
   y la privada guarda tus viajes, recuerdos y fotos solo en este dispositivo (IndexedDB),
   con copia de seguridad en un zip.
   Partes: utilidades y datos · mapa (Leaflet) · pestañas Viajes, Fotos y Recuerdos ·
   visor de fotos · hojas de edición · copia de seguridad · rutas por hash (#fotos, #v/…). */
(function () {
  'use strict';

  /* ===================== Utilidades ===================== */
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = n => '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const menosMov = matchMedia('(prefers-reduced-motion: reduce)');
  const clonar = o => JSON.parse(JSON.stringify(o));
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;

  function aFecha(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  const diaMes = d => d.getUTCDate() + ' ' + MESES[d.getUTCMonth()];
  function rango(v) {
    const a = aFecha(v.desde), b = aFecha(v.hasta) || a;
    if (!a) return '';
    const da = a.getUTCDate(), ma = a.getUTCMonth(), ya = a.getUTCFullYear();
    const db = b.getUTCDate(), mb = b.getUTCMonth(), yb = b.getUTCFullYear();
    if (+a === +b) return da + ' ' + MESES[ma] + ' ' + ya;
    if (ya === yb && ma === mb) return da + '–' + db + ' ' + MESES[ma] + ' ' + ya;
    if (ya === yb) return da + ' ' + MESES[ma] + ' – ' + db + ' ' + MESES[mb] + ' ' + ya;
    return da + ' ' + MESES[ma] + ' ' + ya + ' – ' + db + ' ' + MESES[mb] + ' ' + yb;
  }
  function dias(v) {
    const a = aFecha(v.desde), b = aFecha(v.hasta) || a;
    return a && b >= a ? Math.round((b - a) / 864e5) + 1 : 0;
  }
  function cuando(v) {
    const a = aFecha(v.desde), b = aFecha(v.hasta) || a;
    if (!a) return 'Sin fecha';
    const h = new Date(), hoy = Date.UTC(h.getFullYear(), h.getMonth(), h.getDate());
    if (hoy < a) { const n = Math.round((a - hoy) / 864e5); return 'Faltan ' + n + (n === 1 ? ' día' : ' días'); }
    if (hoy <= b) return 'En curso';
    const n = Math.round((hoy - b) / 864e5);
    if (n < 31) return 'Hace ' + n + (n === 1 ? ' día' : ' días');
    if (n < 365) { const m = Math.max(1, Math.round(n / 30.4)); return 'Hace ' + m + (m === 1 ? ' mes' : ' meses'); }
    const y = Math.floor(n / 365);
    return 'Hace ' + y + (y === 1 ? ' año' : ' años');
  }
  const anio = v => (v.desde || '').slice(0, 4);
  function fechaTxt(s) {
    const d = aFecha(s);
    if (!d) return '';
    const h = /T(\d{2}:\d{2})/.exec(s);
    return d.getUTCDate() + ' ' + MESES[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + (h ? ' · ' + h[1] : '');
  }
  function slug(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'viaje';
  }
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const coord = p => p.lat.toFixed(5) + ', ' + p.lng.toFixed(5);
  const lugaresDe = v => (v.itinerario || '').split(',').map(x => x.trim()).filter(Boolean);
  const ovalos = (lista, cls) => lista.length ? '<div class="ovalos' + (cls ? ' ' + cls : '') + '">' + lista.map(x => '<span>' + ico('pin') + esc(x) + '</span>').join('') + '</div>' : '';

  let tToast = 0;
  function toast(msg, fijo) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(tToast);
    if (!fijo) tToast = setTimeout(() => { t.hidden = true; }, 3200);
  }
  /* ===================== Datos: ejemplos (públicos) y míos (solo aquí) ===================== */
  const EJEMPLOS = Array.isArray(window.VIAJES) ? window.VIAJES : [];
  const LS = {
    leer(k) { try { return localStorage.getItem('mis-viajes.' + k); } catch (e) { return null; } },
    poner(k, v) { try { if (v == null) localStorage.removeItem('mis-viajes.' + k); else localStorage.setItem('mis-viajes.' + k, v); } catch (e) { /* sin almacenamiento */ } }
  };
  const CLAVE_DATOS = '__datos__';
  let modo = 'ejemplos';      // 'ejemplos' o 'mios'
  let hayMios = false;        // hay viajes propios guardados en este dispositivo
  function ejemplos() {
    const d = clonar(EJEMPLOS);
    let k = null;
    try { k = JSON.parse(LS.leer('fav-ej')); } catch (e) { k = null; }
    if (Array.isArray(k)) {
      d.forEach(v => (v.puntos || []).forEach(p => { p.fav = k.indexOf(v.id + '/' + p.id) >= 0; }));
    }
    return d;
  }
  /* Recuerdos: sitios sueltos que no son un viaje. Se guardan junto a los viajes (con «recuerdos: true»),
     así entran en la copia de seguridad sin cambiar su formato */
  const recVacio = () => ({ id: 'recuerdos', recuerdos: true, titulo: 'Recuerdos', puntos: [] });
  let rec = recVacio();
  function separar(lista) {
    const i = lista.findIndex(v => v && v.recuerdos);
    rec = i >= 0 ? lista.splice(i, 1)[0] : recVacio();
    rec.puntos = rec.puntos || [];
    return lista;
  }
  const conRecuerdos = () => rec.puntos.length ? datos.concat([rec]) : datos;
  let datos = separar(ejemplos());
  let editando = false;
  const arch = new Map();     // nombre de archivo -> { blob, url } (fotos y adjuntos propios)

  const IDB = (function () {
    let p = null;
    function abrir() {
      if (!p) {
        p = new Promise((ok, mal) => {
          const r = indexedDB.open('mis-viajes-privado', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('a');
          r.onsuccess = () => ok(r.result);
          r.onerror = () => mal(r.error);
        });
      }
      return p;
    }
    function op(m, fn) {
      return abrir().then(db => new Promise((ok, mal) => {
        const tx = db.transaction('a', m);
        const res = fn(tx.objectStore('a'));
        tx.oncomplete = () => ok(res && res.result);
        tx.onerror = () => mal(tx.error);
      })).catch(() => null);
    }
    return {
      poner: (k, v) => op('readwrite', s => s.put(v, k)),
      quitar: k => op('readwrite', s => s.delete(k)),
      vaciar: () => op('readwrite', s => s.clear()),
      todo: () => op('readonly', s => {
        const out = { result: [] };
        s.openCursor().onsuccess = e => {
          const c = e.target.result;
          if (c) { out.result.push([c.key, c.value]); c.continue(); }
        };
        return out;
      })
    };
  })();
  const persistir = () => { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => null); };

  function guardar() {
    if (modo !== 'mios') return;
    hayMios = true;
    IDB.poner(CLAVE_DATOS, JSON.stringify(conRecuerdos()));
    LS.poner('pendiente', '1');
    LS.poner('x-copia', null);
    pintarAviso();
  }
  function soltar(f) {
    if (f && arch.has(f)) { URL.revokeObjectURL(arch.get(f).url); arch.delete(f); IDB.quitar(f); }
  }
  async function guardarArchivo(nombre, blob) {
    await IDB.poner(nombre, blob);
    arch.set(nombre, { blob, url: URL.createObjectURL(blob) });
  }

  const porId = id => id === rec.id ? rec : datos.find(v => v.id === id);
  const ordenados = () => datos.slice().sort((a, b) => cmp(b.desde || '', a.desde || ''));
  /* Número de cada viaje por orden cronológico: el más antiguo es el 1 y el más reciente el último.
     Los que aún no tienen fecha van detrás, en el orden en que se crearon. */
  function numeros() {
    const conFecha = datos.filter(v => v.desde).sort((a, b) => cmp(a.desde, b.desde));
    return new Map(conFecha.concat(datos.filter(v => !v.desde)).map((v, i) => [v.id, i + 1]));
  }
  const puntosDe = v => v.puntos || [];
  const adjuntosDe = v => v.adjuntos || [];
  const conFoto = v => puntosDe(v).filter(p => p.f);
  const ubicados = v => puntosDe(v).filter(p => p.lat != null);
  const puntoDe = (v, id) => puntosDe(v).find(p => p.id === id);
  const src = f => arch.has(f) ? arch.get(f).url : encodeURI(f);
  const nombrePunto = p => p.nombre || p.txt || (p.f ? 'Foto' : 'Punto');
  function portada(v) {
    const fs = conFoto(v);
    if (!fs.length) return null;
    return (fs.find(p => p.f === v.portada) || fs[0]).f;
  }
  function centroPuntos(v) {
    const g = ubicados(v);
    if (!g.length) return null;
    const s = g.reduce((a, p) => [a[0] + p.lat, a[1] + p.lng], [0, 0]);
    return { lat: +(s[0] / g.length).toFixed(4), lng: +(s[1] / g.length).toFixed(4) };
  }
  const posicion = v => v.lat != null ? { lat: v.lat, lng: v.lng } : centroPuntos(v);
  function referenciadas() {
    const s = new Set();
    conRecuerdos().forEach(v => {
      puntosDe(v).forEach(p => { if (p.f) s.add(p.f); });
      adjuntosDe(v).forEach(a => s.add(a.f));
    });
    return s;
  }
  function nuevoId(v) {
    const n = puntosDe(v).reduce((m, p) => Math.max(m, +(/\d+/.exec(p.id) || [0])[0]), 0);
    return 'p' + (n + 1);
  }
  function nombreLibre(prefijo, ext) {
    const usados = referenciadas();
    let n = 0, nombre;
    do { n++; nombre = prefijo + '-' + String(n).padStart(2, '0') + '.' + ext; } while (usados.has(nombre) || arch.has(nombre));
    return nombre;
  }
  function ordenarPuntos(v) {
    const clave = p => p.fecha || '9999';
    v.puntos.sort((a, b) => cmp(clave(a), clave(b)));
  }
  function completarViaje(v) {
    if (v.lat == null) { const c = centroPuntos(v); if (c) { v.lat = c.lat; v.lng = c.lng; } }
    const fechas = puntosDe(v).map(p => p.fecha).filter(Boolean).sort();
    if (!v.desde && fechas.length) { v.desde = fechas[0].slice(0, 10); v.hasta = fechas[fechas.length - 1].slice(0, 10); }
  }

  /* ===================== Mapa (Leaflet) ===================== */
  function crearMapa(el) {
    const map = L.map(el, { zoomControl: false, worldCopyJump: true, minZoom: 2, maxZoom: 19, zoomSnap: 0.5, tapTolerance: 15 });
    map.setView([25, -20], 2);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    const OSM = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    /* Fondos grises de Esri (Canvas): sin clave, con su capa de nombres encima */
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    const gris = (estilo, clase) => L.layerGroup([
      L.tileLayer(ESRI + 'Canvas/World_' + estilo + '_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
        maxNativeZoom: 16, maxZoom: 19, className: clase || '',
        attribution: '© <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, HERE, Garmin · ' + OSM
      }),
      L.tileLayer(ESRI + 'Canvas/World_' + estilo + '_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 19, className: clase || '' })
    ]);
    const capas = {
      azul: gris('Dark', 'capa-azul'), /* el gris oscuro teñido con el azul de la app */
      oscuro: gris('Dark'),
      claro: gris('Light'),
      calle: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: OSM }),
      relieve: L.tileLayer(ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '© <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, HERE, Garmin, USGS · ' + OSM
      }),
      satelite: L.layerGroup([
        L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: 'Imágenes © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics'
        }),
        L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
      ])
    };
    const NOMBRES = { azul: 'Azul', oscuro: 'Gris oscuro', claro: 'Gris claro', calle: 'Callejero', relieve: 'Relieve', satelite: 'Satélite' };
    let base = 'azul'; /* el fondo azul combina con la app y no compite con las fotos */
    try { const g = localStorage.getItem('mis-viajes.base'); if (capas[g]) base = g; } catch (e) { /* sin almacenamiento */ }
    const ponerBase = k => {
      if (capas[base]) map.removeLayer(capas[base]);
      base = k;
      capas[base].addTo(map);
      el.classList.toggle('base-osc', base === 'azul' || base === 'oscuro' || base === 'satelite');
      const sw = el.querySelector('[data-m="capa"] .sw');
      if (sw) sw.dataset.b = base;
      try { localStorage.setItem('mis-viajes.base', base); } catch (e) { /* sin almacenamiento */ }
    };
    const izq = L.DomUtil.create('div', 'm-ctrl m-izq', el);
    izq.innerHTML =
      '<button type="button" data-m="mas" aria-label="Acercar">' + ico('mas') + '</button>' +
      '<button type="button" data-m="menos" aria-label="Alejar">' + ico('menos') + '</button>' +
      '<button type="button" data-m="todo" aria-label="Ver todo">' + ico('mundo') + '</button>' +
      '<button type="button" class="m-bloque" data-m="yo" aria-label="Mi ubicación" aria-pressed="false">' + ico('yo') + '</button>' +
      '<button type="button" data-m="full" aria-label="Mapa a pantalla completa" aria-pressed="false">' + ico('full') + '</button>';
    /* Derecha: buscar y capas; en un segundo bloque, qué viajes se ven (Ver viajes y corazón) */
    const ctrl = L.DomUtil.create('div', 'm-ctrl', el);
    ctrl.innerHTML =
      '<button type="button" data-m="buscar" aria-label="Buscar una dirección o un lugar" aria-expanded="false">' + ico('lupa') + '</button>' +
      '<button type="button" data-m="capa" aria-label="Elegir el mapa base" aria-haspopup="true" aria-expanded="false">' + ico('capas') + '<span class="sw sw-mini" aria-hidden="true"><i></i></span></button>' +
      '<button type="button" class="m-bloque" data-m="filtro" aria-haspopup="true" aria-expanded="false" aria-pressed="false"></button>' +
      '<button type="button" class="cz" data-m="fav" aria-label="Modo corazón: ver solo las fotos favoritas" aria-pressed="false">' + ico('corazon') + '</button>';
    const bFav = ctrl.querySelector('[data-m="fav"]'), bFiltro = ctrl.querySelector('[data-m="filtro"]');
    ponerBase(base);
    [izq, ctrl].forEach(c => { L.DomEvent.disableClickPropagation(c); L.DomEvent.disableScrollPropagation(c); });
    L.DomUtil.create('div', 'm-cruz', el).innerHTML = ico('diana');
    /* Escala y norte, abajo a la izquierda */
    L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 110 }).addTo(map);
    const norte = L.control({ position: 'bottomleft' });
    norte.onAdd = () => {
      const d = L.DomUtil.create('div', 'm-norte');
      d.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path class="lleno" d="M12 2.5l4 9.5-4-2-4 2z"/><path d="M9.5 21.5v-6l5 6v-6"/></svg>';
      d.setAttribute('role', 'img');
      d.setAttribute('aria-label', 'Norte arriba');
      return d;
    };
    norte.addTo(map);
    /* Retícula de fondo: se ve mientras carga el mapa base o si no hay conexión */
    map.createPane('red').style.zIndex = 150;
    const lineas = [];
    for (let ln = -540; ln <= 540; ln += 30) lineas.push([[-85, ln], [85, ln]]);
    for (let la = -60; la <= 60; la += 30) lineas.push([[la, -540], [la, 540]]);
    L.polyline(lineas, { pane: 'red', weight: 1, interactive: false, className: 'm-red' }).addTo(map);

    let puntos = [], fabrica = null, tocar = null, mover = null, resalte = null, linea = null;
    const grupo = L.layerGroup().addTo(map);
    let pin = null, yo = null, yoAcc = null;

    function pintarMarcas() {
      grupo.clearLayers();
      if (!fabrica) return;
      const z = map.getZoom(), R = 40, grupos = [];
      puntos.forEach(p => {
        const q = map.project([p.lat, p.lng], z);
        const g = grupos.find(o => Math.abs(o.x - q.x) < R && Math.abs(o.y - q.y) < R);
        if (g) g.items.push(p); else grupos.push({ x: q.x, y: q.y, items: [p] });
      });
      grupos.forEach(g => {
        const p = g.items[0], solo = g.items.length === 1, f = fabrica(g.items), arrastra = !!(mover && solo && f.mov !== false);
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: 'm-m ' + f.clase + (arrastra ? ' mov' : ''), html: f.html, iconSize: [f.tam, f.tam] }),
          draggable: arrastra, keyboard: true, riseOnHover: true, autoPanOnFocus: false
        });
        m.ids = g.items.map(i => i.id);
        m.on('click', () => { if (tocar) tocar(g.items); });
        if (arrastra) {
          m.on('dragend', () => {
            const ll = m.getLatLng().wrap();
            mover(p, { lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) });
          });
        }
        m.addTo(grupo);
        const e = m.getElement();
        if (e) e.setAttribute('aria-label', f.titulo + (arrastra ? '. Arrástralo para moverlo' : ''));
      });
      api.resaltar(resalte);
    }
    map.on('zoomend', pintarMarcas);
    /* Mantener el dedo pulsado (o clic derecho) marca un sitio */
    map.on('contextmenu', e => { if (api.alMarcar) api.alMarcar(e.latlng.wrap()); });
    map.on('click', e => { if (document.body.classList.contains('eligiendo')) map.panTo(e.latlng); });

    const alClic = e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const a = b.dataset.m;
      if (a === 'mas' || a === 'menos' || a === 'todo') { /* acciones de un toque: se iluminan un instante, sin crecer */
        b.classList.add('pulso');
        clearTimeout(b.tPulso);
        b.tPulso = setTimeout(() => b.classList.remove('pulso'), 350);
      }
      if (a === 'mas') map.zoomIn();
      else if (a === 'menos') map.zoomOut();
      else if (a === 'todo') { if (api.alTodo) api.alTodo(); }
      else if (a === 'filtro') { if (api.alFiltro) api.alFiltro(b); }
      else if (a === 'full') { if (api.alFull) api.alFull(b); }
      else if (a === 'fav') { if (api.alFav) api.alFav(); }
      else if (a === 'buscar') { if (api.alBuscar) api.alBuscar(b); }
      else if (a === 'yo') { if (api.alYo) api.alYo(b); }
      else if (a === 'capa') { if (api.alCapa) api.alCapa(b); }
    };
    izq.addEventListener('click', alClic);
    ctrl.addEventListener('click', alClic);
    new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el);

    const api = {
      verTodo: null,
      alTodo: null,
      alMarcar: null,
      alYo: null,
      alTocarYo: null,
      alFiltro: null,
      alFav: null,
      alFull: null,
      alBuscar: null,
      alCapa: null,
      bases: () => Object.keys(capas).map(k => ({ k, nombre: NOMBRES[k], activa: k === base })),
      base: ponerBase,
      favorito(on) { bFav.setAttribute('aria-pressed', on); bFav.setAttribute('aria-label', on ? 'Quitar el modo corazón' : 'Modo corazón: ver solo las fotos favoritas'); },
      /* El botón del filtro crece cuando el mapa enseña un solo viaje */
      /* «Ver viajes»: apagado, un avión; con un viaje en el mapa, el embudo relleno con el número de ese viaje */
      filtrado(titulo, num) {
        bFiltro.setAttribute('aria-pressed', !!titulo);
        bFiltro.setAttribute('aria-label', titulo ? 'Viaje ' + (num ? num + ' ' : '') + 'en el mapa: ' + titulo + '. Toca para ver viajes' : 'Ver viajes');
        bFiltro.title = titulo || 'Ver viajes';
        bFiltro.innerHTML = titulo ? ico('filtro') + (num ? '<span class="m-num" aria-hidden="true">' + num + '</span>' : '') : ico('avion');
      },
      tam() { map.invalidateSize({ pan: false }); },
      zoom: () => map.getZoom(),
      centro() { const c = map.getCenter().wrap(); return { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5) }; },
      foco() { el.focus(); },
      volar(la, ln, z) {
        if (menosMov.matches) map.setView([la, ln], z, { animate: false });
        else map.flyTo([la, ln], z, { duration: 0.8 });
      },
      ajustar(lista, zMax) {
        if (!lista.length) return;
        if (lista.length === 1) { api.volar(lista[0].lat, lista[0].lng, zMax || 11); return; }
        map.fitBounds(L.latLngBounds(lista.map(p => [p.lat, p.lng])), { padding: [50, 50], maxZoom: zMax || 15, animate: !menosMov.matches });
      },
      marcas(lista, fab, toc, mov) {
        puntos = lista; fabrica = fab; tocar = toc; mover = mov || null;
        pintarMarcas();
      },
      ruta(lista) {
        if (linea) linea.remove();
        linea = lista && lista.length > 1 ? L.polyline(lista, { color: '#D6AD55', weight: 3, dashArray: '2 8', lineCap: 'round', interactive: false }).addTo(map) : null;
      },
      resaltar(id) {
        resalte = id;
        grupo.eachLayer(m => { const e = m.getElement(); if (e) e.classList.toggle('on', id != null && m.ids.indexOf(id) >= 0); });
      },
      ventana(la, ln, html) {
        L.popup({ maxWidth: 260, className: 'm-pop', autoPanPaddingTopLeft: [60, 16], autoPanPaddingBottomRight: [62, 50] }).setLatLng([la, ln]).setContent(html).openOn(map);
      },
      cerrarVentana() { map.closePopup(); },
      /* Chincheta de un lugar buscado, con su ventana */
      pin(la, ln, nodo, sinZoom) {
        api.quitarPin();
        if (!sinZoom) map.setView([la, ln], Math.max(map.getZoom(), 15), { animate: false });
        pin = L.marker([la, ln], {
          icon: L.divIcon({ className: 'm-pin', iconSize: [34, 42], iconAnchor: [17, 41], popupAnchor: [0, -38],
            html: '<svg viewBox="0 0 34 42" aria-hidden="true"><path d="M17 41S2.5 26.5 2.5 16a14.5 14.5 0 0 1 29 0C31.5 26.5 17 41 17 41z"/><circle cx="17" cy="16" r="5.5"/></svg>' }),
          zIndexOffset: 2000, keyboard: true, alt: 'Lugar buscado'
        }).addTo(map);
        pin.bindPopup(nodo, { maxWidth: 260, className: 'm-pop', autoPanPaddingTopLeft: [60, 16], autoPanPaddingBottomRight: [62, 50] }).openPopup();
      },
      quitarPin() { if (pin) { pin.remove(); pin = null; } },
      /* Mi ubicación: esferita azul con su círculo de precisión */
      yo(la, ln, acc) {
        if (!yo) {
          yoAcc = L.circle([la, ln], { radius: acc, className: 'm-yo-acc', weight: 1, interactive: false }).addTo(map);
          yo = L.marker([la, ln], { icon: L.divIcon({ className: 'm-yo', iconSize: [20, 20] }), zIndexOffset: 3000, keyboard: true, alt: 'Estás aquí' }).addTo(map);
          yo.on('click', () => { if (api.alTocarYo) api.alTocarYo(); });
        } else { yo.setLatLng([la, ln]); yoAcc.setLatLng([la, ln]).setRadius(acc); }
      },
      quitarYo() { if (yo) { yo.remove(); yoAcc.remove(); yo = yoAcc = null; } }
    };
    api.filtrado(null); /* el botón empieza como «Ver viajes» */
    return api;
  }

  /* ===================== Lectura de EXIF (fecha y GPS) ===================== */
  function leerExif(buf) {
    const out = {};
    try {
      const dv = new DataView(buf), len = dv.byteLength;
      let t = -1;
      if (dv.getUint16(0) === 0xFFD8) {
        let p = 2;
        while (p + 10 < len) {
          const mk = dv.getUint16(p), sz = dv.getUint16(p + 2);
          if (mk === 0xFFE1 && dv.getUint32(p + 4) === 0x45786966) { t = p + 10; break; }
          if ((mk & 0xFF00) !== 0xFF00 || mk === 0xFFDA) break;
          p += 2 + sz;
        }
      }
      if (t < 0) { /* HEIC y otros: buscar la cabecera «Exif» */
        const lim = Math.min(len - 10, 6e6);
        for (let i = 0; i < lim; i++) {
          if (dv.getUint32(i) === 0x45786966 && dv.getUint16(i + 4) === 0) {
            const b = dv.getUint16(i + 6);
            if (b === 0x4949 || b === 0x4D4D) { t = i + 6; break; }
          }
        }
      }
      if (t < 0) return out;
      const le = dv.getUint16(t) === 0x4949;
      const u16 = o => dv.getUint16(t + o, le), u32 = o => dv.getUint32(t + o, le);
      const ifd = off => {
        const tags = {};
        if (!off || t + off + 2 > len) return tags;
        const n = u16(off);
        for (let i = 0; i < n; i++) {
          const e = off + 2 + i * 12;
          if (t + e + 12 > len) break;
          tags[u16(e)] = { tipo: u16(e + 2), n: u32(e + 4), vo: e + 8 };
        }
        return tags;
      };
      const val = tag => {
        if (!tag) return null;
        if (tag.tipo === 2) {
          const off = tag.n > 4 ? u32(tag.vo) : tag.vo;
          let s = '';
          for (let i = 0; i < tag.n - 1 && t + off + i < len; i++) s += String.fromCharCode(dv.getUint8(t + off + i));
          return s;
        }
        if (tag.tipo === 5) {
          const off = u32(tag.vo), a = [];
          for (let i = 0; i < tag.n; i++) {
            const d = u32(off + i * 8 + 4);
            a.push(d ? u32(off + i * 8) / d : 0);
          }
          return a;
        }
        if (tag.tipo === 4) return u32(tag.vo);
        if (tag.tipo === 3) return u16(tag.vo);
        return null;
      };
      const i0 = ifd(u32(4));
      const pe = val(i0[0x8769]);
      const ie = pe ? ifd(pe) : {};
      const d = val(ie[0x9003]) || val(ie[0x9004]) || val(i0[0x0132]);
      const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(d || '');
      if (m && m[1] !== '0000') out.fecha = m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5];
      const pg = val(i0[0x8825]);
      if (pg) {
        const g = ifd(pg), la = val(g[2]), lo = val(g[4]);
        if (la && lo && la.length === 3 && lo.length === 3) {
          let a = la[0] + la[1] / 60 + la[2] / 3600, b = lo[0] + lo[1] / 60 + lo[2] / 3600;
          if (val(g[1]) === 'S') a = -a;
          if (val(g[3]) === 'W') b = -b;
          if (isFinite(a) && isFinite(b) && (a || b)) { out.lat = +a.toFixed(5); out.lng = +b.toFixed(5); }
        }
      }
    } catch (e) { /* archivo sin EXIF legible */ }
    return out;
  }

  /* Guarda la foto a 2560 px de lado mayor y buena calidad (≈1 MB): se puede ampliar sin que se vea borrosa */
  function reducir(file) {
    return new Promise((ok, mal) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 2560 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(b => { c.width = c.height = 0; if (b) ok(b); else mal(new Error('jpeg')); }, 'image/jpeg', 0.9);
      };
      im.onerror = () => { URL.revokeObjectURL(u); mal(new Error('imagen')); };
      im.src = u;
    });
  }
  async function prepararFoto(file) {
    const ex = leerExif(await file.arrayBuffer());
    const blob = await reducir(file);
    return { ex, blob };
  }

  /* ===================== Zip sin compresión ===================== */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function crearZip(archivos) {
    const enc = new TextEncoder(), partes = [], central = [], ah = new Date();
    const hora = (ah.getHours() << 11) | (ah.getMinutes() << 5) | (ah.getSeconds() >> 1);
    const dia = ((ah.getFullYear() - 1980) << 9) | ((ah.getMonth() + 1) << 5) | ah.getDate();
    let off = 0;
    archivos.forEach(a => {
      const nb = enc.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(10, hora, true); h.setUint16(12, dia, true); h.setUint32(14, crc, true);
      h.setUint32(18, n, true); h.setUint32(22, n, true); h.setUint16(26, nb.length, true);
      partes.push(h, nb, a.datos);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true);
      c.setUint32(20, n, true); c.setUint32(24, n, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
      central.push(c, nb);
      off += 30 + nb.length + n;
    });
    const tam = central.reduce((s, x) => s + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, archivos.length, true); e.setUint16(10, archivos.length, true);
    e.setUint32(12, tam, true); e.setUint32(16, off, true);
    return new Blob(partes.concat(central, [e]), { type: 'application/zip' });
  }
  /* Lee un zip (sin comprimir o deflate) y devuelve { nombre: Blob } */
  async function leerZip(file) {
    const buf = await file.arrayBuffer(), dv = new DataView(buf), dec = new TextDecoder();
    let e = buf.byteLength - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('zip');
    const n = dv.getUint16(e + 10, true), out = {};
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
      const met = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true);
      const ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const nombre = dec.decode(new Uint8Array(buf, p + 46, ln));
      p += 46 + ln + lx + lc;
      const base = nombre.split('/').pop();
      if (!base || /^(__MACOSX|\.)/.test(nombre) || base.charAt(0) === '.') continue;
      const ini = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const trozo = new Blob([buf.slice(ini, ini + tam)]);
      if (met === 0) out[base] = trozo;
      else if (met === 8 && window.DecompressionStream) out[base] = await new Response(trozo.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      else throw new Error('compresion');
    }
    return out;
  }

  /* ===================== Copia de seguridad ===================== */
  const hoyIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const mb = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  let copia = null; // { file, url }
  async function prepararCopia() {
    const enc = new TextEncoder(), lista = [];
    lista.push({ nombre: 'viajes.json', datos: enc.encode(JSON.stringify({ app: 'mis-viajes', version: 1, fecha: new Date().toISOString(), viajes: conRecuerdos() }, null, 1)) });
    for (const f of referenciadas()) {
      if (arch.has(f)) lista.push({ nombre: f, datos: new Uint8Array(await arch.get(f).blob.arrayBuffer()) });
    }
    const nombre = 'mis-viajes-copia-' + hoyIso() + '.zip';
    if (copia) URL.revokeObjectURL(copia.url);
    const blob = crearZip(lista);
    copia = { file: new File([blob], nombre, { type: 'application/zip' }), url: URL.createObjectURL(blob), n: lista.length - 1 };
    return copia;
  }
  function copiaHecha() {
    LS.poner('copia', new Date().toISOString());
    LS.poner('pendiente', null);
    pintarAviso();
  }
  function copiaGuardada(msg) {
    copiaHecha();
    if (hModo === 'privado') cerrarCapa(baseHoja());
    toast(msg);
  }
  /* Guardar la copia en cualquier equipo: descargar (ordenador, Android, iPhone) o compartir (móvil) */
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const tactil = matchMedia('(pointer: coarse)').matches;
  function puedeCompartir() {
    try { return !!(copia && (esIOS || tactil) && navigator.canShare && navigator.canShare({ files: [copia.file] })); } catch (e) { return false; }
  }
  async function descargarCopia() {
    if (!copia) return;
    const f = copia.file;
    let enMarco = true;
    try { enMarco = window.self !== window.top; } catch (e) { enMarco = true; }
    if (window.showSaveFilePicker && !enMarco) { /* ordenador: deja elegir la carpeta */
      try {
        const h = await window.showSaveFilePicker({ suggestedName: f.name, types: [{ description: 'Copia de Mis viajes', accept: { 'application/zip': ['.zip'] } }] });
        const w = await h.createWritable();
        await w.write(f);
        await w.close();
        copiaGuardada('Copia guardada: ' + h.name);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; /* se canceló el diálogo */
      }
    }
    const a = document.createElement('a');
    a.href = copia.url;
    a.download = f.name;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
    copiaGuardada('Copia descargada: ' + f.name + ' (carpeta de Descargas)');
  }
  function compartirCopia() {
    if (!copia) return;
    const f = copia.file;
    navigator.share({ files: [f], title: f.name }).then(() => copiaGuardada('Copia guardada'),
      e => { if (!e || e.name !== 'AbortError') toast('No se pudo compartir. Usa «Descargar copia».'); });
  }
  /* Acepta el zip de la copia o, si el equipo lo descomprimió solo, sus archivos sueltos (viajes.json y fotos) */
  async function restaurar(files) {
    toast('Leyendo la copia…', true);
    let partes = null;
    const zip = files.find(f => /\.zip$/i.test(f.name) || /zip/i.test(f.type)) || (files.length === 1 && !/\.json$/i.test(files[0].name) ? files[0] : null);
    try {
      if (zip) partes = await leerZip(zip);
      else { partes = {}; files.forEach(f => { partes[f.name.split('/').pop()] = f; }); }
    } catch (e) {
      toast(e && e.message === 'compresion' ? 'Este navegador no puede abrir un zip comprimido. Actualízalo o usa Chrome.' : 'Ese archivo no es una copia de Mis viajes');
      return;
    }
    if (!partes['viajes.json']) { toast('No encuentro «viajes.json»: elige el zip de la copia, o todos sus archivos a la vez.'); return; }
    let lista = null;
    try {
      const j = JSON.parse(await partes['viajes.json'].text());
      lista = Array.isArray(j) ? j : j.viajes;
    } catch (e) { lista = null; }
    if (!Array.isArray(lista)) { toast('Ese archivo no es una copia de Mis viajes'); return; }
    await IDB.vaciar();
    arch.forEach(x => URL.revokeObjectURL(x.url));
    arch.clear();
    let n = 0;
    for (const nombre of Object.keys(partes)) {
      if (nombre === 'viajes.json') continue;
      const tipo = /\.pdf$/i.test(nombre) ? 'application/pdf' : 'image/jpeg';
      await guardarArchivo(nombre, new Blob([partes[nombre]], { type: tipo }));
      n++;
    }
    datos = separar(lista);
    modo = 'mios';
    LS.poner('modo', 'mios');
    pintarCabecera();
    persistir();
    guardar();
    copiaHecha();
    vistaKey = '';
    history.replaceState({}, '', location.pathname + location.search);
    aplicado = null;
    aplicar();
    toast('Copia restaurada: ' + plural(datos.length, 'viaje', 'viajes') + (rec.puntos.length ? ', ' + plural(rec.puntos.length, 'recuerdo', 'recuerdos') : '') + ' y ' + plural(n, 'archivo', 'archivos'));
  }
  async function cambiarModo(m) {
    if (m === 'mios') {
      const lista = await IDB.todo();
      const d = (lista || []).find(x => x[0] === CLAVE_DATOS);
      if (d) {
        datos = separar(JSON.parse(d[1]));
        (lista || []).forEach(([k, b]) => { if (k !== CLAVE_DATOS && !arch.has(k)) arch.set(k, { blob: b, url: URL.createObjectURL(b) }); });
        hayMios = true;
      } else { datos = separar([]); hayMios = true; IDB.poner(CLAVE_DATOS, '[]'); }
      persistir();
    } else {
      datos = separar(ejemplos());
      ponerEdicion(false);
    }
    modo = m;
    LS.poner('modo', m);
    fichaEd = null;
    fichaVer = null;
    pintarCabecera();
    pintarAviso();
    vistaKey = '';
    history.replaceState({}, '', location.pathname + location.search);
    aplicado = null;
    aplicar();
  }

  /* ===================== Interfaz ===================== */
  const mapa = crearMapa($('#mapa'));
  const panel = $('#panel');
  let filtro = '', filtroRec = '', vistaKey = '', viajeActual = null, fichaEd = null, fichaVer = null; /* años elegidos en Fotos y en Recuerdos */
  let tab = 'viajes', seguir = true, enMapa = null, soloFav = false;
  const TABS = ['viajes', 'fotos', 'rec'], HASH = { viajes: '#', fotos: '#fotos', rec: '#recuerdos' };
  const esFav = v => puntosDe(v).some(p => p.fav); /* los favoritos son solo de fotos */
  const nFav = () => datos.reduce((n, v) => n + puntosDe(v).filter(p => p.fav).length, 0);
  function guardarFav() {
    if (modo === 'mios') { guardar(); return; }
    const k = [];
    conRecuerdos().forEach(v => puntosDe(v).forEach(p => { if (p.fav) k.push(v.id + '/' + p.id); }));
    LS.poner('fav-ej', JSON.stringify(k));
  }
  function altoMapa() {
    const w = $('.mapa-wrap'), tabs = $('.tabs', panel);
    if (innerWidth >= 900 || !tabs || viajeActual) w.style.removeProperty('--alto');
    else w.style.setProperty('--alto', Math.max(240, innerHeight - (w.getBoundingClientRect().top + scrollY) - tabs.offsetHeight - Math.round(innerHeight * 0.16)) + 'px');
    mapa.tam();
  }
  let anchoPrevio = innerWidth;
  window.addEventListener('resize', () => {
    if (innerWidth === anchoPrevio) return; /* solo al girar o cambiar el ancho: el teclado no cuenta */
    anchoPrevio = innerWidth;
    altoMapa();
    const pg = $('.pager', panel);
    if (pg) { pg.scrollLeft = TABS.indexOf(tab) * pg.clientWidth; moverBarra(TABS.indexOf(tab)); } /* al girar el móvil, seguir en la misma pestaña */
  });

  function pintarCabecera() {
    $('#subtitulo').textContent = modo === 'mios' ? 'Álbum de viajes' : 'Viajes de ejemplo';
    $('#b-copia').setAttribute('aria-label', modo === 'mios' ? 'Copia de seguridad' : 'Mis viajes privados');
  }
  function pintarAviso() {
    const a = $('#aviso');
    let h = '';
    const equis = '<button type="button" class="ib ib-s aviso-x" data-aviso-x aria-label="Cerrar este aviso">' + ico('x') + '</button>';
    if (modo === 'ejemplos') {
      if (!LS.leer('x-ej')) h = equis + '<p>' + ico('mundo') + '<span>Estás viendo <b>viajes de ejemplo</b>.' + (hayMios ? '' : ' Los tuyos se guardan solo en este dispositivo.') + '</span></p>' +
        (hayMios ? '<button type="button" class="pill pri" data-modo="mios">Volver a mis viajes</button>' : '<a class="pill pri" href="#privado">Empezar con mis viajes</a>');
    } else if (LS.leer('pendiente') && datos.length && !LS.leer('x-copia')) {
      const u = LS.leer('copia');
      h = equis + '<p>' + ico('nube') + '<span>' + (u ? 'Hay cambios desde tu última copia (' + fechaTxt(u.slice(0, 10)) + ').' : 'Aún no has hecho ninguna copia de seguridad.') + '</span></p>' +
        '<a class="pill pri" href="#privado">Hacer copia</a>';
    }
    a.innerHTML = h;
    a.hidden = !h;
    altoMapa();
  }

  function marcaViaje(items) {
    const v = items[0].v, p = portada(v);
    return {
      clase: 'm-v', tam: 44,
      titulo: items.length > 1 ? items.length + ' viajes: ' + items.map(i => i.v.titulo).join(', ') : v.titulo,
      html: (p ? '<img src="' + src(p) + '" alt="">' : ico('pin')) + (items.length > 1 ? '<span class="m-n">' + items.length + '</span>' : '')
    };
  }
  function marcaPunto(items) {
    const p = items[0].p, n = items.length;
    return {
      clase: p.f ? 'm-f' : 'm-l', tam: p.f ? 38 : 32,
      titulo: n > 1 ? n + ' puntos aquí' : nombrePunto(p),
      html: (p.f ? '<img src="' + src(p.f) + '" alt="">' : ico('pin')) + (n > 1 ? '<span class="m-n">' + n + '</span>' : '')
    };
  }

  function marcaRecuerdo(items) {
    const p = items[0].p, n = items.length;
    return {
      clase: 'm-r', tam: p.f ? 38 : 32,
      titulo: n > 1 ? n + ' recuerdos aquí' : 'Recuerdo: ' + nombrePunto(p),
      html: (p.f ? '<img src="' + src(p.f) + '" alt="">' : ico('recuerdo')) + (n > 1 ? '<span class="m-n">' + n + '</span>' : '')
    };
  }
  const puntosRec = () => ubicados(rec).filter(o => (!soloFav || o.fav) && (tab !== 'rec' || !filtroRec || anioP(o) === filtroRec)).map(o => ({ id: 'recuerdos/' + o.id, lat: o.lat, lng: o.lng, v: rec, p: o }));
  function tocarRecuerdo(p) {
    if (p.f) { secModo = 'rec'; abrirFoto(rec, p.id); } else ventanaPunto(rec, p);
  }

  /* ---------- Mapa: todos los viajes o uno ---------- */
  function mapaTodos(lista, tocar, fav, soloRec) {
    enMapa = null;
    const pts = [];
    if (!soloRec) lista.forEach(v => {
      const p = posicion(v);
      if (p && !fav) pts.push({ id: v.id, lat: p.lat, lng: p.lng, v });
      if (fav) ubicados(v).filter(o => o.fav && o.f).forEach(o => pts.push({ id: v.id + '/' + o.id, lat: o.lat, lng: o.lng, v, p: o }));
    });
    puntosRec().forEach(o => pts.push(o));
    mapa.ruta(null);
    mapa.cerrarVentana();
    mapa.filtrado(null);
    const esRec = it => it.v === rec;
    mapa.marcas(pts, items => esRec(items[0]) ? marcaRecuerdo(items) : Object.assign(items[0].p ? marcaPunto(items) : marcaViaje(items), { mov: false }), grupo => {
      if (grupo.length > 1 && mapa.zoom() <= 15) mapa.ajustar(grupo, 16);
      else if (esRec(grupo[0])) tocarRecuerdo(grupo[0].p);
      else if (grupo[0].p) abrirFoto(grupo[0].v, grupo[0].p.id);
      else tocar(grupo[0].v);
    }, editando ? (o, pos) => { o.p.lat = pos.lat; o.p.lng = pos.lng; guardar(); toast('Recuerdo movido'); } : null); /* solo los recuerdos se arrastran aquí */
    mapa.verTodo = () => { if (pts.length) mapa.ajustar(pts, 6); else mapa.volar(25, -20, 2); };
    mapa.verTodo();
  }
  function ventanaPunto(v, p) {
    mapa.ventana(p.lat, p.lng, '<b>' + esc(nombrePunto(p)) + '</b>' + (p.fecha ? '<br><small>' + fechaTxt(p.fecha) + '</small>' : '') +
      (p.txt && p.nombre ? '<br>' + esc(p.txt) : '') +
      (editando ? '<br><a class="pill" href="#punto/' + v.id + '/' + p.id + '">' + ico('lapiz') + (v.recuerdos ? 'Editar recuerdo' : 'Editar punto') + '</a>' : ''));
  }
  function mapaViaje(v, ajustar) {
    enMapa = v.id;
    const todos = ubicados(v), favs = todos.filter(o => o.fav), p = posicion(v);
    const g = soloFav ? favs : todos; /* en modo corazón, solo las favoritas */
    mapa.cerrarVentana();
    mapa.filtrado(v.titulo, numeros().get(v.id));
    mapa.ruta(g.length > 1 ? g.map(o => [o.lat, o.lng]) : null);
    if (g.length) {
      const pts = g.map(o => ({ id: o.id, lat: o.lat, lng: o.lng, p: o }));
      mapa.marcas(pts, marcaPunto, grupo => {
        if (grupo.length === 1 || mapa.zoom() > 17) {
          const o = grupo[0].p;
          if (o.f) abrirFoto(v, o.id); else ventanaPunto(v, o);
        } else mapa.ajustar(grupo, 18);
      }, editando ? (o, pos) => { o.p.lat = pos.lat; o.p.lng = pos.lng; guardar(); mapaViaje(v, false); toast('Punto movido'); } : null);
      mapa.verTodo = () => mapa.ajustar(pts, 15);
    } else {
      const pts = p ? [{ id: v.id, lat: p.lat, lng: p.lng, v }] : [];
      mapa.marcas(pts, marcaViaje, () => { /* ya estás en este viaje */ },
        editando ? (o, pos) => { v.lat = pos.lat; v.lng = pos.lng; guardar(); mapaViaje(v, false); toast('Viaje movido'); } : null);
      mapa.verTodo = () => { if (pts.length) mapa.ajustar(pts, 10); };
    }
    if (ajustar) mapa.verTodo();
  }
  let full = false;
  function ponerFull(on) {
    full = on;
    document.documentElement.classList.toggle('full', on);
    const b = $('[data-m="full"]');
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Salir de pantalla completa' : 'Mapa a pantalla completa');
    b.innerHTML = ico(on ? 'encoger' : 'full');
    mapa.cerrarVentana();
    cerrarMenu();
    mapa.tam();
    if (mapa.verTodo) mapa.verTodo();
  }
  mapa.alFull = () => ponerFull(!full);
  /* Planeta (y logo): reinicio del visor = «Todos los viajes». Quita el viaje, el filtro y el año;
     el modo corazón se queda, así que con él se ven todas las favoritas del mundo */
  function verTodosViajes() {
    cerrarMenu();
    mapa.cerrarVentana();
    const habiaAnio = !!(filtro || filtroRec);
    filtro = '';
    filtroRec = '';
    if (viajeActual) ir(HASH[tab]);
    else if (habiaAnio) pintarPanel('inicio', null);
    seguir = false;
    mapaTodos(tab === 'viajes' ? datos : visFotos(), tocarViaje, soloFav, tab === 'rec');
  }
  mapa.alTodo = verTodosViajes;
  $('#m-logo').addEventListener('click', verTodosViajes); /* como el botón del planeta */
  function ventanaViaje(v) {
    const p = posicion(v), f = portada(v), n = conFoto(v).length;
    mapa.ventana(p.lat, p.lng, (f ? '<img class="pop-img" src="' + src(f) + '" alt="">' : '') + '<b>' + esc(v.titulo) + '</b>' +
      (v.desde ? '<br><small>' + rango(v) + '</small>' : '') +
      '<br><a class="pill pri" href="#v/' + v.id + '">' + ico('foto') + (n ? plural(n, 'foto', 'fotos') + ' en el mapa' : 'Abrir el viaje') + '</a>');
  }
  function tocarViaje(v) {
    if (full) { ventanaViaje(v); return; }
    const t = tab === 'viajes' && $('#ficha-' + v.id);
    if (t) enfocarFicha(t); else ir('#v/' + v.id);
  }
  function visFotos() {
    let l = ordenados();
    if (soloFav) l = l.filter(esFav);
    return filtro ? l.filter(v => anio(v) === filtro) : l;
  }
  function mapaInicio() {
    if (tab === 'rec') { mapaTodos([], tocarViaje, soloFav, true); return; }
    if (tab !== 'viajes') { mapaTodos(visFotos(), tocarViaje, soloFav); return; }
    const f = fichaActual();
    if (seguir && f && f.dataset.id) { mapaViaje(porId(f.dataset.id), true); return; }
    mapaTodos(datos, tocarViaje, soloFav);
  }
  /* Modo corazón: un solo estado para el corazón del mapa y los de Fotos y Recuerdos.
     Tocar cualquiera de ellos lo enciende o lo apaga en toda la app. */
  function ponerFav(on) {
    if (on && !conRecuerdos().some(esFav)) { toast('Aún no hay favoritas. Abre una foto y toca el corazón.'); return; }
    soloFav = on;
    mapa.favorito(on);
    document.body.classList.toggle('modo-fav', on);
    if (viajeActual) pintarPanel('viaje', viajeActual, true); else pintarPanel('inicio', null, true);
    toast(on ? 'Modo corazón: solo las fotos favoritas' : 'Modo corazón apagado');
  }
  mapa.alFav = () => ponerFav(!soloFav);
  /* Cuando cambia una favorita desde el visor */
  function refrescarFav(p) {
    panel.querySelectorAll('.ft[data-p="' + p.id + '"]').forEach(f => f.classList.toggle('fav', !!p.fav));
    if (soloFav && !viajeActual && pager()) { /* con el corazón, la lista o el mosaico cambian */
      const pf = $('[data-pag="fotos"]', panel), pr = $('[data-pag="rec"]', panel);
      if (pf) pf.innerHTML = pintarFotos();
      if (pr) pr.innerHTML = pintarRecuerdos();
    }
    if (soloFav && !conRecuerdos().some(esFav)) { ponerFav(false); return; }
    if (soloFav && viajeActual) mapaViaje(viajeActual, false);
  }

  /* ---------- Buscar una dirección (Nominatim de OpenStreetMap) ---------- */
  const busca = $('#m-busca'), q = $('#m-q'), res = $('#m-res');
  let bBusca = null, turno = 0, hallados = [], nombreNuevo = '';
  function cerrarBusca(volver) {
    if (busca.hidden) return;
    busca.hidden = true;
    if (bBusca) { bBusca.setAttribute('aria-expanded', 'false'); if (volver) bBusca.focus(); }
  }
  mapa.alBuscar = b => {
    bBusca = b;
    if (!busca.hidden) { cerrarBusca(true); return; }
    cerrarMenu();
    busca.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    q.focus();
  };
  async function pedir(url) {
    const c = new AbortController(), reloj = setTimeout(() => c.abort(), 9000);
    try {
      const r = await fetch(url, { signal: c.signal });
      if (!r.ok) throw new Error('http ' + r.status);
      return await r.json();
    } finally { clearTimeout(reloj); }
  }
  /* Prueba dos buscadores libres: si uno falla o no encuentra nada, se usa el otro */
  async function geocodificar(t) {
    const txt = encodeURIComponent(t);
    let fallo = null;
    try {
      const j = await pedir('https://photon.komoot.io/api/?limit=5&q=' + txt);
      const l = (j.features || []).map(f => {
        const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
        const partes = [p.name || [p.street, p.housenumber].filter(Boolean).join(' '), p.city, p.state, p.country].filter(Boolean);
        return { lat: +(+c[1]).toFixed(5), lng: +(+c[0]).toFixed(5), nombre: partes[0] || t, txt: [...new Set(partes)].join(', ') };
      });
      if (l.length) return l;
    } catch (e) { fallo = e; }
    try {
      const l = await pedir('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=' + txt);
      return l.map(x => ({ lat: +(+x.lat).toFixed(5), lng: +(+x.lon).toFixed(5), nombre: x.name || String(x.display_name || t).split(',')[0], txt: x.display_name || '' }));
    } catch (e) { if (fallo) throw e; return []; }
  }
  busca.addEventListener('submit', async e => {
    e.preventDefault();
    const t = q.value.trim(), n = ++turno;
    if (t.length < 3) { res.innerHTML = '<p class="nota">Escribe al menos 3 letras.</p>'; return; }
    res.innerHTML = '<p class="nota">Buscando…</p>';
    try {
      const lista = await geocodificar(t);
      if (n !== turno) return;
      hallados = lista.filter(x => isFinite(x.lat) && isFinite(x.lng)).slice(0, 5);
      res.innerHTML = hallados.length ? hallados.map((x, i) => '<button type="button" data-res="' + i + '">' + ico('pin') +
        '<span><b>' + esc(x.nombre) + '</b><small>' + esc(x.txt) + '</small></span></button>').join('')
        : '<p class="nota">Sin resultados. Prueba con más detalle: calle, ciudad, país.</p>';
    } catch (er) {
      if (n === turno) res.innerHTML = '<p class="nota">No se pudo buscar ahora. Inténtalo otra vez en un momento.</p>';
    }
  });
  res.addEventListener('click', e => {
    const b = e.target.closest('[data-res]');
    if (!b) return;
    cerrarBusca();
    ponerPin(hallados[+b.dataset.res]);
  });
  /* Un sitio marcado (buscado o con el dedo pulsado): guardarlo como recuerdo, agregarlo a un viaje o crear un viaje con él */
  /* La ventana de un sitio (buscado, marcado con el dedo o «estás aquí»): guardarlo como recuerdo, crear un viaje o agregarlo a uno */
  const ahora = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return hoyIso() + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  function nodoSitio(x, aqui) {
    const d = document.createElement('div');
    d.className = 'pin-pop';
    const lista = ordenados().filter(v => !v.nueva);
    if (viajeActual && lista.indexOf(viajeActual) > 0) { lista.splice(lista.indexOf(viajeActual), 1); lista.unshift(viajeActual); }
    d.innerHTML = '<b class="pin-n">' + esc(x.nombre) + '</b><small class="pin-t">' + esc(x.txt) + '</small>' +
      (modo !== 'mios' ? '<button type="button" class="pill pri" data-pin="privado">Guardar en mis viajes</button>'
        : '<button type="button" class="pill pri" data-pin="recuerdos">' + ico('recuerdo') + (aqui ? 'Guardar aquí como recuerdo' : 'Guardar como recuerdo') + '</button>' +
          '<button type="button" class="pill" data-pin="__nuevo">' + ico('mas') + (aqui ? 'Empezar un viaje aquí' : 'Crear viaje') + '</button>' +
          (lista.length ? '<p class="nota">Agregar a un viaje:</p>' + lista.map(v => '<button type="button" class="pill' + (v === viajeActual ? ' suave' : '') +
            '" data-pin="' + v.id + '">' + ico('pin') + '<span>' + esc(v.titulo) + '</span></button>').join('') : '')) +
      '<button type="button" class="pill peligro" data-pin="">' + ico('x') + (aqui ? 'Ocultar mi ubicación' : 'Quitar del mapa') + '</button>';
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-pin]');
      if (!b) return;
      const id = b.dataset.pin;
      if (full) ponerFull(false);
      if (id === 'privado') { mapa.cerrarVentana(); ir('#privado', false, { capa: true }); return; } /* la chincheta se queda para luego */
      if (aqui) mapa.cerrarVentana(); else mapa.quitarPin();
      if (!id) { if (aqui) pararYo(); return; }
      if (!editando) { ponerEdicion(true); pintarPanel(viajeActual ? 'viaje' : 'inicio', viajeActual); }
      const fecha = aqui ? ahora() : '';
      if (id === '__nuevo') {
        const p = { nombre: x.nombre, lat: x.lat, lng: x.lng };
        if (fecha) p.fecha = fecha;
        fichaEd = { id: idLibre('nuevo-viaje'), titulo: 'Nuevo viaje', puntos: [], nueva: true, lat: x.lat, lng: x.lng, traer: { p } };
        ir('#ficha/' + fichaEd.id, false, { capa: true });
        return;
      }
      const v = porId(id);
      if (!v) return;
      if (v.recuerdos && aqui) { guardarAqui(x, fecha); return; }
      posNueva = { lat: x.lat, lng: x.lng };
      nombreNuevo = x.nombre;
      fechaNueva = fecha;
      if (v.recuerdos) { if (viajeActual || tab !== 'rec') ir('#recuerdos'); } /* así, al guardar, se queda en Recuerdos */
      else if (viajeActual !== v) ir('#v/' + v.id); /* así, al guardar, se vuelve al viaje */
      ir('#nuevo-punto/' + v.id, false, { capa: true });
    });
    return d;
  }
  function ponerPin(x, sinZoom) {
    const d = nodoSitio(x, false);
    mapa.pin(x.lat, x.lng, d, sinZoom);
    return d;
  }
  /* «Estás aquí» se guarda al momento como recuerdo, con su sitio y la hora; luego se le puede añadir foto o nota */
  function guardarAqui(x, fecha) {
    const p = { id: nuevoId(rec), nombre: x.nombre === 'Estás aquí' ? 'Aquí estuve' : x.nombre, fecha, lat: x.lat, lng: x.lng };
    rec.puntos.push(p);
    guardar();
    filtroRec = '';
    if (!viajeActual) pintarPanel('inicio', null, true);
    if (viajeActual || tab !== 'rec') ir('#recuerdos');
    ir('#punto/recuerdos/' + p.id, false, { capa: true });
    toast('Recuerdo guardado aquí. Si quieres, añádele una foto o una nota.');
  }
  /* ---------- Mi ubicación ---------- */
  let vigia = null, yoPos = null, yoPrimera = false;
  const bYo = $('[data-m="yo"]');
  function pararYo() {
    if (vigia !== null) navigator.geolocation.clearWatch(vigia);
    vigia = null;
    yoPos = null;
    mapa.quitarYo();
    bYo.setAttribute('aria-pressed', 'false');
    bYo.setAttribute('aria-label', 'Mi ubicación');
  }
  function abrirYo() {
    if (!yoPos) return;
    const x = { lat: +yoPos.lat.toFixed(5), lng: +yoPos.lng.toFixed(5), nombre: 'Estás aquí', txt: 'Precisión: unos ' + Math.max(5, Math.round(yoPos.acc)) + ' m' };
    const d = nodoSitio(x, true);
    mapa.ventana(x.lat, x.lng, d);
    nombreSitio(x.lat, x.lng).then(n => {
      if (!n || !d.isConnected) return;
      x.nombre = n.nombre;
      $('.pin-t', d).textContent = n.txt + ' · ' + x.txt;
      $('.pin-n', d).textContent = 'Estás aquí: ' + n.nombre;
    });
  }
  mapa.alTocarYo = abrirYo;
  mapa.alYo = () => {
    if (vigia !== null) { pararYo(); toast('Ubicación oculta'); return; }
    if (!navigator.geolocation) { toast('Este navegador no puede darte tu ubicación'); return; }
    bYo.setAttribute('aria-pressed', 'true');
    bYo.setAttribute('aria-label', 'Ocultar mi ubicación');
    yoPrimera = true;
    toast('Buscando tu ubicación…', true);
    vigia = navigator.geolocation.watchPosition(pos => {
      const c = pos.coords;
      yoPos = { lat: c.latitude, lng: c.longitude, acc: c.accuracy || 30 };
      mapa.yo(yoPos.lat, yoPos.lng, yoPos.acc);
      if (yoPrimera) {
        yoPrimera = false;
        toast('Estás aquí');
        mapa.volar(yoPos.lat, yoPos.lng, Math.max(mapa.zoom(), 16));
        setTimeout(abrirYo, menosMov.matches ? 0 : 900);
      }
    }, er => {
      pararYo();
      toast(er && er.code === 1 ? 'Sin permiso de ubicación. Actívalo en los ajustes del navegador (en el iPhone: Ajustes › Safari › Ubicación).' : 'No se pudo saber dónde estás. Inténtalo otra vez.');
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  };
  /* Nombre del sitio marcado con el dedo (si hay conexión) */
  async function nombreSitio(lat, lng) {
    try {
      const j = await pedir('https://photon.komoot.io/reverse?lat=' + lat + '&lon=' + lng);
      const p = ((j.features || [])[0] || {}).properties;
      if (p) {
        const partes = [p.name || [p.street, p.housenumber].filter(Boolean).join(' '), p.city, p.state, p.country].filter(Boolean);
        if (partes.length) return { nombre: partes[0], txt: [...new Set(partes)].join(', ') };
      }
    } catch (e) { /* se prueba el otro */ }
    try {
      const x = await pedir('https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=' + lat + '&lon=' + lng);
      if (x && x.display_name) return { nombre: x.name || String(x.display_name).split(',')[0], txt: x.display_name };
    } catch (e) { /* sin nombre */ }
    return null;
  }
  mapa.alMarcar = async ll => {
    if (eligiendo) return;
    cerrarBusca();
    cerrarMenu();
    const x = { lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5), nombre: 'Sitio marcado', txt: '' };
    x.txt = coord(x);
    const d = ponerPin(x, true);
    const n = await nombreSitio(x.lat, x.lng);
    if (!n || !d.isConnected) return;
    x.nombre = n.nombre;
    x.txt = n.txt;
    $('.pin-n', d).textContent = n.nombre;
    $('.pin-t', d).textContent = n.txt;
  };
  /* Recuerdos: nuevo (eligiendo el sitio en el mapa) y ver uno */
  function nuevoRecuerdo() {
    if (modo !== 'mios') { ir('#privado', false, { capa: true }); return; }
    if (!editando) { ponerEdicion(true); pintarPanel('inicio', null, true); }
    elegir(mapa.centro(), pos => {
      if (!pos) return;
      posNueva = pos;
      ir('#nuevo-punto/recuerdos', false, { capa: true });
    });
  }
  function verRecuerdo(p) {
    if (p.lat == null) { if (editando) ir('#punto/recuerdos/' + p.id, false, { capa: true }); else toast('Este recuerdo no tiene ubicación'); return; }
    window.scrollTo({ top: 0, behavior: menosMov.matches ? 'auto' : 'smooth' });
    mapa.volar(p.lat, p.lng, 16);
    setTimeout(() => { ventanaPunto(rec, p); mapa.resaltar('recuerdos/' + p.id); }, menosMov.matches ? 0 : 850);
  }

  /* ---------- Menú del mapa: filtrar por viaje ---------- */
  const menu = $('#m-menu');
  let menuBoton = null;
  mapa.alFiltro = b => { if (!menu.hidden && menuBoton === b) cerrarMenu(); else { cerrarBusca(); cerrarMenu(); abrirMenu(b); } };
  /* El desplegable se abre entre las dos columnas de botones, sin taparlas */
  function colocarMenu(b) {
    const caja = menu.parentElement.getBoundingClientRect(), col = b.parentElement.getBoundingClientRect(),
      izq = $('.m-izq', menu.parentElement), tope = izq ? izq.getBoundingClientRect().right + 8 : caja.left + 10;
    menu.style.right = Math.round(caja.right - col.left + 8) + 'px';
    menu.style.width = Math.round(Math.min(250, col.left - 8 - tope)) + 'px'; /* sin tapar la columna de la izquierda */
  }
  function abrirMenu(b) {
    menuBoton = b;
    colocarMenu(b);
    const actual = viajeActual ? viajeActual.id : enMapa, nums = numeros();
    menu.innerHTML = '<p class="m-menu-t">Ver viajes</p>' +
      '<button type="button" data-filtro="" aria-pressed="' + !actual + '">' + ico('mundo') + 'Todos los viajes</button>' +
      ordenados().map(v => '<button type="button" data-filtro="' + v.id + '" aria-pressed="' + (actual === v.id) + '">' +
        '<span class="m-menu-n">' + nums.get(v.id) + '</span>' + esc(v.titulo) + '</button>').join('');
    menu.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    const s = $('[aria-pressed="true"]', menu) || $('button', menu);
    s.focus();
  }
  function abrirCapas(b) {
    menuBoton = b;
    colocarMenu(b);
    menu.innerHTML = '<p class="m-menu-t">Mapa base</p>' + mapa.bases().map(x =>
      '<button type="button" data-base="' + x.k + '" aria-pressed="' + x.activa + '"><span class="sw" data-b="' + x.k + '" aria-hidden="true"><i></i></span>' + x.nombre + '</button>').join('');
    menu.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    $('[aria-pressed="true"]', menu).focus();
  }
  mapa.alCapa = b => { if (!menu.hidden && menuBoton === b) cerrarMenu(); else { cerrarBusca(); cerrarMenu(); abrirCapas(b); } };
  function cerrarMenu(volver) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (menuBoton) { menuBoton.setAttribute('aria-expanded', 'false'); if (volver) menuBoton.focus(); }
  }
  menu.addEventListener('click', e => {
    const cb = e.target.closest('[data-base]');
    if (cb) { mapa.base(cb.dataset.base); cerrarMenu(true); return; }
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    const id = b.dataset.filtro;
    cerrarMenu();
    if (viajeActual) { ir(id ? '#v/' + id : HASH[tab]); return; }
    if (!id) { verTodosViajes(); return; }
    if (tab !== 'viajes') { ir('#v/' + id); return; }
    seguir = true;
    const t = $('#ficha-' + id);
    if (t) { irFicha(t); mapaViaje(porId(id), true); }
  });
  /* Tocar otro botón (o fuera) cierra el buscador y los desplegables; al volver a abrir el buscador siguen sus resultados */
  document.addEventListener('pointerdown', e => {
    if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-m="filtro"], [data-m="capa"]')) cerrarMenu();
    if (!busca.hidden && !busca.contains(e.target) && !e.target.closest('[data-m="buscar"]')) cerrarBusca();
  });

  /* ---------- Portada: pestañas deslizables Viajes / Fotos ---------- */
  function pestanas() {
    const nf = datos.reduce((s, v) => s + conFoto(v).length, 0), nr = rec.puntos.length;
    const t = (id, i, n, txt) => '<a class="tab" href="' + HASH[id] + '" data-tab="' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' +
      '<span class="ci">' + ico(i) + '</span><b>' + n + '</b><small>' + txt + '</small></a>';
    return '<nav class="tabs" aria-label="Ver">' +
      t('viajes', 'pin', datos.length, datos.length === 1 ? 'viaje' : 'viajes') +
      t('fotos', soloFav ? 'corazon' : 'foto', nf, nf === 1 ? 'foto' : 'fotos') + /* con el corazón encendido, su icono es el corazón */
      t('rec', 'recuerdo', nr, nr === 1 ? 'recuerdo' : 'recuerdos') +
      '<i class="tab-barra" aria-hidden="true"></i></nav>';
  }
  const BOLA = '<span class="cz-b" aria-hidden="true">' + ico('corazon') + '</span>'; /* corazón pequeño de las fotos favoritas */
  const anioIni = { fotos: 0, rec: 0 }; /* primer año visible en cada fila de años */
  const corazon = (cls, attr, on, etiqueta) => '<button type="button" class="' + cls + ' cz" ' + attr + ' aria-pressed="' + !!on + '" aria-label="' + etiqueta + '">' + ico('corazon') + '</button>';
  /* Vista de Fotos y Recuerdos: lista o mosaico (se recuerda) */
  const vistas = { fotos: LS.leer('vista-fotos') === 'mosaico' ? 'mosaico' : 'lista', rec: LS.leer('vista-rec') === 'mosaico' ? 'mosaico' : 'lista' };
  const cambioVista = (que, et) => '<div class="vista-sw" role="group" aria-label="' + et + '">' +
    ['lista', 'mosaico'].map(k => '<button type="button" class="ib ib-s" data-vista="' + que + ':' + k + '" aria-pressed="' + (vistas[que] === k) + '" aria-label="Ver en ' + k + '">' + ico(k) + '</button>').join('') + '</div>';
  const tituloCon = (t, extra) => '<div class="fi-top"><h2 class="ttl">' + t + '</h2><div class="fi-der">' + extra + '</div></div>';

  function adjuntoFila(v, a, j) {
    const img = a.tipo === 'img', ext = (a.f.split('.').pop() || '').toUpperCase();
    return '<div class="adj"><span class="adj-th">' + (img ? '<img src="' + src(a.f) + '" alt="" loading="lazy">' : ico('doc') + '<i>' + esc(ext) + '</i>') + '</span>' +
      '<span class="adj-n">' + esc(a.n || a.f) + '</span>' +
      '<a class="pill" href="' + src(a.f) + '" target="_blank" rel="noopener">Ver</a>' +
      (editando ? '<button type="button" class="ib" data-adj-quitar="' + v.id + '/' + j + '" aria-label="Quitar ' + esc(a.n || a.f) + '">' + ico('x') + '</button>' : '') + '</div>';
  }
  function filaEnlace(e) {
    return '<div class="f-enl"><input type="text" name="et" placeholder="Texto (p. ej. Álbum de iCloud)" value="' + esc(e.t) + '" aria-label="Texto del enlace">' +
      '<input type="url" name="eu" placeholder="https://…" value="' + esc(e.u) + '" aria-label="Dirección del enlace">' +
      '<button type="button" class="ib" data-f="quitar-enl" aria-label="Quitar enlace">' + ico('x') + '</button></div>';
  }
  const textoPos = (p, vacio) => p ? 'Ubicación: ' + coord(p) : vacio;
  const listaAdjuntos = v => adjuntosDe(v).map((x, j) => adjuntoFila(v, x, j)).join('') || '<p class="fi-nof">Sin archivos adjuntos todavía</p>';
  function formFicha(v) {
    const enl = (v.enlaces && v.enlaces.length) ? v.enlaces : [{ t: '', u: '' }];
    const p = v.lat != null ? { lat: v.lat, lng: v.lng } : null, cp = centroPuntos(v);
    return '<form class="fi-form" data-id="' + v.id + '" novalidate' + (p ? ' data-lat="' + p.lat + '" data-lng="' + p.lng + '"' : '') + '>' +
      '<label class="campo">Destino o título *<input name="titulo" type="text" required maxlength="80" value="' + esc(v.nueva ? '' : v.titulo) + '" placeholder="Por ejemplo: Lisboa"></label>' +
      '<label class="campo">Lugar<input name="lugar" type="text" maxlength="100" value="' + esc(v.lugar) + '" placeholder="Ciudad, país"></label>' +
      '<label class="campo">Itinerario (opcional): lugares separados por comas<input name="itinerario" type="text" maxlength="200" value="' + esc(v.itinerario) + '" placeholder="Wynwood, Bayside, Miami Beach"></label>' +
      '<div class="dos"><label class="campo">Desde (ida)<input name="desde" type="date" value="' + esc(v.desde) + '"></label>' +
      '<label class="campo">Hasta (vuelta)<input name="hasta" type="date" value="' + esc(v.hasta) + '"></label></div>' +
      '<label class="campo">Recuerdo del viaje<textarea name="texto" rows="3" maxlength="1500" placeholder="Qué hicimos, qué no olvidar">' + esc(v.texto) + '</textarea></label>' +
      '<fieldset class="campo"><legend>Enlaces (álbum de iCloud, vídeo, blog…)</legend><div class="f-enlaces">' + enl.map(filaEnlace).join('') + '</div>' +
      '<button type="button" class="pill" data-f="mas-enl">' + ico('mas') + 'Añadir enlace</button></fieldset>' +
      '<fieldset class="campo"><legend>Sitio del viaje en el mapa</legend><p class="nota f-pos">' + textoPos(p, 'Sin ubicación. Si añades fotos con GPS se pone sola.') + '</p><div class="pills">' +
      '<button type="button" class="pill" data-f="elegir">' + ico('diana') + 'Elegir en el mapa</button>' +
      (cp ? '<button type="button" class="pill" data-f="desde-puntos">' + ico('foto') + 'Centro de las fotos</button>' : '') + '</div></fieldset>' +
      '<fieldset class="campo"><legend>Archivos adjuntos (billetes, reservas, mapas…)</legend><div class="f-adj">' + listaAdjuntos(v) + '</div>' +
      '<button type="button" class="pill" data-f="adjuntar">' + ico('clip') + 'Adjuntar imagen o PDF</button></fieldset>' +
      '<p class="error" role="alert" hidden></p>' +
      (v.traer ? '<p class="nota">El viaje se crea con <b>' + esc(nombrePunto(v.traer.p)) + '</b> dentro.</p>' : '') +
      '<div class="h-pie">' + (v.nueva ? '' : '<button type="button" class="pill peligro" data-f="borrar"><span>Quitar viaje</span></button>') +
      '<button type="button" class="pill" data-f="cerrar">Cancelar</button><button type="submit" class="pill pri">Guardar</button></div></form>';
  }
  function ficha(v, num, total) {
    const fs = conFoto(v), n = dias(v), a = aFecha(v.desde), b = aFecha(v.hasta) || a;
    const lug = lugaresDe(v), adj = adjuntosDe(v);
    let h = '<article class="fi" id="ficha-' + v.id + '" data-id="' + v.id + '" role="group" aria-label="Viaje ' + num + ' de ' + total + '">' +
      '<div class="fi-cab"><span class="num-v" aria-hidden="true"><small>Viaje</small><span class="fi-n">' + num + '</span></span><span class="fi-t">' + ico('reloj') + cuando(v) + '</span></div>' +
      '<h3 class="fi-tit"><a href="#v/' + v.id + '">' + esc(v.titulo) + '</a></h3>' +
      '<div class="fi-fechas">' + ico('cal') + (a ? '<span class="fi-r"><small>Del</small><b>' + diaMes(a) + '</b><small>al</small><b>' + diaMes(b) + ' ' + b.getUTCFullYear() + '</b></span>' +
        '<span class="fi-d"><b>' + n + '</b><small>' + (n === 1 ? 'día' : 'días') + '</small></span>' : '<span class="fi-r"><small>Sin fechas todavía</small></span>') + '</div>' +
      ovalos(lug.length ? lug : (v.lugar ? [v.lugar] : [])) +
      (v.texto ? '<p class="fi-txt">' + esc(v.texto) + '</p>' : '') + '<hr class="fi-hr">';
    if (fs.length) {
      const mini = soloFav ? fs.filter(p => p.fav).concat(fs.filter(p => !p.fav)) : fs; /* en modo corazón, las favoritas primero */
      h += '<a class="fi-fotos" href="#v/' + v.id + '" aria-label="Ver las ' + fs.length + ' fotos de ' + esc(v.titulo) + ' y su mapa">' +
        mini.slice(0, 4).map(p => '<span class="mini' + (p.fav ? ' fav' : '') + '"><img src="' + src(p.f) + '" alt="" loading="lazy">' + BOLA + '</span>').join('') +
        '<span class="fi-fotos-t">' + ico('foto') + plural(fs.length, 'foto', 'fotos') + ' y mapa</span></a>';
    } else {
      h += '<a class="fi-sin" href="#v/' + v.id + '">' + ico('foto') + 'Sin fotos todavía · abrir el viaje</a>';
    }
    h += '<hr class="fi-hr"><div class="fi-adj">' + (adj.length ? adj.map((x, j) => adjuntoFila(v, x, j)).join('') : '<p class="fi-nof">Sin archivos adjuntos todavía</p>') + '</div>';
    if (editando) {
      h += '<div class="fi-bar"><button type="button" class="ib" data-adjuntar="' + v.id + '" aria-label="Adjuntar archivo a ' + esc(v.titulo) + '" title="Adjuntar archivo">' + ico('clip') + '</button>' +
        '<button type="button" class="pill fi-mod" data-modificar="' + v.id + '" aria-haspopup="dialog">' + ico('lapiz') + 'Modificar</button></div>';
    }
    return h + '</article>';
  }
  function pintarFichas() {
    const ord = ordenados(), nums = numeros();
    let h = '<div class="fi-top"><h2 class="ttl">Mis viajes</h2>' +
      '<button type="button" class="pill fi-add" data-nuevo-viaje><span class="vp" aria-hidden="true">' + ico('mas') + '</span>Añadir viaje</button></div>';
    h += '<div class="carr"><div class="pista" tabindex="0" role="region" aria-label="Mis viajes. Desliza para ver más">' +
      ord.map(v => ficha(v, nums.get(v.id), ord.length)).join('') +
      '<button type="button" class="fi fi-plus" data-nuevo-viaje><span class="pl" aria-hidden="true">' + ico('mas') + '</span><b>Añadir viaje</b><small>Destino, fechas y fotos</small></button>' +
      '</div><div class="puntos-carr"><button type="button" class="pill fi-nav" data-paso="-1">' + ico('izq') + 'Anterior</button><span class="dots">' + ord.map((v, i) => '<button type="button" class="dot" data-ir="' + i + '" aria-label="Ir al viaje ' + nums.get(v.id) + '"></button>').join('') +
      '<button type="button" class="dot dot-mas" data-ir="' + ord.length + '" aria-label="Ir a añadir viaje"></button></span><button type="button" class="pill fi-nav" data-paso="1">Siguiente' + ico('der') + '</button></div></div>';
    if (!ord.length) h += '<p class="nota centro">' + (modo === 'mios' ? 'Aún no tienes viajes. Pulsa «Añadir viaje» para crear el primero.' : '') + '</p>';
    return h;
  }
  function filaViaje(v, num) {
    const p = portada(v), n = conFoto(v).length;
    return '<li><a class="viaje" href="#v/' + v.id + '" data-id="' + v.id + '" aria-label="Viaje ' + num + ': ' + esc(v.titulo) + '">' +
      '<span class="num-v" aria-hidden="true"><small>Viaje</small><span class="fi-n fi-n-s">' + num + '</span></span>' +
      (p ? '<img src="' + src(p) + '" alt="" loading="lazy">' : '<span class="ph">' + ico('pin') + '</span>') +
      '<span class="vi"><b>' + esc(v.titulo) + '</b>' + ovalos(v.lugar ? [v.lugar] : [], 'mini') +
      '<small>' + [rango(v), n ? plural(n, 'foto', 'fotos') : 'sin fotos'].filter(Boolean).join(' · ') + '</small></span></a></li>';
  }
  function pintarFotos() {
    const lista = ordenados();
    const anios = [...new Set(lista.map(anio).filter(Boolean))];
    if (filtro && anios.indexOf(filtro) < 0) filtro = '';
    const vis = visFotos();
    let h = tituloCon('Nuestras fotos', lista.length ? cambioVista('fotos', 'Ver las fotos en lista o en mosaico') : '');
    if (!lista.length) return h + '<div class="vacio">' + ico('foto') + '<p>Aún no hay fotos.</p></div>';
    h += filtrosAnios(anios, filtro, 'fotos');
    if (!vis.length) return h + '<div class="vacio">' + ico('corazon') + '<p>' + (soloFav ? 'No hay fotos favoritas en este año.' : 'No hay viajes en este año.') + '</p></div>';
    if (vistas.fotos === 'mosaico') return h + mosaicoFotos();
    const num = numeros();
    let ultimo = null;
    h += '<ul class="lista">';
    vis.forEach(v => {
      const a = anio(v) || 'Sin fecha';
      if (a !== ultimo && !filtro) { h += '<li class="anio" aria-hidden="true">' + a + '</li>'; ultimo = a; }
      h += filaViaje(v, num.get(v.id));
    });
    return h + '</ul>';
  }
  /* Todos · corazón · años (con flechas y deslizando) */
  function filtrosAnios(anios, sel, que) {
    let h = '';
    const nA = Math.min(panel.clientWidth || innerWidth, innerWidth) < 370 ? 1 : 2, k = anios.indexOf(sel);
    let ini = anioIni[que];
    if (k >= 0 && k < ini) ini = k; else if (k >= ini + nA) ini = k - nA + 1;
    ini = anioIni[que] = Math.max(0, Math.min(ini, anios.length - nA));
    /* Las flechas seleccionan el año de al lado, de uno en uno: Todos › 2025 › 2024 › … */
    const flecha = (d, i, off, et) => '<button type="button" class="ib ib-s" data-anios="' + d + '"' + (off ? ' disabled' : '') + ' aria-label="' + et + '">' + ico(i) + '</button>';
    /* «Todos» solo está marcado sin año ni corazón */
    h += '<div class="anios" role="group" aria-label="Filtrar las fotos">' +
      '<div class="anios-f"><button type="button" class="pill suave" data-anio="" aria-pressed="' + (!sel && !soloFav) + '">Todos</button>' +
      corazon('czb', 'data-fav-modo', soloFav, 'Modo corazón: solo las favoritas') + '</div>' +
      '<div class="anios-a" aria-label="Años. Desliza o usa las flechas">' + flecha(-1, 'izq', !sel, k > 0 ? 'Año ' + anios[k - 1] : 'Todos los años') +
      anios.slice(ini, ini + nA).map(a => '<button type="button" class="pill" data-anio="' + a + '" aria-pressed="' + (sel === a) + '">' + a + '</button>').join('') +
      flecha(1, 'der', k >= anios.length - 1, k + 1 < anios.length ? 'Año ' + anios[k + 1] : 'No hay años anteriores') + '</div></div>';
    return h;
  }
  /* Mosaico: todas las fotos de los viajes visibles, en cuadros y por años; con el corazón, solo las favoritas */
  const listaMosaico = guarda => {
    const fs = [];
    visFotos().forEach(v => conFoto(v).forEach(p => { if (!soloFav || p.fav || p === guarda) fs.push({ v, p }); }));
    return fs;
  };
  const cuadro = (o, sec) => '<button type="button" class="ft' + (o.p.fav ? ' fav' : '') + '" data-v="' + o.v.id + '" data-p="' + o.p.id + '" data-sec="' + sec + '">' +
    (o.p.f ? '<img src="' + src(o.p.f) + '" alt="' + esc(nombrePunto(o.p) + (o.v.recuerdos ? '' : ' · ' + o.v.titulo)) + '" loading="lazy" decoding="async">' + BOLA
      : '<span class="ft-ph">' + ico('recuerdo') + '<small>' + esc(nombrePunto(o.p)) + '</small></span>') + '</button>';
  function mosaicoFotos() {
    const fs = listaMosaico();
    if (!fs.length) return '<div class="vacio">' + ico('foto') + '<p>Aún no hay fotos en estos viajes.</p></div>';
    let h = '', ultimo = null;
    fs.forEach(o => {
      const a = anio(o.v) || 'Sin fecha';
      if (a !== ultimo) { h += (ultimo === null ? '' : '</div>') + (filtro ? '' : '<p class="anio-m" aria-hidden="true">' + a + '</p>') + '<div class="galeria">'; ultimo = a; }
      h += cuadro(o, 'mosaico');
    });
    return h + '</div>';
  }
  /* ---------- Recuerdos: sitios sueltos, en lista o mosaico; con el corazón, solo los favoritos ---------- */
  const fechaP = p => p.fecha || '';
  const anioP = p => fechaP(p).slice(0, 4);
  const aniosRec = () => [...new Set(rec.puntos.map(anioP).filter(Boolean))].sort().reverse();
  const listaRec = guarda => rec.puntos.filter(p => p === guarda || ((!soloFav || p.fav) && (!filtroRec || anioP(p) === filtroRec)))
    .slice().sort((a, b) => cmp(fechaP(b), fechaP(a))).map(p => ({ v: rec, p }));
  function pintarRecuerdos() {
    const todos = rec.puntos.length, rs = listaRec();
    let h = tituloCon('Recuerdos', (todos ? cambioVista('rec', 'Ver los recuerdos en lista o en mosaico') : '') +
      '<button type="button" class="pill fi-add" data-nuevo-rec><span class="vp" aria-hidden="true">' + ico('mas') + '</span>Nuevo</button>');
    if (!todos) {
      return h + '<div class="vacio">' + ico('recuerdo') + '<p><b>Sitios que no son un viaje:</b> una escapada, una cena, un paseo… ' +
        'Mantén el dedo pulsado en el mapa (en el ordenador, clic derecho) o búscalo con la lupa y elige «Guardar como recuerdo».</p></div>';
    }
    const anios = aniosRec();
    if (filtroRec && anios.indexOf(filtroRec) < 0) filtroRec = '';
    h += filtrosAnios(anios, filtroRec, 'rec');
    if (!rs.length) return h + '<div class="vacio">' + ico('corazon') + '<p>' + (soloFav ? 'No hay recuerdos favoritos' + (filtroRec ? ' en este año.' : '.') : 'No hay recuerdos en este año.') + '</p></div>';
    /* Por años, como Fotos: en mosaico o en lista */
    const cab = p => { const a = anioP(p) || 'Sin fecha'; if (filtroRec || a === cab.u) return ''; cab.u = a; return a; };
    if (vistas.rec === 'mosaico') {
      let m = '';
      rs.forEach(o => { const a = cab(o.p); if (a) m += (m ? '</div>' : '') + '<p class="anio-m" aria-hidden="true">' + a + '</p><div class="galeria">'; else if (!m) m = '<div class="galeria">'; m += cuadro(o, 'rec'); });
      return h + m + '</div>';
    }
    return h + '<ul class="lista">' + rs.map(({ p }) => { const a = cab(p); return (a ? '<li class="anio" aria-hidden="true">' + a + '</li>' : '') +
      '<li><button type="button" class="viaje viaje-r' + (p.fav ? ' fav' : '') + '" data-rec="' + p.id + '">' +
      (p.f ? '<img src="' + src(p.f) + '" alt="" loading="lazy">' : '<span class="ph">' + ico('recuerdo') + '</span>') +
      '<span class="vi"><b>' + esc(nombrePunto(p)) + '</b><small>' + [fechaTxt(p.fecha), p.nombre && p.txt ? p.txt : '', p.lat == null ? 'Sin ubicación' : ''].filter(Boolean).map(esc).join(' · ') + '</small></span>' +
      (p.fav ? BOLA : '') + '</button></li>'; }).join('') + '</ul>';
  }
  function pintarInicio() {
    viajeActual = null;
    panel.innerHTML = pestanas() + '<div class="pager">' +
      '<section class="pag" data-pag="viajes" aria-label="Viajes">' + pintarFichas() + '</section>' +
      '<section class="pag" data-pag="fotos" aria-label="Fotos">' + pintarFotos() + '</section>' +
      '<section class="pag" data-pag="rec" aria-label="Recuerdos">' + pintarRecuerdos() + '</section></div>';
    altoMapa();
    prepararPager();
    prepararCarrusel();
    mapaInicio();
  }

  /* El paginador horizontal: deslizar entre Viajes y Fotos */
  const pager = () => $('.pager', panel);
  function altoPager() {
    const pg = pager();
    if (!pg) return;
    const p = $('[data-pag="' + tab + '"]', pg);
    pg.style.height = p.offsetHeight + 'px';
  }
  function marcarTab() {
    panel.querySelectorAll('.tab').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    panel.querySelectorAll('.pag').forEach(p => p.setAttribute('aria-hidden', p.dataset.pag === tab ? 'false' : 'true'));
  }
  /* La rayita bajo la pestaña sigue al dedo; las pestañas pueden tener anchos distintos */
  function moverBarra(r) {
    const b = $('.tab-barra', panel), ts = [...panel.querySelectorAll('.tabs .tab')];
    if (!b || !ts.length) return;
    r = Math.min(ts.length - 1, Math.max(0, r));
    const i = Math.floor(r), f = r - i, a = ts[i], c = ts[Math.min(i + 1, ts.length - 1)];
    b.style.width = (a.offsetWidth + (c.offsetWidth - a.offsetWidth) * f).toFixed(1) + 'px';
    b.style.transform = 'translateX(' + (a.offsetLeft + (c.offsetLeft - a.offsetLeft) * f).toFixed(1) + 'px)';
  }
  function verTab(t, animar) {
    const pg = pager();
    if (!pg) return;
    const cambia = t !== tab;
    tab = t;
    marcarTab();
    altoPager();
    pg.scrollTo({ left: TABS.indexOf(t) * pg.clientWidth, behavior: animar && !menosMov.matches ? 'smooth' : 'auto' });
    if (cambia) mapaInicio();
  }
  function prepararPager() {
    const pg = pager();
    marcarTab();
    pg.scrollLeft = TABS.indexOf(tab) * pg.clientWidth;
    altoPager();
    moverBarra(TABS.indexOf(tab));
    /* Solo un gesto reciente de la persona puede cambiar de pestaña al deslizar; no los reajustes de la página */
    let t0 = 0, gesto = false, tGesto = 0;
    const conGesto = () => { gesto = true; clearTimeout(tGesto); };
    const finGesto = () => { clearTimeout(tGesto); tGesto = setTimeout(() => { gesto = false; }, 900); };
    ['pointerdown', 'touchstart'].forEach(ev => pg.addEventListener(ev, conGesto, { passive: true }));
    ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(ev => pg.addEventListener(ev, finGesto, { passive: true }));
    pg.addEventListener('wheel', () => { conGesto(); finGesto(); }, { passive: true });
    pg.addEventListener('scroll', () => {
      moverBarra(pg.scrollLeft / Math.max(1, pg.clientWidth));
      clearTimeout(t0);
      t0 = setTimeout(() => {
        const r = pg.scrollLeft / Math.max(1, pg.clientWidth);
        if (Math.abs(r - Math.round(r)) > 0.02) return; /* aún se está moviendo */
        const t = TABS[Math.round(r)];
        if (!t || t === tab) return;
        if (!gesto) { pg.scrollLeft = TABS.indexOf(tab) * pg.clientWidth; return; } /* lo movió el navegador al recolocar la página */
        gesto = false;
        tab = t;
        marcarTab();
        altoPager();
        history.replaceState(history.state, '', HASH[t] === '#' ? location.pathname + location.search : HASH[t]);
        aplicado = location.hash;
        mapaInicio();
      }, 90);
    }, { passive: true });
    pg.querySelectorAll('.pag').forEach(p => new ResizeObserver(altoPager).observe(p));
    /* Deslizar también sobre las pestañas */
    const tabs = $('.tabs', panel);
    let x0 = null;
    tabs.addEventListener('pointerdown', e => { x0 = e.clientX; });
    tabs.addEventListener('pointerup', e => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      tabs.dataset.barrido = '1';
      setTimeout(() => { delete tabs.dataset.barrido; }, 50);
      const n = TABS.indexOf(tab) + (dx < 0 ? 1 : -1);
      if (TABS[n]) ir(HASH[TABS[n]], true);
    });
    tabs.addEventListener('click', e => { if (tabs.dataset.barrido) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* Carrusel de fichas */
  function fichaActual() {
    const pista = $('.pista', panel);
    if (!pista) return null;
    const c = pista.scrollLeft + pista.clientWidth / 2;
    let k = null, mejor = Infinity;
    [...pista.children].forEach(f => { const d = Math.abs(f.offsetLeft + f.offsetWidth / 2 - c); if (d < mejor) { mejor = d; k = f; } });
    return k;
  }
  /* Ir a una ficha y enseñar su viaje en el mapa, aunque ya fuera la de delante */
  function enfocarFicha(el) {
    seguir = true;
    if (el === fichaActual()) {
      if (el.dataset.id) mapaViaje(porId(el.dataset.id), true); else mapaTodos(datos, tocarViaje, soloFav);
    } else irFicha(el);
  }
  function irFicha(el, sinAnimar) {
    const pista = el.parentElement;
    pista.scrollTo({ left: el.offsetLeft - (pista.clientWidth - el.offsetWidth) / 2, behavior: sinAnimar || menosMov.matches ? 'auto' : 'smooth' });
  }
  function prepararCarrusel() {
    const pista = $('.pista', panel);
    if (!pista) return;
    const fichas = [...pista.children], dots = [...panel.querySelectorAll('.dot')];
    const add = $('.fi-add', panel), mas = $('.fi-plus', pista);
    /* El botón fijo «Añadir viaje» se atenúa en cuanto empieza a asomar la ficha punteada */
    const atenuar = () => { if (add && mas) add.classList.toggle('tenue', mas.offsetLeft + 10 <= pista.scrollLeft + pista.clientWidth); };
    let cola = 0, actual = null, tMapa = 0;
    const marcar = () => {
      cola = 0;
      const f = fichaActual(), k = fichas.indexOf(f);
      dots.forEach((d, i) => d.setAttribute('aria-current', i === k ? 'true' : 'false'));
      if (!f) return;
      atenuar();
      if (f === actual) return;
      actual = f;
      clearTimeout(tMapa);
      if (tab === 'viajes' && seguir) tMapa = setTimeout(() => { if (f.dataset.id) mapaViaje(porId(f.dataset.id), true); else mapaTodos(datos, tocarViaje, soloFav); }, 160);
    };
    pista.addEventListener('scroll', () => { if (!cola) cola = requestAnimationFrame(marcar); }, { passive: true });
    ['pointerdown', 'wheel', 'keydown'].forEach(ev => pista.addEventListener(ev, () => { seguir = true; }, { passive: true }));
    const objetivo = fichaVer && $('#ficha-' + fichaVer);
    if (objetivo) irFicha(objetivo, true);
    fichaVer = null;
    actual = fichaActual();
    atenuar();
    const k = fichas.indexOf(actual);
    dots.forEach((d, i) => d.setAttribute('aria-current', i === k ? 'true' : 'false'));
  }

  /* ---------- Detalle de un viaje: fotos, lugares y mapa ---------- */
  function pintarViaje(v) {
    viajeActual = v;
    const fs = conFoto(v), lugares = puntosDe(v).filter(p => !p.f), n = dias(v), ord = ordenados(), k = ord.indexOf(v);
    const sinUbic = fs.filter(p => p.lat == null).length;
    const enl = (v.enlaces || []).filter(e => e && e.u);
    let h = '<a class="pill volver" href="' + HASH[tab] + '">' + ico('izq') + { viajes: 'Volver a mis viajes', fotos: 'Volver a todas las fotos' }[tab] + '</a>';
    h += '<h2 class="ttl">' + esc(v.titulo) + '</h2><div class="meta">' +
      (v.desde ? '<span>' + ico('cal') + rango(v) + (n > 1 ? ' · ' + n + ' días' : '') + '</span>' : '') + '</div>' +
      ovalos(lugaresDe(v).length ? lugaresDe(v) : (v.lugar ? [v.lugar] : []));
    if (v.texto) h += '<p class="texto">' + esc(v.texto).replace(/\n/g, '<br>') + '</p>';
    if (enl.length) {
      h += '<div class="pills enlaces">' + enl.map(e => '<a class="pill" href="' + esc(e.u) + '" target="_blank" rel="noopener">' +
        ico('enlace') + esc(e.t || 'Enlace') + '</a>').join('') + '</div>';
    }
    if (editando) {
      h += '<div class="pills acciones">' +
        '<button type="button" class="pill pri" data-accion="fotos">' + ico('foto') + 'Añadir fotos</button>' +
        '<button type="button" class="pill" data-accion="punto">' + ico('diana') + 'Nuevo punto</button>' +
        '<button type="button" class="pill" data-modificar="' + v.id + '" aria-haspopup="dialog">' + ico('lapiz') + 'Editar ficha</button></div>' +
        '<p class="nota">Añadir fotos te deja elegir de la <b>Fototeca</b>, hacer una con la <b>cámara</b> o cogerlas de <b>Archivos</b> (iCloud Drive, Google Drive…). En el ordenador también puedes arrastrarlas aquí. ' +
        'Arrastra los puntos del mapa para corregirlos.' +
        (sinUbic ? ' <b>' + plural(sinUbic, 'foto no tiene', 'fotos no tienen') + ' ubicación</b>: ábrela y pulsa «Colocar en el mapa».' : '') +
        ' Para que el iPhone guarde la ubicación: Fotos › Compartir › Opciones › <b>Ubicación</b> › Guardar en Archivos.</p>';
    }
    h += '<h3 class="ttl sub">Fotos<small>' + fs.length + '</small></h3>';
    if (fs.length) {
      h += '<div class="galeria">' + fs.map((p, i) => {
        const marca = editando && p.lat == null ? 'Sin ubicación' : '';
        return '<button type="button" class="ft' + (p.fav ? ' fav' : '') + '" data-p="' + p.id + '"' + (marca ? ' data-marca="' + marca + '"' : '') + '>' +
          '<img src="' + src(p.f) + '" alt="' + esc(p.nombre || p.txt || 'Foto ' + (i + 1) + ' de ' + v.titulo) + '" loading="lazy" decoding="async">' + BOLA + '</button>';
      }).join('') + '</div>';
    } else {
      h += '<div class="vacio">' + ico('foto') + '<p>' + (editando ? 'Pulsa «Añadir fotos» y elige las de este viaje.' : 'Este viaje aún no tiene fotos.') + '</p></div>';
    }
    if (lugares.length) {
      h += '<h3 class="ttl sub">Lugares<small>' + lugares.length + '</small></h3><ul class="lugares">' + lugares.map(p =>
        '<li><button type="button" data-lugar="' + p.id + '">' + ico('pin') + '<span><b>' + esc(nombrePunto(p)) + '</b>' +
        (p.txt && p.nombre ? '<small>' + esc(p.txt) + '</small>' : '') + (p.lat == null ? '<small>Sin ubicación</small>' : '') + '</span></button>' +
        (editando ? '<a class="ib" href="#punto/' + v.id + '/' + p.id + '" aria-label="Editar ' + esc(nombrePunto(p)) + '">' + ico('lapiz') + '</a>' : '') + '</li>').join('') + '</ul>';
    }
    const ant = ord[k + 1], sig = ord[k - 1];
    if (ant || sig) {
      h += '<nav class="paso" aria-label="Otros viajes">' +
        (ant ? '<a class="pill" href="#v/' + ant.id + '" data-desliza="i">' + ico('izq') + esc(ant.titulo) + '</a>' : '<span></span>') +
        (sig ? '<a class="pill" href="#v/' + sig.id + '" data-desliza="d">' + esc(sig.titulo) + ico('der') + '</a>' : '') + '</nav>';
    }
    panel.innerHTML = h;
    altoMapa();
    mapaViaje(v, true);
  }

  function pintarPanel(vista, v, forzar) {
    const key = vista + ':' + (v ? v.id : '') + ':' + filtro + ':' + filtroRec + ':' + editando + ':' + modo;
    if (key === vistaKey && !forzar) return;
    const cambiaVista = vistaKey.split(':').slice(0, 2).join(':') !== key.split(':').slice(0, 2).join(':');
    const pista = $('.pista', panel), x = pista ? pista.scrollLeft : 0;
    vistaKey = key;
    panel.classList.toggle('inicio', vista !== 'viaje');
    if (vista === 'viaje') pintarViaje(v); else pintarInicio();
    if (cambiaVista) { window.scrollTo(0, 0); panel.scrollTop = 0; }
    else { const p2 = $('.pista', panel); if (p2 && x) p2.scrollLeft = x; }
  }

  /* ===================== Navegación (historial) ===================== */
  let aplicado = null;
  function ruta() {
    const p = decodeURIComponent(location.hash.slice(1)).split('/');
    return { tipo: p[0] || 'inicio', id: p[1], p: p[2] };
  }
  function ir(h, reemplazar, estado) {
    if (h === '#') h = location.pathname + location.search;
    if (reemplazar) history.replaceState(estado || history.state, '', h);
    else history.pushState(estado || null, '', h);
    aplicar();
  }
  function cerrarCapa(base) {
    if (history.state && history.state.capa) history.back();
    else ir(base, true, {});
  }
  const CAPAS = /^#(ficha|punto|nuevo-punto|privado)\b/;
  function aplicar() {
    if (location.hash === aplicado) return;
    aplicado = location.hash;
    salirElegir();
    cerrarMenu();
    const r = ruta();
    const v = /^(v|ficha|punto|nuevo-punto)$/.test(r.tipo) ? porId(r.id) : null;
    const fv = r.tipo === 'ficha' ? (v || (fichaEd && fichaEd.id === r.id ? fichaEd : null)) : null;
    if (r.tipo === 'ficha') {
      /* Modificar se abre encima de lo que hubiera; si no se puede editar, se vuelve atrás */
      if (!fv || fv.recuerdos || !editando || modo !== 'mios') { ir(viajeActual ? '#v/' + viajeActual.id : HASH[tab], true, {}); return; }
      if (!vistaKey) pintarPanel('inicio', null);
    } else if (r.tipo === 'inicio' || r.tipo === 'fotos' || r.tipo === 'favoritos' || r.tipo === 'recuerdos') {
      const t = { inicio: 'viajes', fotos: 'fotos', favoritos: 'fotos', recuerdos: 'rec' }[r.tipo];
      if (vistaKey.indexOf('inicio:') === 0 && pager()) verTab(t, true);
      else { if (viajeActual) fichaVer = viajeActual.id; tab = t; pintarPanel('inicio', null); }
      if (r.tipo === 'favoritos' && !soloFav && nFav()) ponerFav(true); /* enlaces antiguos a #favoritos */
    } else if (v && v.recuerdos) {
      /* Fotos y puntos de Recuerdos: detrás, la pestaña Recuerdos */
      if (r.tipo === 'v' && !r.p) { ir('#recuerdos', true, {}); return; }
      if (vistaKey.indexOf('inicio:') === 0 && pager()) { if (tab !== 'rec') verTab('rec', false); }
      else { tab = 'rec'; pintarPanel('inicio', null); }
    } else if (v) pintarPanel('viaje', v);
    else if (!vistaKey || r.tipo === 'v') pintarPanel('inicio', null);
    const pf = r.tipo === 'v' && v && r.p ? puntoDe(v, r.p) : null;
    if (pf && pf.f) mostrarVisor(v, pf); else ocultarVisor();
    if (r.tipo === 'privado') abrirPrivado();
    else if (r.tipo === 'ficha') abrirFicha(fv);
    else if (r.tipo === 'punto' && v && puntoDe(v, r.p)) abrirPunto(v, puntoDe(v, r.p));
    else if (r.tipo === 'nuevo-punto' && v) abrirPunto(v, null);
    else ocultarHoja();
  }
  window.addEventListener('popstate', aplicar);
  window.addEventListener('hashchange', aplicar);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const h = a.getAttribute('href');
    if (h === location.hash || (h === '#' && !location.hash)) return;
    mapa.cerrarVentana();
    ir(h, false, CAPAS.test(h) ? { capa: true } : null);
  });

  /* ===================== Elegir un punto en el mapa ===================== */
  let eligiendo = null;
  function elegir(inicio, fin) {
    if (full) ponerFull(false);
    eligiendo = { fin, hoja: !hoja.hidden, visor: !visor.hidden, y: window.scrollY };
    hoja.hidden = true;
    visor.hidden = true;
    document.documentElement.classList.remove('bloq');
    document.body.classList.add('eligiendo');
    $('#elegir').hidden = false;
    window.scrollTo(0, 0);
    mapa.cerrarVentana();
    if (inicio) mapa.volar(inicio.lat, inicio.lng, Math.max(mapa.zoom(), 15));
    mapa.foco();
  }
  function salirElegir(pos) {
    if (!eligiendo) return;
    const e = eligiendo;
    eligiendo = null;
    document.body.classList.remove('eligiendo');
    $('#elegir').hidden = true;
    if (pos === undefined) return; /* se ha navegado a otra parte */
    if (e.hoja) hoja.hidden = false;
    if (e.visor) visor.hidden = false;
    if (e.hoja || e.visor) document.documentElement.classList.add('bloq');
    else window.scrollTo(0, e.y);
    e.fin(pos);
  }
  $('#elegir').addEventListener('click', e => {
    const b = e.target.closest('[data-elegir]');
    if (b) salirElegir(b.dataset.elegir === 'si' ? mapa.centro() : null);
  });

  /* ===================== Visor de fotos ===================== */
  const visor = $('#visor'), vImg = $('#visor-img');
  let vV = null, vP = null, vFoco = null, toqueX = null, barrido = false, confirmar = null, secModo = '';
  function abrirFoto(v, pid) { ir('#v/' + v.id + '/' + pid, false, { capa: true }); }
  function mostrarVisor(v, p) {
    if (visor.hidden && !eligiendo) {
      vFoco = document.activeElement;
      visor.hidden = false;
      document.documentElement.classList.add('bloq');
      $('[data-v="cerrar"]', visor).focus();
    }
    vV = v; vP = p;
    if (v.recuerdos) secModo = 'rec';
    let sec = secuencia(), n = sec.findIndex(o => o.p === p);
    if (n < 0) { secModo = ''; sec = secuencia(); n = sec.findIndex(o => o.p === p); }
    zoomPoner(1);
    vImg.src = src(p.f);
    vImg.alt = nombrePunto(p) + ' · ' + v.titulo;
    $('#visor-t').textContent = (secModo === 'rec' ? 'Recuerdos' : secModo === 'mosaico' ? 'Fotos' : v.titulo) + ' · ' + (n + 1) + ' / ' + sec.length +
      (secModo === 'mosaico' ? ' · ' + v.titulo : '');
    $('#visor-nombre').textContent = p.nombre || '';
    $('#visor-fecha').textContent = fechaTxt(p.fecha);
    $('#visor-txt').textContent = p.txt || '';
    $('[data-v="fav"]', visor).setAttribute('aria-pressed', !!p.fav);
    $('[data-v="mapa"]', visor).hidden = p.lat == null;
    $('[data-v="ant"]', visor).hidden = n <= 0;
    $('[data-v="sig"]', visor).hidden = n >= sec.length - 1;
    $('[data-v="portada"]', visor).hidden = !!v.recuerdos; /* un recuerdo no tiene portada; se borra desde «Editar» */
    $('[data-v="quitar"]', visor).hidden = !!v.recuerdos;
    $('[data-v="colocar"] span', visor).textContent = p.lat == null ? 'Colocar en el mapa' : 'Mover en el mapa';
    $('[data-v="portada"] span', visor).textContent = portada(v) === p.f ? 'Es la portada' : 'Usar de portada';
    confirmar = null;
    $('[data-v="quitar"] span', visor).textContent = 'Quitar foto';
    mapa.resaltar(p.id);
  }
  function ocultarVisor() {
    secModo = '';
    if (visor.hidden) return;
    visor.hidden = true;
    zoomPoner(1);
    vImg.removeAttribute('src');
    if (hoja.hidden) document.documentElement.classList.remove('bloq');
    mapa.resaltar(null);
    if (vFoco && vFoco.focus) vFoco.focus();
  }
  /* Las fotos por las que se pasa en el visor: las del viaje, las del mosaico de Fotos o las de Recuerdos */
  const secuencia = () => secModo === 'mosaico' ? listaMosaico(vP) : secModo === 'rec' ? listaRec(vP).filter(o => o.p.f) : conFoto(vV).map(p => ({ v: vV, p }));
  const baseVisor = () => vV && vV.recuerdos ? '#recuerdos' : '#v/' + vV.id;
  const repintar = v => { if (v.recuerdos) pintarPanel('inicio', null, true); else pintarPanel('viaje', v, true); };
  function cambiarFoto(d) {
    const fs = secuencia(), n = fs.findIndex(o => o.p === vP) + d;
    if (n < 0 || n >= fs.length) return;
    ir('#v/' + fs[n].v.id + '/' + fs[n].p.id, true);
  }
  visor.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) {
      if (e.target.classList.contains('v-escena') && !barrido) cerrarCapa(baseVisor());
      barrido = false;
      return;
    }
    const a = b.dataset.v, p = vP;
    if (a === 'cerrar') cerrarCapa(baseVisor());
    else if (a === 'zoom') zoomPoner(zS > 1 ? 1 : 2.5);
    else if (a === 'fav') {
      if (p.fav) delete p.fav; else p.fav = true;
      guardarFav();
      b.setAttribute('aria-pressed', !!p.fav);
      refrescarFav(p);
      toast(p.fav ? 'Añadida a favoritas' : 'Quitada de favoritas');
    }
    else if (a === 'ant') cambiarFoto(-1);
    else if (a === 'sig') cambiarFoto(1);
    else if (a === 'mapa') {
      cerrarCapa(baseVisor());
      window.scrollTo({ top: 0, behavior: menosMov.matches ? 'auto' : 'smooth' });
      mapa.volar(p.lat, p.lng, 17);
      setTimeout(() => mapa.resaltar(p.id), 900);
    } else if (a === 'editar') {
      ir('#punto/' + vV.id + '/' + p.id, true);
    } else if (a === 'colocar') {
      const v = vV;
      elegir(p.lat != null ? p : posicion(v), pos => {
        if (!pos) return;
        p.lat = pos.lat; p.lng = pos.lng;
        if (!v.recuerdos) completarViaje(v);
        guardar();
        repintar(v);
        mostrarVisor(v, p);
        toast('Foto colocada en el mapa');
      });
    } else if (a === 'portada') {
      vV.portada = p.f;
      guardar();
      pintarPanel('viaje', vV, true);
      mostrarVisor(vV, p);
      toast('Portada cambiada');
    } else if (a === 'quitar') {
      if (confirmar !== p.id) {
        confirmar = p.id;
        $('span', b).textContent = '¿Seguro? Toca otra vez';
        return;
      }
      const fs = conFoto(vV), n = fs.indexOf(p);
      vV.puntos.splice(vV.puntos.indexOf(p), 1);
      if (vV.portada === p.f) delete vV.portada;
      soltar(p.f);
      guardar();
      pintarPanel('viaje', vV, true);
      toast('Foto quitada del viaje');
      const resto = conFoto(vV);
      if (!resto.length) cerrarCapa('#v/' + vV.id);
      else ir('#v/' + vV.id + '/' + resto[Math.min(n, resto.length - 1)].id, true);
    }
  });
  /* Ampliar la foto: botón de la lupa, doble toque, pellizco o rueda; arrastrar para moverla */
  const escena = $('.v-escena', visor), dedos = new Map();
  let zS = 1, zX = 0, zY = 0, zIni = null, pIni = null;
  function zoomPoner(s, x, y) {
    zS = Math.max(1, Math.min(6, s));
    if (zS === 1) { zX = 0; zY = 0; }
    else {
      const mx = Math.max(0, (vImg.offsetWidth * zS - escena.clientWidth) / 2), my = Math.max(0, (vImg.offsetHeight * zS - escena.clientHeight) / 2);
      zX = Math.max(-mx, Math.min(mx, x == null ? zX : x));
      zY = Math.max(-my, Math.min(my, y == null ? zY : y));
    }
    vImg.style.transform = zS > 1 ? 'translate(' + zX.toFixed(1) + 'px,' + zY.toFixed(1) + 'px) scale(' + zS.toFixed(3) + ')' : '';
    visor.classList.toggle('zoom', zS > 1);
    const b = $('[data-v="zoom"]', visor);
    b.setAttribute('aria-pressed', zS > 1);
    b.setAttribute('aria-label', zS > 1 ? 'Quitar la ampliación' : 'Ampliar la foto');
  }
  const separacion = () => { const d = [...dedos.values()]; return Math.hypot(d[0].x - d[1].x, d[0].y - d[1].y); };
  escena.addEventListener('pointerdown', e => {
    if (e.target.closest('.v-btn')) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    barrido = false;
    if (dedos.size === 1) { toqueX = e.clientX; pIni = { x: e.clientX, y: e.clientY, zX, zY }; }
    else if (dedos.size === 2) { toqueX = null; zIni = { d: separacion() || 1, s: zS }; }
  });
  escena.addEventListener('pointermove', e => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 2 && zIni) { barrido = true; zoomPoner(zIni.s * separacion() / zIni.d); }
    else if (dedos.size === 1 && zS > 1 && pIni) {
      const dx = e.clientX - pIni.x, dy = e.clientY - pIni.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) barrido = true;
      zoomPoner(zS, pIni.zX + dx, pIni.zY + dy);
    }
  });
  const soltarDedo = e => {
    if (!dedos.has(e.pointerId)) return;
    dedos.delete(e.pointerId);
    if (dedos.size < 2) zIni = null;
    if (dedos.size) { const d = [...dedos.values()][0]; pIni = { x: d.x, y: d.y, zX, zY }; toqueX = null; return; }
    if (toqueX == null || zS > 1 || e.type === 'pointercancel') { toqueX = null; return; }
    const dx = e.clientX - toqueX;
    toqueX = null;
    if (Math.abs(dx) > 50) { barrido = true; cambiarFoto(dx < 0 ? 1 : -1); }
  };
  escena.addEventListener('pointerup', soltarDedo);
  escena.addEventListener('pointercancel', soltarDedo);
  escena.addEventListener('dblclick', e => { if (e.target === vImg) zoomPoner(zS > 1 ? 1 : 2.5); });
  escena.addEventListener('wheel', e => { e.preventDefault(); zoomPoner(zS * Math.exp(-e.deltaY * 0.002)); }, { passive: false });

  /* ===================== Hoja: punto, privado y copia ===================== */
  const hoja = $('#hoja'), caja = $('#hoja-caja');
  let hFoco = null, hModo = '', ed = null, posNueva = null, fechaNueva = '';
  function mostrarHoja(html, m) {
    if (hoja.hidden) { hFoco = document.activeElement; }
    hModo = m;
    caja.innerHTML = html;
    hoja.hidden = false;
    document.documentElement.classList.add('bloq');
    const pri = $('input, button', caja);
    if (pri) pri.focus();
  }
  function ocultarHoja() {
    if (ed && ed.nueva) URL.revokeObjectURL(ed.nueva.url);
    ed = null;
    if (fichaEd && fichaEd.nueva) adjuntosDe(fichaEd).forEach(a => soltar(a.f)); /* viaje nuevo sin guardar: fuera sus archivos */
    fichaEd = null;
    if (hoja.hidden) return;
    hoja.hidden = true;
    hModo = '';
    caja.innerHTML = '';
    if (visor.hidden) document.documentElement.classList.remove('bloq');
    if (hFoco && hFoco.focus) hFoco.focus();
  }
  const baseDe = v => v.recuerdos ? '#recuerdos' : '#v/' + v.id;
  const baseHoja = () => (ed ? baseDe(ed.v) : (viajeActual ? '#v/' + viajeActual.id : HASH[tab]));
  const cabecera = t => '<div class="h-cab"><h2 id="hoja-t" class="ttl">' + t + '</h2>' +
    '<button type="button" class="ib" data-f="cerrar" aria-label="Cerrar">' + ico('x') + '</button></div>';
  const error = (cont, msg) => { const e = $('.error', cont); e.textContent = msg; e.hidden = false; };

  function abrirFicha(v) {
    if (hModo === 'ficha' && fichaEd === v) return;
    fichaEd = v;
    mostrarHoja(cabecera(v.nueva ? 'Nuevo viaje' : 'Modificar viaje') + formFicha(v), 'ficha');
    if (v.nueva) $('[name="titulo"]', caja).focus();
  }
  function guardarFicha(form) {
    const r = leerFicha(form);
    if (r.error) { error(form, r.error); if (r.foco) form.elements[r.foco].focus(); return; }
    const v = fichaEd, d = r.d, nuevo = !!v.nueva;
    if (nuevo) {
      if (!adjuntosDe(v).length) v.id = idLibre(slug(d.titulo) + (d.desde ? '-' + d.desde.slice(0, 4) : ''));
      delete v.nueva;
      if (v.traer) { /* el punto (o recuerdo) con el que se creó el viaje */
        const { v: o, p } = v.traer;
        delete v.traer;
        if (o) { o.puntos.splice(o.puntos.indexOf(p), 1); if (p.f && o.portada === p.f) delete o.portada; }
        p.id = 'p1';
        v.puntos = [p];
      }
      datos.push(v);
    }
    ['titulo', 'lugar', 'itinerario', 'desde', 'hasta', 'texto'].forEach(c => { if (d[c]) v[c] = d[c]; else if (c !== 'titulo') delete v[c]; });
    if (d.enlaces.length) v.enlaces = d.enlaces; else delete v.enlaces;
    if (form.dataset.lat) { v.lat = +form.dataset.lat; v.lng = +form.dataset.lng; } else { delete v.lat; delete v.lng; }
    if (nuevo) completarViaje(v);
    guardar();
    const desde = viajeActual;
    cerrarCapa(baseHoja());
    if (desde && !nuevo) pintarPanel('viaje', desde, true);
    else { fichaVer = v.id; seguir = true; tab = 'viajes'; pintarPanel('inicio', null, true); }
    toast(nuevo ? 'Viaje creado' : 'Viaje guardado');
  }
  /* Quitar un adjunto (desde la ficha o desde Modificar) */
  function quitarAdjunto(v, j, b) {
    if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.classList.add('peligro'); b.setAttribute('aria-label', 'Toca otra vez para quitar'); return; }
    const x = v.adjuntos[j];
    v.adjuntos.splice(j, 1);
    if (!v.adjuntos.length) delete v.adjuntos;
    soltar(x.f);
    refrescarAdjuntos(v);
    toast('Archivo quitado');
  }
  function refrescarAdjuntos(v) {
    if (!v.nueva) {
      guardar();
      fichaVer = v.id;
      if (!viajeActual) pintarPanel('inicio', null, true);
    }
    const lista = hModo === 'ficha' && fichaEd === v && $('.f-adj', caja);
    if (lista) lista.innerHTML = listaAdjuntos(v); /* solo la lista: lo escrito en el formulario se queda */
  }
  function abrirPrivado() {
    if (hModo === 'privado') return;
    let h;
    if (modo === 'ejemplos') {
      h = cabecera('Tus viajes, solo en este dispositivo') +
        '<p>Lo que ves ahora son <b>viajes de ejemplo</b>, los que enseña la web pública.</p>' +
        '<ul class="pasos"><li>Tus viajes, fotos y archivos se guardan <b>solo en este dispositivo</b>. No se suben a GitHub ni a ningún sitio.</li>' +
        '<li>Haz una <b>copia de seguridad</b> de vez en cuando y guárdala donde quieras: una carpeta del ordenador, Archivos, iCloud Drive o Google Drive.</li>' +
        '<li>Con esa copia puedes <b>restaurarlo todo</b> en otro equipo (iPhone, Android u ordenador) o si borras la app.</li></ul>' +
        '<div class="lotes">' + (hayMios ? '<button type="button" class="pill pri" data-modo="mios">' + ico('pin') + 'Volver a mis viajes</button>'
          : '<button type="button" class="pill pri" data-f="empezar">' + ico('pin') + 'Empezar con mis viajes</button>') +
        '<button type="button" class="pill" data-f="restaurar">' + ico('subir') + 'Restaurar una copia</button></div>';
    } else {
      const u = LS.leer('copia'), n = referenciadas().size;
      h = cabecera('Copia de seguridad') +
        '<p>Tienes <b>' + plural(datos.length, 'viaje', 'viajes') + '</b> y <b>' + plural(n, 'archivo', 'archivos') + '</b> guardados solo en este dispositivo.</p>' +
        '<p class="nota">' + (u ? 'Última copia: ' + fechaTxt(u.slice(0, 10)) + (LS.leer('pendiente') ? ' · hay cambios desde entonces.' : ' · al día.') : 'Aún no has hecho ninguna copia.') + '</p>' +
        '<ul class="pasos"><li><b>Descargar copia</b>: guarda el zip en este equipo. En el ordenador puedes elegir la carpeta; en el móvil va a Descargas.</li>' +
        '<li><b>Compartir copia</b> (móvil): para mandarla a Archivos, iCloud Drive o Google Drive.</li>' +
        '<li><b>Restaurar una copia</b>: elige ese zip desde cualquier carpeta. Sirve en iPhone, Android y ordenador.</li></ul>' +
        '<div class="lotes">' +
        '<button type="button" class="pill' + (esIOS ? '' : ' pri') + '" data-f="descargar-copia" disabled>' + ico('nube') + '<span>Preparando la copia…</span></button>' +
        '<button type="button" class="pill' + (esIOS ? ' pri' : '') + '" data-f="compartir-copia" hidden>' + ico('enlace') + '<span>Compartir copia</span></button>' +
        '<button type="button" class="pill" data-f="restaurar">' + ico('subir') + '<span>Restaurar una copia</span></button>' +
        '<button type="button" class="pill" data-modo="ejemplos">' + ico('mundo') + 'Ver los viajes de ejemplo</button></div>' +
        '<p class="nota">Restaurar sustituye lo que hay ahora en este dispositivo por lo de la copia.</p>';
      prepararCopia().then(c => {
        const b = $('[data-f="descargar-copia"]', caja), sh = $('[data-f="compartir-copia"]', caja);
        if (!b) return;
        b.disabled = false;
        $('span', b).textContent = 'Descargar copia · ' + mb(c.file.size);
        sh.hidden = !puedeCompartir();
        if (esIOS && !sh.hidden) sh.parentElement.insertBefore(sh, b); /* en iPhone, compartir va primero */
      }, () => toast('No se pudo preparar la copia'));
    }
    mostrarHoja(h, 'privado');
  }

  function bloqueFoto() {
    const u = ed.nueva ? ed.nueva.url : (ed.f ? src(ed.f) : '');
    return (u ? '<img src="' + u + '" alt="Foto del punto">' : '<span class="ph">' + ico('foto') + '</span>') +
      '<div class="pills"><button type="button" class="pill" data-f="foto">' + ico('foto') + (u ? 'Cambiar foto' : 'Añadir foto') + '</button>' +
      (u ? '<button type="button" class="pill peligro" data-f="sin-foto">' + ico('x') + 'Quitar foto</button>' : '') + '</div>';
  }
  function abrirPunto(v, p) {
    if (hModo === 'punto' && ed && ed.v === v && ed.p === p) return;
    if (!editando || (!p && !posNueva)) { ir(baseDe(v), true, {}); return; }
    ed = { v, p, pos: p ? (p.lat != null ? { lat: p.lat, lng: p.lng } : null) : posNueva, f: p ? p.f || null : null, nueva: null, fechaFoto: null };
    posNueva = null;
    const x = p || { nombre: nombreNuevo, fecha: fechaNueva };
    nombreNuevo = '';
    fechaNueva = '';
    const otros = p ? [rec].concat(ordenados()) : [], esRec = !!v.recuerdos;
    mostrarHoja(
      '<form id="form-punto" novalidate>' + cabecera(esRec ? (p ? 'Editar recuerdo' : 'Nuevo recuerdo') : (p ? 'Editar punto' : 'Nuevo punto')) +
      (otros.length ? '<label class="campo">Dónde se guarda (cámbialo para pasarlo a un viaje o a Recuerdos)<select id="f-viaje">' +
        otros.map(o => '<option value="' + esc(o.id) + '"' + (o === v ? ' selected' : '') + '>' + esc(o.recuerdos ? 'Recuerdos (sin viaje)' : o.titulo) + '</option>').join('') +
        '<option value="__nuevo">Crear un viaje nuevo con él…</option></select></label>'
        : '<p class="nota">' + (esRec ? 'Se guarda en <b>Recuerdos</b>: un sitio suelto, sin viaje.' : 'Viaje: <b>' + esc(v.titulo) + '</b>') + '</p>') +
      '<label class="campo">Nombre<input id="f-nombre" type="text" maxlength="80" value="' + esc(x.nombre) + '" placeholder="Por ejemplo: Mirador de Santa Luzia"></label>' +
      '<label class="campo">Fecha<input id="f-pfecha" type="date" value="' + esc((x.fecha || '').slice(0, 10)) + '"></label>' +
      '<label class="campo">Comentario<textarea id="f-ptxt" rows="2" maxlength="500" placeholder="Qué pasó aquí">' + esc(x.txt) + '</textarea></label>' +
      '<fieldset class="campo"><legend>Foto</legend><div class="f-foto" id="f-foto">' + bloqueFoto() + '</div></fieldset>' +
      '<fieldset class="campo"><legend>Ubicación</legend><p class="nota" id="f-ppos">' + textoPos(ed.pos, 'Sin ubicación.') + '</p>' +
      '<button type="button" class="pill" data-f="colocar">' + ico('diana') + (ed.pos ? 'Mover en el mapa' : 'Colocar en el mapa') + '</button></fieldset>' +
      '<p class="error" role="alert" hidden></p>' +
      '<div class="h-pie">' + (p ? '<button type="button" class="pill peligro" data-f="borrar-punto">' + ico('papelera') + '<span>Borrar punto</span></button>' : '') +
      '<button type="button" class="pill" data-f="cerrar">Cancelar</button><button type="submit" class="pill pri">Guardar</button></div></form>', 'punto');
  }

  async function guardarPunto() {
    const val = id => $('#' + id, caja).value.trim();
    const nombre = val('f-nombre'), txt = val('f-ptxt');
    let fecha = val('f-pfecha');
    if (!nombre && !txt && !ed.f && !ed.nueva) { error(caja, 'Pon un nombre o una foto al punto.'); $('#f-nombre', caja).focus(); return; }
    const { v } = ed;
    let p = ed.p;
    if (!p) { p = { id: nuevoId(v) }; v.puntos = puntosDe(v); v.puntos.push(p); }
    if (ed.nueva) {
      const nombreF = nombreLibre(v.id, 'jpg');
      await guardarArchivo(nombreF, ed.nueva.blob);
      URL.revokeObjectURL(ed.nueva.url);
      if (p.f && p.f !== nombreF) soltar(p.f);
      p.f = nombreF;
      if (!fecha && ed.fechaFoto) fecha = ed.fechaFoto;
      ed.nueva = null;
    } else if (!ed.f && p.f) {
      if (v.portada === p.f) delete v.portada;
      soltar(p.f);
      delete p.f;
    }
    const prevFecha = p.fecha || '';
    if (nombre) p.nombre = nombre; else delete p.nombre;
    if (txt) p.txt = txt; else delete p.txt;
    if (fecha) p.fecha = fecha.length === 10 && prevFecha.slice(0, 10) === fecha ? prevFecha : fecha; else delete p.fecha;
    if (ed.pos) { p.lat = ed.pos.lat; p.lng = ed.pos.lng; } else { delete p.lat; delete p.lng; }
    ordenarPuntos(v);
    if (!v.recuerdos) completarViaje(v);
    const nuevo = !ed.p, sel = $('#f-viaje', caja), dest = sel ? porId(sel.value) : null;
    if (sel && sel.value === '__nuevo') { /* crear un viaje nuevo con este punto: se pasa al guardar el viaje */
      guardar();
      ed = null;
      fichaEd = { id: idLibre('nuevo-viaje'), titulo: 'Nuevo viaje', puntos: [], nueva: true, traer: { v, p } };
      if (p.lat != null) { fichaEd.lat = p.lat; fichaEd.lng = p.lng; }
      ir('#ficha/' + fichaEd.id, true, { capa: true });
      return;
    }
    if (dest && dest !== v) { /* pasar el punto a otro viaje (o a Recuerdos) */
      v.puntos.splice(v.puntos.indexOf(p), 1);
      if (p.f && v.portada === p.f) delete v.portada;
      dest.puntos = puntosDe(dest);
      p.id = nuevoId(dest);
      dest.puntos.push(p);
      ordenarPuntos(dest);
      if (!dest.recuerdos) completarViaje(dest);
    }
    guardar();
    cerrarCapa(baseDe(v));
    repintar(v);
    toast(dest && dest !== v ? 'Pasado a «' + dest.titulo + '»' : v.recuerdos ? (nuevo ? 'Recuerdo guardado' : 'Recuerdo actualizado') : nuevo ? 'Punto creado' : 'Punto guardado');
  }

  hoja.addEventListener('dragover', e => { if (hModo === 'privado') e.preventDefault(); });
  hoja.addEventListener('drop', e => {
    if (hModo !== 'privado') return;
    e.preventDefault();
    const fs = [...e.dataTransfer.files];
    if (!fs.length) return;
    if (modo === 'mios' && datos.length) { toast('Para sustituir tus viajes, usa el botón «Restaurar una copia».'); return; }
    restaurar(fs);
  });
  hoja.addEventListener('submit', e => {
    e.preventDefault();
    if (hModo === 'punto') guardarPunto();
    else if (hModo === 'ficha') guardarFicha(e.target.closest('.fi-form'));
  });
  hoja.addEventListener('click', e => {
    if (e.target === hoja) { cerrarCapa(baseHoja()); return; }
    const qa = e.target.closest('[data-adj-quitar]');
    if (qa && fichaEd) { quitarAdjunto(fichaEd, +qa.dataset.adjQuitar.split('/')[1], qa); return; }
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const a = b.dataset.f;
    if (hModo === 'ficha' && accionFicha(a, b)) return;
    if (a === 'cerrar') cerrarCapa(baseHoja());
    else if (a === 'descargar-copia') descargarCopia();
    else if (a === 'compartir-copia') compartirCopia();
    else if (a === 'restaurar') {
      if (modo === 'mios' && datos.length && b.dataset.ok !== '1') {
        b.dataset.ok = '1';
        $('span', b).textContent = 'Sustituirá lo actual. Toca otra vez';
        return;
      }
      modoEntrada = 'copia';
      abrirEntrada('.zip,.json,application/zip,application/x-zip-compressed,application/octet-stream,application/json,image/jpeg,application/pdf', true);
    } else if (a === 'empezar') {
      hoja.hidden = true; hModo = ''; caja.innerHTML = ''; document.documentElement.classList.remove('bloq');
      cambiarModo('mios').then(() => { ponerEdicion(true); pintarPanel('inicio', null, true); toast('Listo. Pulsa «Añadir viaje» para crear el primero.'); });
    } else if (a === 'colocar') {
      elegir(ed.pos || posicion(ed.v), pos => {
        if (pos) { ed.pos = pos; $('#f-ppos', caja).textContent = textoPos(pos); }
        $('[data-f="colocar"]', caja).focus();
      });
    } else if (a === 'foto') { modoEntrada = 'punto'; abrirEntrada('image/*', false); }
    else if (a === 'sin-foto') {
      if (ed.nueva) { URL.revokeObjectURL(ed.nueva.url); ed.nueva = null; }
      ed.f = null;
      $('#f-foto', caja).innerHTML = bloqueFoto();
    } else if (a === 'borrar-punto') {
      if (b.dataset.ok !== '1') {
        b.dataset.ok = '1';
        $('span', b).textContent = '¿Seguro? Toca otra vez';
        return;
      }
      const { v, p } = ed;
      v.puntos.splice(v.puntos.indexOf(p), 1);
      if (p.f && v.portada === p.f) delete v.portada;
      soltar(p.f);
      guardar();
      cerrarCapa(baseDe(v));
      repintar(v);
      toast(v.recuerdos ? 'Recuerdo borrado' : 'Punto borrado');
    }
  });
  document.addEventListener('click', e => {
    if (e.target.closest('[data-aviso-x]')) { LS.poner(modo === 'ejemplos' ? 'x-ej' : 'x-copia', '1'); pintarAviso(); return; }
    const b = e.target.closest('[data-modo]');
    if (!b) return;
    const m = b.dataset.modo;
    if (!hoja.hidden) { hoja.hidden = true; hModo = ''; caja.innerHTML = ''; document.documentElement.classList.remove('bloq'); }
    cambiarModo(m).then(() => toast(m === 'mios' ? 'Tus viajes' : 'Viajes de ejemplo'));
  });

  /* ===================== Fichas: modificar, añadir, adjuntar ===================== */
  /* Botones del formulario de Modificar; devuelve true si la acción era suya */
  function accionFicha(a, b) {
    const form = $('.fi-form', caja), v = fichaEd;
    if (!form || !v) return false;
    if (a === 'adjuntar') { adjuntarA = v; modoEntrada = 'adjunto'; abrirEntrada('image/*,application/pdf', true); }
    else if (a === 'mas-enl') {
      $('.f-enlaces', form).insertAdjacentHTML('beforeend', filaEnlace({ t: '', u: '' }));
      $('.f-enl:last-child input', form).focus();
    } else if (a === 'quitar-enl') b.parentElement.remove();
    else if (a === 'desde-puntos') {
      const c = centroPuntos(v);
      form.dataset.lat = c.lat; form.dataset.lng = c.lng;
      $('.f-pos', form).textContent = textoPos(c);
    } else if (a === 'elegir') {
      const ini = form.dataset.lat ? { lat: +form.dataset.lat, lng: +form.dataset.lng } : posicion(v);
      elegir(ini, pos => {
        if (pos) { form.dataset.lat = pos.lat; form.dataset.lng = pos.lng; $('.f-pos', form).textContent = textoPos(pos); }
        b.focus({ preventScroll: true });
      });
    } else if (a === 'borrar') {
      if (b.dataset.ok !== '1') { b.dataset.ok = '1'; $('span', b).textContent = '¿Seguro? Toca otra vez'; return true; }
      puntosDe(v).forEach(q => soltar(q.f));
      adjuntosDe(v).forEach(q => soltar(q.f));
      datos.splice(datos.indexOf(v), 1);
      guardar();
      fichaEd = null;
      const volver = viajeActual === v;
      cerrarCapa('#');
      if (volver) ir('#', true, {}); else pintarPanel('inicio', null, true);
      toast('Viaje quitado');
    } else return false;
    return true;
  }
  function leerFicha(form) {
    const val = n => form.elements[n].value.trim();
    const d = {
      titulo: val('titulo'), lugar: val('lugar'), itinerario: val('itinerario'), desde: val('desde'), hasta: val('hasta'), texto: val('texto'),
      enlaces: [...form.querySelectorAll('.f-enl')].map(r => ({ t: r.querySelector('[name="et"]').value.trim(), u: r.querySelector('[name="eu"]').value.trim() })).filter(e => e.u)
    };
    if (!d.titulo) return { error: 'Escribe el destino o título.', foco: 'titulo' };
    if (d.desde && d.hasta && d.hasta < d.desde) return { error: 'La fecha «Hasta» es anterior a «Desde».', foco: 'hasta' };
    if (d.enlaces.some(e => !/^https?:\/\/\S+$/i.test(e.u))) return { error: 'Revisa el enlace: debe empezar por https://' };
    return { d };
  }
  function idLibre(base) {
    let id = base, k = 2;
    while (porId(id)) id = base + '-' + k++;
    return id;
  }
  const entrada = $('#fotos-in');
  let modoEntrada = 'viaje', adjuntarA = null;
  function abrirEntrada(accept, multiple) {
    entrada.accept = accept;
    entrada.multiple = multiple;
    entrada.value = '';
    entrada.click();
  }
  function nuevoViaje() {
    if (modo !== 'mios') { ir('#privado', false, { capa: true }); return; }
    if (!editando) { ponerEdicion(true); pintarPanel(viajeActual ? 'viaje' : 'inicio', viajeActual); }
    fichaEd = { id: idLibre('nuevo-viaje'), titulo: 'Nuevo viaje', puntos: [], nueva: true }; /* entra en datos al guardar */
    ir('#ficha/' + fichaEd.id, false, { capa: true });
  }
  panel.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-fav-modo]')) { ponerFav(!soloFav); return; }
    if (t.closest('.tab')) {
      if (innerWidth < 900) window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY, behavior: menosMov.matches ? 'auto' : 'smooth' });
      return;
    }
    const dz = t.closest('[data-desliza]');
    if (dz) { e.preventDefault(); e.stopPropagation(); irDeslizando(dz.getAttribute('href'), dz.dataset.desliza); return; }
    const fl = t.closest('[data-anios]');
    if (fl) { moverAnios(+fl.dataset.anios, true); return; }
    const p = t.closest('[data-anio]');
    if (p) {
      const a = p.dataset.anio;
      if (p.closest('[data-pag="rec"]')) filtroRec = a; else filtro = a;
      if (!a && soloFav) ponerFav(false); /* «Todos»: todo, sin corazón */
      else pintarPanel('inicio', null);
      return;
    }
    const ft = t.closest('.ft');
    if (ft) {
      const v = ft.dataset.v ? porId(ft.dataset.v) : viajeActual, p = puntoDe(v, ft.dataset.p);
      if (v.recuerdos && !p.f) { verRecuerdo(p); return; }
      secModo = ft.dataset.sec === 'mosaico' || ft.dataset.sec === 'rec' ? ft.dataset.sec : '';
      abrirFoto(v, p.id);
      return;
    }
    const vs = t.closest('[data-vista]');
    if (vs) {
      const [que, k] = vs.dataset.vista.split(':');
      vistas[que] = k;
      LS.poner(que === 'rec' ? 'vista-rec' : 'vista-fotos', k);
      pintarPanel('inicio', null, true);
      return;
    }
    const rr = t.closest('[data-rec]');
    if (rr) { const p = puntoDe(rec, rr.dataset.rec); if (p.f) { secModo = 'rec'; abrirFoto(rec, p.id); } else verRecuerdo(p); return; }
    if (t.closest('[data-nuevo-rec]')) { nuevoRecuerdo(); return; }
    const paso = t.closest('[data-paso]');
    if (paso) {
      const fs = [...$('.pista', panel).children], k = fs.indexOf(fichaActual()) + (+paso.dataset.paso);
      if (fs[k]) enfocarFicha(fs[k]);
      return;
    }
    const dot = t.closest('[data-ir]');
    if (dot) { const f = $('.pista', panel).children[+dot.dataset.ir]; if (f) enfocarFicha(f); return; }
    const mod = t.closest('[data-modificar]');
    if (mod) { ir('#ficha/' + mod.dataset.modificar, false, { capa: true }); return; }
    if (t.closest('[data-nuevo-viaje]')) { nuevoViaje(); return; }
    const adj = t.closest('[data-adjuntar]');
    if (adj) { adjuntarA = porId(adj.dataset.adjuntar); modoEntrada = 'adjunto'; abrirEntrada('image/*,application/pdf', true); return; }
    const qa = t.closest('[data-adj-quitar]');
    if (qa) { const [id, j] = qa.dataset.adjQuitar.split('/'); quitarAdjunto(porId(id), +j, qa); return; }
    const lu = t.closest('[data-lugar]');
    if (lu) {
      const o = puntoDe(viajeActual, lu.dataset.lugar);
      if (o.lat == null) { if (editando) ir('#punto/' + viajeActual.id + '/' + o.id, false, { capa: true }); return; }
      window.scrollTo({ top: 0, behavior: menosMov.matches ? 'auto' : 'smooth' });
      mapa.volar(o.lat, o.lng, 17);
      setTimeout(() => ventanaPunto(viajeActual, o), menosMov.matches ? 0 : 850);
      return;
    }
    const ac = t.closest('[data-accion]');
    if (!ac) return;
    if (ac.dataset.accion === 'fotos') { modoEntrada = 'viaje'; abrirEntrada('image/*', true); }
    else {
      const v = viajeActual;
      elegir(posicion(v), pos => {
        if (!pos) return;
        posNueva = pos;
        ir('#nuevo-punto/' + v.id, false, { capa: true });
      });
    }
  });
  /* Años de Fotos: flechas o deslizar el dedo sobre ellos */
  function moverAnios(d, foco) {
    const enRec = tab === 'rec', sel = enRec ? filtroRec : filtro;
    const anios = enRec ? aniosRec() : [...new Set(ordenados().map(anio).filter(Boolean))];
    const n = (sel ? anios.indexOf(sel) : -1) + d;
    if (n < -1 || n >= anios.length) return;
    if (enRec) filtroRec = n < 0 ? '' : anios[n]; else filtro = n < 0 ? '' : anios[n];
    pintarPanel('inicio', null);
    const pag = $('[data-pag="' + tab + '"]', panel) || panel, fila = $('.anios-a', pag);
    if (fila && !menosMov.matches) fila.classList.add(d > 0 ? 'entra-d' : 'entra-i');
    if (foco) {
      const otra = $('[data-anios="' + d + '"]:not([disabled])', pag) || $('[data-anios]:not([disabled])', pag);
      if (otra) otra.focus();
    }
  }
  let swA = null, sinClic = 0;
  document.addEventListener('pointerdown', e => {
    swA = e.isPrimary && panel.contains(e.target) && e.target.closest('.anios-a') ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  });
  document.addEventListener('pointerup', e => {
    if (!swA || e.pointerId !== swA.id) return;
    const dx = e.clientX - swA.x, dy = e.clientY - swA.y;
    swA = null;
    if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    sinClic = Date.now() + 250; /* que el clic que sigue al barrido no seleccione un año */
    moverAnios(dx < 0 ? 1 : -1);
  });
  document.addEventListener('pointercancel', () => { swA = null; });
  panel.addEventListener('click', e => {
    if (Date.now() < sinClic && e.target.closest('.anios-a')) { sinClic = 0; e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* En un viaje: deslizar a los lados para pasar al viaje anterior o al siguiente */
  let swV = null;
  panel.addEventListener('touchstart', e => {
    swV = viajeActual && e.touches.length === 1 && !e.target.closest('input, textarea, select, .fi-form, .enlaces')
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true });
  panel.addEventListener('touchend', e => {
    if (!swV || !viajeActual) return;
    const c = e.changedTouches[0], dx = c.clientX - swV.x, dy = c.clientY - swV.y, rapido = Date.now() - swV.t < 700;
    swV = null;
    if (!rapido || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const a = $('.paso [data-desliza="' + (dx < 0 ? 'd' : 'i') + '"]', panel);
    if (a) irDeslizando(a.getAttribute('href'), dx < 0 ? 'd' : 'i');
  }, { passive: true });
  function irDeslizando(h, lado) {
    ir(h);
    if (menosMov.matches) return;
    panel.classList.remove('entra-d', 'entra-i');
    void panel.offsetWidth;
    panel.classList.add(lado === 'd' ? 'entra-d' : 'entra-i');
  }
  panel.addEventListener('animationend', e => { e.target.classList.remove('entra-d', 'entra-i'); });

  panel.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const a = e.target.closest('.viaje, .ft, [data-lugar]');
    if (a) mapa.resaltar(a.dataset.id || a.dataset.p || a.dataset.lugar);
  });
  /* En el ordenador: arrastrar fotos sobre el viaje para añadirlas */
  panel.addEventListener('dragover', e => { if (editando && viajeActual) { e.preventDefault(); panel.classList.add('soltar'); } });
  panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('soltar'); });
  panel.addEventListener('drop', e => {
    panel.classList.remove('soltar');
    if (!editando || !viajeActual) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type));
    if (files.length) anadirFotos(viajeActual, files);
  });

  entrada.addEventListener('change', async () => {
    const files = [...entrada.files];
    if (!files.length) return;
    if (modoEntrada === 'copia') { restaurar(files); return; }
    if (modoEntrada === 'viaje') { if (viajeActual) anadirFotos(viajeActual, files); return; }
    if (modoEntrada === 'adjunto') { if (adjuntarA) anadirAdjuntos(adjuntarA, files); return; }
    if (!ed) return;
    toast('Preparando la foto…', true);
    try {
      const r = await prepararFoto(files[0]);
      if (ed.nueva) URL.revokeObjectURL(ed.nueva.url);
      ed.nueva = { blob: r.blob, url: URL.createObjectURL(r.blob) };
      ed.f = 'nueva';
      ed.fechaFoto = r.ex.fecha || null;
      if (!ed.pos && r.ex.lat != null) { ed.pos = { lat: r.ex.lat, lng: r.ex.lng }; $('#f-ppos', caja).textContent = textoPos(ed.pos); }
      if (r.ex.fecha && !$('#f-pfecha', caja).value) $('#f-pfecha', caja).value = r.ex.fecha.slice(0, 10);
      $('#f-foto', caja).innerHTML = bloqueFoto();
      toast(r.ex.lat != null ? 'Foto lista (con ubicación)' : 'Foto lista (sin ubicación: se queda en el punto elegido)');
    } catch (er) { toast('No se pudo leer la foto'); }
  });

  async function anadirFotos(v, files) {
    v.puntos = puntosDe(v);
    delete v.nueva;
    let ok = 0, gps = 0, fallos = 0;
    for (let i = 0; i < files.length; i++) {
      toast('Preparando foto ' + (i + 1) + ' de ' + files.length + '…', true);
      try {
        const r = await prepararFoto(files[i]);
        const nombre = nombreLibre(v.id, 'jpg');
        const p = { id: nuevoId(v), f: nombre };
        if (r.ex.fecha) p.fecha = r.ex.fecha;
        if (r.ex.lat != null) { p.lat = r.ex.lat; p.lng = r.ex.lng; gps++; }
        await guardarArchivo(nombre, r.blob);
        v.puntos.push(p);
        ok++;
      } catch (e) { fallos++; }
    }
    ordenarPuntos(v);
    completarViaje(v);
    if (ok) guardar();
    pintarPanel('viaje', v, true);
    toast(plural(ok, 'foto añadida', 'fotos añadidas') + (ok ? ' · ' + gps + ' con ubicación' : '') +
      (ok > gps ? ' · las demás: ábrelas y «Colocar en el mapa»' : '') + (fallos ? ' · ' + fallos + ' no se pudieron leer' : ''));
  }
  async function anadirAdjuntos(v, files) {
    v.adjuntos = adjuntosDe(v);
    let ok = 0, fallos = 0;
    for (const file of files) {
      try {
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!pdf && !/^image\//.test(file.type)) { fallos++; continue; }
        if (pdf && file.size > 20e6) { fallos++; continue; }
        const blob = pdf ? file : (await prepararFoto(file)).blob;
        const nombre = nombreLibre(v.id + '-adjunto', pdf ? 'pdf' : 'jpg');
        await guardarArchivo(nombre, blob);
        v.adjuntos.push({ f: nombre, n: file.name, tipo: pdf ? 'pdf' : 'img' });
        ok++;
      } catch (e) { fallos++; }
    }
    if (!v.adjuntos.length) delete v.adjuntos;
    if (ok) refrescarAdjuntos(v);
    toast(plural(ok, 'archivo adjuntado', 'archivos adjuntados') + (fallos ? ' · ' + fallos + ' no válidos (solo imágenes y PDF de hasta 20 MB)' : ''));
  }

  /* ===================== Modo edición y teclado ===================== */
  const bEd = $('#b-editar');
  function ponerEdicion(on) {
    editando = on;
    bEd.setAttribute('aria-pressed', on);
    $('span', bEd).textContent = on ? 'Listo' : 'Editar';
    document.body.classList.toggle('editando', on);
    try { sessionStorage.setItem('mis-viajes.editar', on ? '1' : ''); } catch (e) { /* sin almacenamiento */ }
  }
  bEd.addEventListener('click', () => {
    if (modo !== 'mios') { ir('#privado', false, { capa: true }); return; }
    ponerEdicion(!editando);
    mapa.cerrarVentana();
    pintarPanel(viajeActual ? 'viaje' : 'inicio', viajeActual);
    if (!editando && /^#(ficha|punto|nuevo-punto)/.test(location.hash)) cerrarCapa(baseHoja());
  });
  $('#b-copia').addEventListener('click', () => ir('#privado', false, { capa: true }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!menu.hidden) { cerrarMenu(true); return; }
      if (!busca.hidden) { cerrarBusca(true); return; }
      if (eligiendo) { salirElegir(null); return; }
      if (!hoja.hidden) cerrarCapa(baseHoja());
      else if (!visor.hidden) cerrarCapa(baseVisor());
      else if (full) ponerFull(false);
    } else if (!visor.hidden && hoja.hidden) {
      if (e.key === 'ArrowLeft') cambiarFoto(-1);
      else if (e.key === 'ArrowRight') cambiarFoto(1);
    } else if (viajeActual && hoja.hidden && !eligiendo && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
      !e.target.closest('input, textarea, select, .leaflet-container, .mapa')) {
      /* En un viaje, las flechas del teclado pasan al viaje de al lado */
      const a = $('.paso [data-desliza="' + (e.key === 'ArrowRight' ? 'd' : 'i') + '"]', panel);
      if (a) { e.preventDefault(); irDeslizando(a.getAttribute('href'), a.dataset.desliza); }
    }
  });

  /* ===================== Arranque ===================== */
  (async function () {
    const lista = (await IDB.todo()) || [];
    hayMios = lista.some(x => x[0] === CLAVE_DATOS);
    if (hayMios && LS.leer('modo') !== 'ejemplos') {
      try { datos = separar(JSON.parse(lista.find(x => x[0] === CLAVE_DATOS)[1])); } catch (e) { datos = separar([]); }
      lista.forEach(([k, b]) => { if (k !== CLAVE_DATOS) arch.set(k, { blob: b, url: URL.createObjectURL(b) }); });
      modo = 'mios';
      persistir();
      try { ponerEdicion(sessionStorage.getItem('mis-viajes.editar') === '1'); } catch (e) { ponerEdicion(false); }
    } else ponerEdicion(false);
    pintarCabecera();
    pintarAviso();
    aplicado = null;
    aplicar();
  })();
})();

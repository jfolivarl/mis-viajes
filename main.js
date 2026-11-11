/* Mis viajes · Juan Felipe e Inés
   Dos caras: la pública enseña viajes de ejemplo (viajes.js del repositorio) y la
   privada guarda tus viajes y fotos solo en este dispositivo (IndexedDB), con copia
   de seguridad en un zip. Mapa con Leaflet, fichas en carrusel y visor de fotos. */
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
  let datos = ejemplos();
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
    IDB.poner(CLAVE_DATOS, JSON.stringify(datos));
    LS.poner('pendiente', '1');
    pintarAviso();
  }
  function soltar(f) {
    if (f && arch.has(f)) { URL.revokeObjectURL(arch.get(f).url); arch.delete(f); IDB.quitar(f); }
  }
  async function guardarArchivo(nombre, blob) {
    await IDB.poner(nombre, blob);
    arch.set(nombre, { blob, url: URL.createObjectURL(blob) });
  }

  const porId = id => datos.find(v => v.id === id);
  const ordenados = () => datos.slice().sort((a, b) => cmp(b.desde || '', a.desde || ''));
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
    datos.forEach(v => {
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
    const capas = {
      mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }),
      satelite: L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: 'Imágenes © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, Maxar, Earthstar Geographics'
        }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
      ])
    };
    let base = 'mapa';
    try { if (localStorage.getItem('mis-viajes.capa') === 'satelite') base = 'satelite'; } catch (e) { /* sin almacenamiento */ }
    capas[base].addTo(map);

    const izq = L.DomUtil.create('div', 'm-ctrl m-izq', el);
    izq.innerHTML =
      '<button type="button" data-m="mas" aria-label="Acercar">' + ico('mas') + '</button>' +
      '<button type="button" data-m="menos" aria-label="Alejar">' + ico('menos') + '</button>' +
      '<button type="button" data-m="todo" aria-label="Ver todo">' + ico('mundo') + '</button>' +
      '<button type="button" data-m="full" aria-label="Mapa a pantalla completa" aria-pressed="false">' + ico('full') + '</button>';
    const ctrl = L.DomUtil.create('div', 'm-ctrl', el);
    ctrl.innerHTML =
      '<button type="button" data-m="buscar" aria-label="Buscar una dirección o un lugar" aria-expanded="false">' + ico('lupa') + '</button>' +
      '<button type="button" data-m="capa" aria-label="Vista satélite" aria-pressed="' + (base === 'satelite') + '">' + ico('capas') + '</button>' +
      '<button type="button" data-m="filtro" aria-label="Filtrar el mapa por viaje" aria-haspopup="true" aria-expanded="false">' + ico('filtro') + '</button>' +
      '<button type="button" class="cz" data-m="fav" aria-label="Ver solo las fotos favoritas en el mapa" aria-pressed="false">' + ico('corazon') + '</button>';
    const bFav = ctrl.lastChild;
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
    let pin = null;

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
        const p = g.items[0], solo = g.items.length === 1, f = fabrica(g.items), arrastra = !!(mover && solo);
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
    map.on('click', e => { if (document.body.classList.contains('eligiendo')) map.panTo(e.latlng); });

    const alClic = e => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const a = b.dataset.m;
      if (a === 'mas') map.zoomIn();
      else if (a === 'menos') map.zoomOut();
      else if (a === 'todo') { if (api.verTodo) api.verTodo(); }
      else if (a === 'filtro') { if (api.alFiltro) api.alFiltro(b); }
      else if (a === 'full') { if (api.alFull) api.alFull(b); }
      else if (a === 'fav') { if (api.alFav) api.alFav(); }
      else if (a === 'buscar') { if (api.alBuscar) api.alBuscar(b); }
      else {
        map.removeLayer(capas[base]);
        base = base === 'mapa' ? 'satelite' : 'mapa';
        capas[base].addTo(map);
        b.setAttribute('aria-pressed', base === 'satelite');
        try { localStorage.setItem('mis-viajes.capa', base); } catch (er) { /* sin almacenamiento */ }
      }
    };
    izq.addEventListener('click', alClic);
    ctrl.addEventListener('click', alClic);
    new ResizeObserver(() => map.invalidateSize({ pan: false })).observe(el);

    const api = {
      verTodo: null,
      alFiltro: null,
      alFav: null,
      alFull: null,
      alBuscar: null,
      favorito(on) { bFav.setAttribute('aria-pressed', on); },
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
      pin(la, ln, nodo) {
        api.quitarPin();
        map.setView([la, ln], Math.max(map.getZoom(), 15), { animate: false });
        pin = L.marker([la, ln], {
          icon: L.divIcon({ className: 'm-pin', iconSize: [34, 42], iconAnchor: [17, 41], popupAnchor: [0, -38],
            html: '<svg viewBox="0 0 34 42" aria-hidden="true"><path d="M17 41S2.5 26.5 2.5 16a14.5 14.5 0 0 1 29 0C31.5 26.5 17 41 17 41z"/><circle cx="17" cy="16" r="5.5"/></svg>' }),
          zIndexOffset: 2000, keyboard: true, alt: 'Lugar buscado'
        }).addTo(map);
        pin.bindPopup(nodo, { maxWidth: 260, className: 'm-pop', autoPanPaddingTopLeft: [60, 16], autoPanPaddingBottomRight: [62, 50] }).openPopup();
      },
      quitarPin() { if (pin) { pin.remove(); pin = null; } }
    };
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

  /* Reduce la foto a 1600 px de lado mayor (≈300 KB) para que la web cargue rápido */
  function reducir(file) {
    return new Promise((ok, mal) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(b => { c.width = c.height = 0; if (b) ok(b); else mal(new Error('jpeg')); }, 'image/jpeg', 0.82);
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
    lista.push({ nombre: 'viajes.json', datos: enc.encode(JSON.stringify({ app: 'mis-viajes', version: 1, fecha: new Date().toISOString(), viajes: datos }, null, 1)) });
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
  function guardarCopia() {
    if (!copia) return;
    const f = copia.file;
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f], title: f.name }).then(() => { copiaHecha(); toast('Copia guardada'); }, () => toast('No se ha guardado la copia'));
    } else {
      const a = document.createElement('a');
      a.href = copia.url;
      a.download = f.name;
      document.body.append(a);
      a.click();
      a.remove();
      copiaHecha();
      toast('Copia descargada: ' + f.name);
    }
  }
  async function restaurar(file) {
    toast('Leyendo la copia…', true);
    let partes;
    try { partes = await leerZip(file); } catch (e) { toast('Ese archivo no es una copia de Mis viajes'); return; }
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
    datos = lista;
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
    toast('Copia restaurada: ' + plural(lista.length, 'viaje', 'viajes') + ' y ' + plural(n, 'archivo', 'archivos'));
  }
  async function cambiarModo(m) {
    if (m === 'mios') {
      const lista = await IDB.todo();
      const d = (lista || []).find(x => x[0] === CLAVE_DATOS);
      if (d) {
        datos = JSON.parse(d[1]);
        (lista || []).forEach(([k, b]) => { if (k !== CLAVE_DATOS && !arch.has(k)) arch.set(k, { blob: b, url: URL.createObjectURL(b) }); });
        hayMios = true;
      } else { datos = []; hayMios = true; IDB.poner(CLAVE_DATOS, '[]'); }
      persistir();
    } else {
      datos = ejemplos();
      ponerEdicion(false);
    }
    modo = m;
    LS.poner('modo', m);
    fichaAbierta = null;
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
  let filtro = '', vistaKey = '', viajeActual = null, fichaAbierta = null, fichaVer = null;
  let tab = 'viajes', seguir = true, enMapa = null, soloFav = false;
  const TABS = ['viajes', 'fotos', 'favs'], HASH = { viajes: '#', fotos: '#fotos', favs: '#favoritos' };
  const esFav = v => puntosDe(v).some(p => p.fav); /* los favoritos son solo de fotos */
  const nFav = () => datos.reduce((n, v) => n + puntosDe(v).filter(p => p.fav).length, 0);
  function guardarFav() {
    if (modo === 'mios') { guardar(); return; }
    const k = [];
    datos.forEach(v => puntosDe(v).forEach(p => { if (p.fav) k.push(v.id + '/' + p.id); }));
    LS.poner('fav-ej', JSON.stringify(k));
  }
  function altoMapa() {
    const w = $('.mapa-wrap'), tabs = $('.tabs', panel);
    if (innerWidth >= 900 || !tabs || viajeActual) w.style.removeProperty('--alto');
    else w.style.setProperty('--alto', Math.max(240, innerHeight - (w.getBoundingClientRect().top + scrollY) - tabs.offsetHeight - Math.round(innerHeight * 0.16)) + 'px');
    mapa.tam();
  }
  window.addEventListener('resize', () => {
    altoMapa();
    const pg = $('.pager', panel);
    if (pg) pg.scrollLeft = TABS.indexOf(tab) * pg.clientWidth; /* al girar el móvil, seguir en la misma pestaña */
  });

  function pintarCabecera() {
    $('#subtitulo').textContent = modo === 'mios' ? 'Juan Felipe e Inés' : 'Viajes de ejemplo';
    $('#b-copia').setAttribute('aria-label', modo === 'mios' ? 'Copia de seguridad' : 'Mis viajes privados');
  }
  function pintarAviso() {
    const a = $('#aviso');
    let h = '';
    if (modo === 'ejemplos') {
      h = '<p>' + ico('mundo') + '<span>Estás viendo <b>viajes de ejemplo</b>.' + (hayMios ? '' : ' Los tuyos se guardan solo en este dispositivo.') + '</span></p>' +
        (hayMios ? '<button type="button" class="pill pri" data-modo="mios">Volver a mis viajes</button>' : '<a class="pill pri" href="#privado">Empezar con mis viajes</a>');
    } else if (LS.leer('pendiente') && datos.length) {
      const u = LS.leer('copia');
      h = '<p>' + ico('nube') + '<span>' + (u ? 'Hay cambios desde tu última copia (' + fechaTxt(u.slice(0, 10)) + ').' : 'Aún no has hecho ninguna copia de seguridad.') + '</span></p>' +
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

  /* ---------- Mapa: todos los viajes o uno ---------- */
  function mapaTodos(lista, tocar, fav) {
    enMapa = null;
    const pts = [];
    lista.forEach(v => {
      const p = posicion(v);
      if (p && !fav) pts.push({ id: v.id, lat: p.lat, lng: p.lng, v });
      if (fav) ubicados(v).filter(o => o.fav && o.f).forEach(o => pts.push({ id: v.id + '/' + o.id, lat: o.lat, lng: o.lng, v, p: o }));
    });
    mapa.ruta(null);
    mapa.cerrarVentana();
    mapa.marcas(pts, items => items[0].p ? marcaPunto(items) : marcaViaje(items), grupo => {
      if (grupo.length > 1 && mapa.zoom() <= 15) mapa.ajustar(grupo, 16);
      else if (grupo[0].p) abrirFoto(grupo[0].v, grupo[0].p.id);
      else tocar(grupo[0].v);
    });
    mapa.verTodo = () => { if (pts.length) mapa.ajustar(pts, 6); else mapa.volar(25, -20, 2); };
    mapa.verTodo();
  }
  function ventanaPunto(v, p) {
    mapa.ventana(p.lat, p.lng, '<b>' + esc(nombrePunto(p)) + '</b>' + (p.fecha ? '<br><small>' + fechaTxt(p.fecha) + '</small>' : '') +
      (p.txt && p.nombre ? '<br>' + esc(p.txt) : '') +
      (editando ? '<br><a class="pill" href="#punto/' + v.id + '/' + p.id + '">' + ico('lapiz') + 'Editar punto</a>' : ''));
  }
  function mapaViaje(v, ajustar) {
    enMapa = v.id;
    const todos = ubicados(v), favs = todos.filter(o => o.fav), p = posicion(v);
    const g = soloFav && viajeActual && favs.length ? favs : todos;
    mapa.cerrarVentana();
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
  function ventanaViaje(v) {
    const p = posicion(v), f = portada(v), n = conFoto(v).length;
    mapa.ventana(p.lat, p.lng, (f ? '<img class="pop-img" src="' + src(f) + '" alt="">' : '') + '<b>' + esc(v.titulo) + '</b>' +
      (v.desde ? '<br><small>' + rango(v) + '</small>' : '') +
      '<br><a class="pill pri" href="#v/' + v.id + '">' + ico('foto') + (n ? plural(n, 'foto', 'fotos') + ' en el mapa' : 'Abrir el viaje') + '</a>');
  }
  function tocarViaje(v) {
    if (full) { ventanaViaje(v); return; }
    const t = tab === 'viajes' && $('#ficha-' + v.id);
    if (t) { seguir = true; irFicha(t); } else ir('#v/' + v.id);
  }
  function visFotos() {
    const l = ordenados();
    return filtro === 'fav' ? l.filter(esFav) : filtro ? l.filter(v => anio(v) === filtro) : l;
  }
  function mapaInicio() {
    if (tab === 'favs') { mapaTodos(datos, tocarViaje, true); return; }
    if (tab === 'fotos') { mapaTodos(visFotos(), tocarViaje, soloFav || filtro === 'fav'); return; }
    const f = fichaActual();
    if (seguir && !soloFav && f && f.dataset.id) { mapaViaje(porId(f.dataset.id), true); return; }
    mapaTodos(datos, tocarViaje, soloFav);
  }
  mapa.alFav = () => {
    if (!soloFav) {
      if (viajeActual && !ubicados(viajeActual).some(p => p.fav)) { toast('Este viaje no tiene fotos favoritas en el mapa'); return; }
      if (!viajeActual && !datos.some(esFav)) { toast('Aún no hay favoritas. Abre una foto y toca el corazón.'); return; }
    }
    soloFav = !soloFav;
    mapa.favorito(soloFav);
    if (viajeActual) mapaViaje(viajeActual, true); else mapaInicio();
    toast(soloFav ? 'Mapa: solo favoritos' : 'Mapa: todo');
  };

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
  busca.addEventListener('submit', async e => {
    e.preventDefault();
    const t = q.value.trim(), n = ++turno;
    if (t.length < 3) { res.innerHTML = '<p class="nota">Escribe al menos 3 letras.</p>'; return; }
    res.innerHTML = '<p class="nota">Buscando…</p>';
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=' + encodeURIComponent(t), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('busqueda');
      const lista = await r.json();
      if (n !== turno) return;
      hallados = lista.slice(0, 5).map(x => ({
        lat: +(+x.lat).toFixed(5), lng: +(+x.lon).toFixed(5),
        nombre: x.name || String(x.display_name || t).split(',')[0], txt: x.display_name || ''
      })).filter(x => isFinite(x.lat) && isFinite(x.lng));
      res.innerHTML = hallados.length ? hallados.map((x, i) => '<button type="button" data-res="' + i + '">' + ico('pin') +
        '<span><b>' + esc(x.nombre) + '</b><small>' + esc(x.txt) + '</small></span></button>').join('')
        : '<p class="nota">Sin resultados. Prueba con más detalle: calle, ciudad, país.</p>';
    } catch (er) {
      if (n === turno) res.innerHTML = '<p class="nota">No se pudo buscar. Comprueba la conexión.</p>';
    }
  });
  res.addEventListener('click', e => {
    const b = e.target.closest('[data-res]');
    if (!b) return;
    cerrarBusca();
    ponerPin(hallados[+b.dataset.res]);
  });
  function ponerPin(x) {
    const d = document.createElement('div');
    d.className = 'pin-pop';
    const lista = ordenados().filter(v => !v.nueva);
    if (viajeActual && lista.indexOf(viajeActual) > 0) { lista.splice(lista.indexOf(viajeActual), 1); lista.unshift(viajeActual); }
    d.innerHTML = '<b>' + esc(x.nombre) + '</b><small>' + esc(x.txt) + '</small>' +
      (modo !== 'mios' ? '<button type="button" class="pill pri" data-pin="privado">Guardar en mis viajes</button>'
        : lista.length ? '<p class="nota">Añadir como punto a:</p>' + lista.map(v => '<button type="button" class="pill' + (v === viajeActual ? ' pri' : '') +
            '" data-pin="' + v.id + '">' + ico('mas') + '<span>' + esc(v.titulo) + '</span></button>').join('')
          : '<p class="nota">Crea antes un viaje para guardar este punto.</p>') +
      '<button type="button" class="pill peligro" data-pin="">' + ico('x') + 'Quitar del mapa</button>';
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-pin]');
      if (!b) return;
      const id = b.dataset.pin;
      if (!id) { mapa.quitarPin(); return; }
      if (full) ponerFull(false);
      if (id === 'privado') { mapa.cerrarVentana(); ir('#privado', false, { capa: true }); return; }
      const v = porId(id);
      if (!v) return;
      mapa.quitarPin();
      if (!editando) ponerEdicion(true);
      posNueva = { lat: x.lat, lng: x.lng };
      nombreNuevo = x.nombre;
      if (viajeActual !== v) ir('#v/' + v.id); /* así, al guardar, se vuelve al viaje */
      ir('#nuevo-punto/' + v.id, false, { capa: true });
    });
    mapa.pin(x.lat, x.lng, d);
  }

  /* ---------- Menú del mapa: filtrar por viaje ---------- */
  const menu = $('#m-menu');
  let menuBoton = null;
  mapa.alFiltro = b => { if (menu.hidden) { cerrarBusca(); abrirMenu(b); } else cerrarMenu(); };
  function abrirMenu(b) {
    menuBoton = b;
    const actual = viajeActual ? viajeActual.id : enMapa;
    menu.innerHTML = '<p class="m-menu-t">Ver en el mapa</p>' +
      '<button type="button" data-filtro="" aria-pressed="' + !actual + '">' + ico('mundo') + 'Todos los viajes</button>' +
      ordenados().map((v, i) => '<button type="button" data-filtro="' + v.id + '" aria-pressed="' + (actual === v.id) + '">' +
        '<span class="m-menu-n">' + (i + 1) + '</span>' + esc(v.titulo) + '</button>').join('');
    menu.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    const s = $('[aria-pressed="true"]', menu) || $('button', menu);
    s.focus();
  }
  function cerrarMenu(volver) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (menuBoton) { menuBoton.setAttribute('aria-expanded', 'false'); if (volver) menuBoton.focus(); }
  }
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    const id = b.dataset.filtro;
    cerrarMenu();
    if (viajeActual) { ir(id ? '#v/' + id : HASH[tab]); return; }
    if (!id) { seguir = false; mapaTodos(tab === 'fotos' ? visFotos() : datos, tocarViaje, soloFav || tab === 'favs'); return; }
    if (tab !== 'viajes') { ir('#v/' + id); return; }
    soloFav = false;
    mapa.favorito(false);
    seguir = true;
    const t = $('#ficha-' + id);
    if (t) { irFicha(t); mapaViaje(porId(id), true); }
  });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-m="filtro"]')) cerrarMenu(); });

  /* ---------- Portada: pestañas deslizables Viajes / Fotos ---------- */
  function pestanas() {
    const nf = datos.reduce((s, v) => s + conFoto(v).length, 0), nv = nFav();
    const t = (id, i, n, txt) => '<a class="tab" href="' + HASH[id] + '" data-tab="' + id + '"' + (tab === id ? ' aria-current="page"' : '') + '>' +
      '<span class="ci">' + ico(i) + '</span><b>' + n + '</b><small>' + txt + '</small></a>';
    return '<nav class="tabs" aria-label="Ver">' +
      t('viajes', 'pin', datos.length, datos.length === 1 ? 'viaje' : 'viajes') +
      t('fotos', 'foto', nf, nf === 1 ? 'foto' : 'fotos') +
      t('favs', 'corazon', nv, nv === 1 ? 'favorito' : 'favoritos') + '<i class="tab-barra" aria-hidden="true"></i></nav>';
  }
  const BOLA = '<span class="cz-b" aria-hidden="true">' + ico('corazon') + '</span>';
  let anioIni = 0;
  const corazon = (cls, attr, on, etiqueta) => '<button type="button" class="' + cls + ' cz" ' + attr + ' aria-pressed="' + !!on + '" aria-label="' + etiqueta + '">' + ico('corazon') + '</button>';

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
  function formFicha(v) {
    const enl = (v.enlaces && v.enlaces.length) ? v.enlaces : [{ t: '', u: '' }];
    const p = v.lat != null ? { lat: v.lat, lng: v.lng } : null, cp = centroPuntos(v);
    return '<form class="fi-form" data-id="' + v.id + '" novalidate' + (p ? ' data-lat="' + p.lat + '" data-lng="' + p.lng + '"' : '') + '>' +
      '<label class="campo">Destino o título *<input name="titulo" type="text" required maxlength="80" value="' + esc(v.titulo) + '"></label>' +
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
      '<p class="error" role="alert" hidden></p>' +
      '<div class="h-pie"><button type="button" class="pill peligro" data-f="borrar"><span>Quitar viaje</span></button>' +
      '<button type="button" class="pill" data-f="cancelar">Cancelar</button><button type="submit" class="pill pri">Guardar</button></div></form>';
  }
  function ficha(v, i, total) {
    const fs = conFoto(v), n = dias(v), a = aFecha(v.desde), b = aFecha(v.hasta) || a, abierta = fichaAbierta === v.id;
    const lug = lugaresDe(v), adj = adjuntosDe(v);
    let h = '<article class="fi" id="ficha-' + v.id + '" data-id="' + v.id + '" role="group" aria-label="Viaje ' + (i + 1) + ' de ' + total + '">' +
      '<div class="fi-cab"><span class="fi-n">' + (i + 1) + '</span><span class="fi-t">' + ico('reloj') + cuando(v) + '</span></div>' +
      '<h3 class="fi-tit"><a href="#v/' + v.id + '">' + esc(v.titulo) + ico('der') + '</a></h3>' +
      '<div class="fi-fechas">' + ico('cal') + (a ? '<span class="fi-r"><small>Del</small><b>' + diaMes(a) + '</b><small>al</small><b>' + diaMes(b) + ' ' + b.getUTCFullYear() + '</b></span>' +
        '<span class="fi-d"><b>' + n + '</b><small>' + (n === 1 ? 'día' : 'días') + '</small></span>' : '<span class="fi-r"><small>Sin fechas todavía</small></span>') + '</div>' +
      ovalos(lug.length ? lug : (v.lugar ? [v.lugar] : [])) +
      (v.texto ? '<p class="fi-txt">' + esc(v.texto) + '</p>' : '') + '<hr class="fi-hr">';
    if (fs.length) {
      h += '<a class="fi-fotos" href="#v/' + v.id + '" aria-label="Ver las ' + fs.length + ' fotos de ' + esc(v.titulo) + ' y su mapa">' +
        fs.slice(0, 4).map(p => '<img src="' + src(p.f) + '" alt="" loading="lazy">').join('') +
        '<span>' + ico('foto') + plural(fs.length, 'foto', 'fotos') + ' y mapa' + ico('der') + '</span></a>';
    } else {
      h += '<a class="fi-sin" href="#v/' + v.id + '">' + ico('foto') + 'Sin fotos todavía · abrir el viaje' + ico('der') + '</a>';
    }
    h += '<hr class="fi-hr"><div class="fi-adj">' + (adj.length ? adj.map((x, j) => adjuntoFila(v, x, j)).join('') : '<p class="fi-nof">Sin archivos adjuntos todavía</p>') + '</div>';
    if (editando) {
      h += '<div class="fi-bar"><button type="button" class="ib" data-adjuntar="' + v.id + '" aria-label="Adjuntar archivo a ' + esc(v.titulo) + '" title="Adjuntar archivo">' + ico('clip') + '</button>' +
        '<button type="button" class="pill fi-mod" data-modificar="' + v.id + '" aria-expanded="' + abierta + '">Modificar<i class="chv" aria-hidden="true"></i></button></div>';
      if (abierta) h += '<div class="fi-pan">' + formFicha(v) + '</div>';
    }
    return h + '</article>';
  }
  function pintarFichas() {
    const ord = ordenados();
    let h = '<div class="fi-top"><h2 class="ttl">Mis viajes</h2>' +
      '<button type="button" class="pill fi-add" data-nuevo-viaje><span class="vp" aria-hidden="true">' + ico('mas') + '</span>Añadir viaje</button></div>';
    h += '<div class="carr"><div class="pista" tabindex="0" role="region" aria-label="Mis viajes. Desliza para ver más">' +
      ord.map((v, i) => ficha(v, i, ord.length)).join('') +
      '<button type="button" class="fi fi-plus" data-nuevo-viaje><span class="pl" aria-hidden="true">' + ico('mas') + '</span><b>Añadir viaje</b><small>Destino, fechas y fotos</small></button>' +
      '</div><div class="puntos-carr">' + ord.map((v, i) => '<button type="button" class="dot" data-ir="' + i + '" aria-label="Ir al viaje ' + (i + 1) + '"></button>').join('') +
      '<button type="button" class="dot dot-mas" data-ir="' + ord.length + '" aria-label="Ir a añadir viaje"></button></div></div>';
    if (!ord.length) h += '<p class="nota centro">' + (modo === 'mios' ? 'Aún no tienes viajes. Pulsa «Añadir viaje» para crear el primero.' : '') + '</p>';
    return h;
  }
  function filaViaje(v) {
    const p = portada(v), n = conFoto(v).length;
    return '<li><a class="viaje" href="#v/' + v.id + '" data-id="' + v.id + '">' +
      (p ? '<img src="' + src(p) + '" alt="" loading="lazy">' : '<span class="ph">' + ico('pin') + '</span>') +
      '<span class="vi"><b>' + esc(v.titulo) + '</b>' + ovalos(v.lugar ? [v.lugar] : [], 'mini') +
      '<small>' + [rango(v), n ? plural(n, 'foto', 'fotos') : 'sin fotos'].filter(Boolean).join(' · ') + '</small></span>' +
      ico('der') + '</a></li>';
  }
  function pintarFotos() {
    const lista = ordenados();
    const anios = [...new Set(lista.map(anio).filter(Boolean))];
    if (filtro && filtro !== 'fav' && anios.indexOf(filtro) < 0) filtro = '';
    const vis = visFotos();
    let h = '<h2 class="ttl">Nuestras fotos</h2>';
    if (!lista.length) return h + '<div class="vacio">' + ico('foto') + '<p>Aún no hay fotos.</p></div>';
    const nA = innerWidth < 360 ? 1 : 2, k = anios.indexOf(filtro);
    if (k >= 0 && k < anioIni) anioIni = k; else if (k >= anioIni + nA) anioIni = k - nA + 1;
    anioIni = Math.max(0, Math.min(anioIni, anios.length - nA));
    const flecha = (d, i, off, et) => anios.length > nA ? '<button type="button" class="ib ib-s" data-anios="' + d + '"' + (off ? ' disabled' : '') + ' aria-label="' + et + '">' + ico(i) + '</button>' : '';
    h += '<div class="pills anios" role="group" aria-label="Filtrar">' +
      '<button type="button" class="pill suave" data-anio="" aria-pressed="' + !filtro + '">Todos</button>' +
      corazon('pill', 'data-anio="fav"', filtro === 'fav', 'Solo viajes con fotos favoritas') +
      flecha(-1, 'izq', anioIni === 0, 'Años más recientes') +
      anios.slice(anioIni, anioIni + nA).map(a => '<button type="button" class="pill" data-anio="' + a + '" aria-pressed="' + (filtro === a) + '">' + a + '</button>').join('') +
      flecha(1, 'der', anioIni + nA >= anios.length, 'Años anteriores') + '</div>';
    if (!vis.length) return h + '<div class="vacio">' + ico('corazon') + '<p>Aún no hay fotos favoritas.</p></div>';
    let ultimo = null;
    h += '<ul class="lista">';
    vis.forEach(v => {
      const a = anio(v) || 'Sin fecha';
      if (a !== ultimo && (!filtro || filtro === 'fav')) { h += '<li class="anio" aria-hidden="true">' + a + '</li>'; ultimo = a; }
      h += filaViaje(v);
    });
    return h + '</ul>';
  }
  function pintarFavs() {
    const fs = [];
    ordenados().forEach(v => conFoto(v).forEach(p => { if (p.fav) fs.push({ v, p }); }));
    const h = '<h2 class="ttl">Fotos favoritas<small>' + fs.length + '</small></h2>';
    if (!fs.length) return h + '<div class="vacio">' + ico('corazon') + '<p><b>Aún no hay favoritas.</b><br>Abre una foto y toca el corazón.</p></div>';
    return h + '<div class="galeria">' + fs.map(o =>
      '<button type="button" class="ft fav" data-v="' + o.v.id + '" data-p="' + o.p.id + '"><img src="' + src(o.p.f) + '" alt="' +
      esc(nombrePunto(o.p) + ' · ' + o.v.titulo) + '" loading="lazy" decoding="async">' + BOLA + '</button>').join('') + '</div>';
  }
  function pintarInicio() {
    viajeActual = null;
    panel.innerHTML = pestanas() + '<div class="pager">' +
      '<section class="pag" data-pag="viajes" aria-label="Viajes">' + pintarFichas() + '</section>' +
      '<section class="pag" data-pag="fotos" aria-label="Fotos">' + pintarFotos() + '</section>' +
      '<section class="pag" data-pag="favs" aria-label="Favoritos">' + pintarFavs() + '</section></div>';
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
  function moverBarra(r) {
    const b = $('.tab-barra', panel);
    if (b) b.style.transform = 'translateX(calc(' + Math.min(2, Math.max(0, r)).toFixed(3) + ' * (100% + .5rem)))';
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
    let t0 = 0;
    pg.addEventListener('scroll', () => {
      moverBarra(pg.scrollLeft / Math.max(1, pg.clientWidth));
      clearTimeout(t0);
      t0 = setTimeout(() => {
        const r = pg.scrollLeft / Math.max(1, pg.clientWidth);
        if (Math.abs(r - Math.round(r)) > 0.02) return; /* aún se está moviendo */
        const t = TABS[Math.round(r)];
        if (!t || t === tab) return;
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
  function irFicha(el, sinAnimar) {
    const pista = el.parentElement;
    pista.scrollTo({ left: el.offsetLeft - (pista.clientWidth - el.offsetWidth) / 2, behavior: sinAnimar || menosMov.matches ? 'auto' : 'smooth' });
  }
  function prepararCarrusel() {
    const pista = $('.pista', panel);
    if (!pista) return;
    const fichas = [...pista.children], dots = [...panel.querySelectorAll('.dot')];
    const add = $('.fi-add', panel), mas = $('.fi-plus', pista);
    /* El botón fijo «Añadir viaje» se atenúa cuando la ficha punteada ya está a la vista */
    const atenuar = () => { if (add && mas) add.classList.toggle('tenue', mas.offsetLeft + mas.offsetWidth * 0.6 <= pista.scrollLeft + pista.clientWidth + 1); };
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
      if (tab === 'viajes' && seguir && !soloFav) tMapa = setTimeout(() => { if (f.dataset.id) mapaViaje(porId(f.dataset.id), true); else mapaTodos(datos, tocarViaje); }, 160);
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
    let h = '<a class="volver" href="' + HASH[tab] + '">' + ico('izq') + { viajes: 'Mis viajes', fotos: 'Todas las fotos', favs: 'Favoritos' }[tab] + '</a>';
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
        '<a class="pill" href="#ficha/' + v.id + '">' + ico('lapiz') + 'Editar ficha</a></div>' +
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
        (ant ? '<a class="pill" href="#v/' + ant.id + '">' + ico('izq') + esc(ant.titulo) + '</a>' : '<span></span>') +
        (sig ? '<a class="pill" href="#v/' + sig.id + '">' + esc(sig.titulo) + ico('der') + '</a>' : '') + '</nav>';
    }
    panel.innerHTML = h;
    altoMapa();
    mapaViaje(v, true);
  }

  function pintarPanel(vista, v, forzar) {
    const key = vista + ':' + (v ? v.id : '') + ':' + filtro + ':' + editando + ':' + fichaAbierta + ':' + modo;
    if (key === vistaKey && !forzar) return;
    const cambiaVista = vistaKey.split(':').slice(0, 2).join(':') !== key.split(':').slice(0, 2).join(':');
    const pista = $('.pista', panel), x = pista ? pista.scrollLeft : 0;
    vistaKey = key;
    panel.classList.toggle('inicio', vista !== 'viaje');
    if (vista === 'viaje') pintarViaje(v); else pintarInicio();
    if (cambiaVista) window.scrollTo(0, 0);
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
  const CAPAS = /^#(punto|nuevo-punto|privado)\b/;
  function aplicar() {
    if (location.hash === aplicado) return;
    aplicado = location.hash;
    salirElegir();
    cerrarMenu();
    const r = ruta();
    const v = /^(v|ficha|punto|nuevo-punto)$/.test(r.tipo) ? porId(r.id) : null;
    if (r.tipo === 'ficha') {
      if (v && editando) fichaAbierta = v.id;
      fichaVer = v ? v.id : null;
      tab = 'viajes';
      seguir = true;
      pintarPanel('inicio', null, true);
    } else if (r.tipo === 'inicio' || r.tipo === 'fotos' || r.tipo === 'favoritos') {
      const t = { inicio: 'viajes', fotos: 'fotos', favoritos: 'favs' }[r.tipo];
      if (vistaKey.indexOf('inicio:') === 0 && pager()) verTab(t, true);
      else { if (viajeActual) fichaVer = viajeActual.id; tab = t; pintarPanel('inicio', null); }
    } else if (v) pintarPanel('viaje', v);
    else if (!vistaKey || r.tipo === 'v') pintarPanel('inicio', null);
    const pf = r.tipo === 'v' && v && r.p ? puntoDe(v, r.p) : null;
    if (pf && pf.f) mostrarVisor(v, pf); else ocultarVisor();
    if (r.tipo === 'privado') abrirPrivado();
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
  let vV = null, vP = null, vFoco = null, toqueX = null, barrido = false, confirmar = null;
  function abrirFoto(v, pid) { ir('#v/' + v.id + '/' + pid, false, { capa: true }); }
  function mostrarVisor(v, p) {
    if (visor.hidden && !eligiendo) {
      vFoco = document.activeElement;
      visor.hidden = false;
      document.documentElement.classList.add('bloq');
      $('[data-v="cerrar"]', visor).focus();
    }
    vV = v; vP = p;
    const fs = conFoto(v), n = fs.indexOf(p);
    vImg.src = src(p.f);
    vImg.alt = nombrePunto(p) + ' · ' + v.titulo;
    $('#visor-t').textContent = v.titulo + ' · ' + (n + 1) + ' / ' + fs.length;
    $('#visor-nombre').textContent = p.nombre || '';
    $('#visor-fecha').textContent = fechaTxt(p.fecha);
    $('#visor-txt').textContent = p.txt || '';
    $('[data-v="fav"]', visor).setAttribute('aria-pressed', !!p.fav);
    $('[data-v="mapa"]', visor).hidden = p.lat == null;
    $('[data-v="ant"]', visor).hidden = n === 0;
    $('[data-v="sig"]', visor).hidden = n === fs.length - 1;
    $('[data-v="colocar"] span', visor).textContent = p.lat == null ? 'Colocar en el mapa' : 'Mover en el mapa';
    $('[data-v="portada"] span', visor).textContent = portada(v) === p.f ? 'Es la portada' : 'Usar de portada';
    confirmar = null;
    $('[data-v="quitar"] span', visor).textContent = 'Quitar foto';
    mapa.resaltar(p.id);
  }
  function ocultarVisor() {
    if (visor.hidden) return;
    visor.hidden = true;
    vImg.removeAttribute('src');
    if (hoja.hidden) document.documentElement.classList.remove('bloq');
    mapa.resaltar(null);
    if (vFoco && vFoco.focus) vFoco.focus();
  }
  function cambiarFoto(d) {
    const fs = conFoto(vV), n = fs.indexOf(vP) + d;
    if (n < 0 || n >= fs.length) return;
    ir('#v/' + vV.id + '/' + fs[n].id, true);
  }
  visor.addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) {
      if (e.target.classList.contains('v-escena') && !barrido) cerrarCapa('#v/' + vV.id);
      barrido = false;
      return;
    }
    const a = b.dataset.v, p = vP;
    if (a === 'cerrar') cerrarCapa('#v/' + vV.id);
    else if (a === 'fav') {
      if (p.fav) delete p.fav; else p.fav = true;
      guardarFav();
      b.setAttribute('aria-pressed', !!p.fav);
      const ft = $('.ft[data-p="' + p.id + '"]', panel);
      if (ft) ft.classList.toggle('fav', !!p.fav);
      toast(p.fav ? 'Añadida a favoritos' : 'Quitada de favoritos');
    }
    else if (a === 'ant') cambiarFoto(-1);
    else if (a === 'sig') cambiarFoto(1);
    else if (a === 'mapa') {
      cerrarCapa('#v/' + vV.id);
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
        completarViaje(v);
        guardar();
        pintarPanel('viaje', v, true);
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
  const escena = $('.v-escena', visor);
  escena.addEventListener('pointerdown', e => { toqueX = e.clientX; barrido = false; });
  escena.addEventListener('pointerup', e => {
    if (toqueX == null) return;
    const dx = e.clientX - toqueX;
    toqueX = null;
    if (Math.abs(dx) > 50) { barrido = true; cambiarFoto(dx < 0 ? 1 : -1); }
  });

  /* ===================== Hoja: punto, privado y copia ===================== */
  const hoja = $('#hoja'), caja = $('#hoja-caja');
  let hFoco = null, hModo = '', ed = null, posNueva = null;
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
    if (hoja.hidden) return;
    hoja.hidden = true;
    hModo = '';
    caja.innerHTML = '';
    if (visor.hidden) document.documentElement.classList.remove('bloq');
    if (hFoco && hFoco.focus) hFoco.focus();
  }
  const baseHoja = () => (ed ? '#v/' + ed.v.id : (viajeActual ? '#v/' + viajeActual.id : HASH[tab]));
  const cabecera = t => '<div class="h-cab"><h2 id="hoja-t" class="ttl">' + t + '</h2>' +
    '<button type="button" class="ib" data-f="cerrar" aria-label="Cerrar">' + ico('x') + '</button></div>';
  const error = (cont, msg) => { const e = $('.error', cont); e.textContent = msg; e.hidden = false; };

  function abrirPrivado() {
    if (hModo === 'privado') return;
    let h;
    if (modo === 'ejemplos') {
      h = cabecera('Tus viajes, solo en este dispositivo') +
        '<p>Lo que ves ahora son <b>viajes de ejemplo</b>, los que enseña la web pública.</p>' +
        '<ul class="pasos"><li>Tus viajes, fotos y archivos se guardan <b>solo en este dispositivo</b>. No se suben a GitHub ni a ningún sitio.</li>' +
        '<li>Haz una <b>copia de seguridad</b> de vez en cuando y guárdala en <b>Archivos › iCloud Drive</b>.</li>' +
        '<li>Con esa copia puedes <b>restaurarlo todo</b> en otro iPhone (por ejemplo, el de Inés) o si borras la app.</li></ul>' +
        '<div class="lotes">' + (hayMios ? '<button type="button" class="pill pri" data-modo="mios">' + ico('pin') + 'Volver a mis viajes</button>'
          : '<button type="button" class="pill pri" data-f="empezar">' + ico('pin') + 'Empezar con mis viajes</button>') +
        '<button type="button" class="pill" data-f="restaurar">' + ico('subir') + 'Restaurar una copia</button></div>';
    } else {
      const u = LS.leer('copia'), n = referenciadas().size;
      h = cabecera('Copia de seguridad') +
        '<p>Tienes <b>' + plural(datos.length, 'viaje', 'viajes') + '</b> y <b>' + plural(n, 'archivo', 'archivos') + '</b> guardados solo en este dispositivo.</p>' +
        '<p class="nota">' + (u ? 'Última copia: ' + fechaTxt(u.slice(0, 10)) + (LS.leer('pendiente') ? ' · hay cambios desde entonces.' : ' · al día.') : 'Aún no has hecho ninguna copia.') + '</p>' +
        '<ol class="pasos"><li>Pulsa <b>Guardar copia</b>.</li><li>En el menú elige <b>Guardar en Archivos</b> › <b>iCloud Drive</b> (por ejemplo, en una carpeta «Mis viajes»).</li>' +
        '<li>Para recuperarla: aquí, <b>Restaurar una copia</b> › elige el zip.</li></ol>' +
        '<div class="lotes"><button type="button" class="pill pri" data-f="guardar-copia" disabled>' + ico('nube') + '<span>Preparando la copia…</span></button>' +
        '<button type="button" class="pill" data-f="restaurar">' + ico('subir') + '<span>Restaurar una copia</span></button>' +
        '<button type="button" class="pill" data-modo="ejemplos">' + ico('mundo') + 'Ver los viajes de ejemplo</button></div>' +
        '<p class="nota">Restaurar sustituye lo que hay ahora en este dispositivo por lo de la copia.</p>';
      prepararCopia().then(c => {
        const b = $('[data-f="guardar-copia"]', caja);
        if (!b) return;
        b.disabled = false;
        $('span', b).textContent = 'Guardar copia · ' + mb(c.file.size);
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
    if (!editando || (!p && !posNueva)) { ir('#v/' + v.id, true, {}); return; }
    ed = { v, p, pos: p ? (p.lat != null ? { lat: p.lat, lng: p.lng } : null) : posNueva, f: p ? p.f || null : null, nueva: null, fechaFoto: null };
    posNueva = null;
    const x = p || { nombre: nombreNuevo };
    nombreNuevo = '';
    const otros = p ? ordenados().filter(o => !o.nueva) : [];
    mostrarHoja(
      '<form id="form-punto" novalidate>' + cabecera(p ? 'Editar punto' : 'Nuevo punto') +
      (otros.length > 1 ? '<label class="campo">Viaje (cámbialo para pasar el punto a otro viaje)<select id="f-viaje">' +
        otros.map(o => '<option value="' + esc(o.id) + '"' + (o === v ? ' selected' : '') + '>' + esc(o.titulo) + '</option>').join('') + '</select></label>'
        : '<p class="nota">Viaje: <b>' + esc(v.titulo) + '</b></p>') +
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
    completarViaje(v);
    const nuevo = !ed.p, sel = $('#f-viaje', caja), dest = sel ? porId(sel.value) : null;
    if (dest && dest !== v) { /* pasar el punto a otro viaje */
      v.puntos.splice(v.puntos.indexOf(p), 1);
      if (p.f && v.portada === p.f) delete v.portada;
      dest.puntos = puntosDe(dest);
      p.id = nuevoId(dest);
      dest.puntos.push(p);
      ordenarPuntos(dest);
      completarViaje(dest);
    }
    guardar();
    cerrarCapa('#v/' + v.id);
    pintarPanel('viaje', v, true);
    toast(dest && dest !== v ? 'Punto pasado a «' + dest.titulo + '»' : nuevo ? 'Punto creado' : 'Punto guardado');
  }

  hoja.addEventListener('submit', e => { e.preventDefault(); if (hModo === 'punto') guardarPunto(); });
  hoja.addEventListener('click', e => {
    if (e.target === hoja) { cerrarCapa(baseHoja()); return; }
    const b = e.target.closest('[data-f]');
    if (!b) return;
    const a = b.dataset.f;
    if (a === 'cerrar') cerrarCapa(baseHoja());
    else if (a === 'guardar-copia') guardarCopia();
    else if (a === 'restaurar') {
      if (modo === 'mios' && datos.length && b.dataset.ok !== '1') {
        b.dataset.ok = '1';
        $('span', b).textContent = 'Sustituirá lo actual. Toca otra vez';
        return;
      }
      modoEntrada = 'copia';
      abrirEntrada('.zip,application/zip', false);
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
      cerrarCapa('#v/' + v.id);
      pintarPanel('viaje', v, true);
      toast('Punto borrado');
    }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-modo]');
    if (!b) return;
    const m = b.dataset.modo;
    if (!hoja.hidden) { hoja.hidden = true; hModo = ''; caja.innerHTML = ''; document.documentElement.classList.remove('bloq'); }
    cambiarModo(m).then(() => toast(m === 'mios' ? 'Tus viajes' : 'Viajes de ejemplo'));
  });

  /* ===================== Fichas: modificar, añadir, adjuntar ===================== */
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
  panel.addEventListener('submit', e => {
    const form = e.target.closest('.fi-form');
    if (!form) return;
    e.preventDefault();
    const r = leerFicha(form);
    if (r.error) { error(form, r.error); if (r.foco) form.elements[r.foco].focus(); return; }
    const v = porId(form.dataset.id), d = r.d;
    if (v.nueva && !puntosDe(v).length && !adjuntosDe(v).length) { v.id = idLibre(slug(d.titulo) + (d.desde ? '-' + d.desde.slice(0, 4) : '')); }
    delete v.nueva;
    ['titulo', 'lugar', 'itinerario', 'desde', 'hasta', 'texto'].forEach(c => { if (d[c]) v[c] = d[c]; else if (c !== 'titulo') delete v[c]; });
    if (d.enlaces.length) v.enlaces = d.enlaces; else delete v.enlaces;
    if (form.dataset.lat) { v.lat = +form.dataset.lat; v.lng = +form.dataset.lng; } else { delete v.lat; delete v.lng; }
    guardar();
    fichaAbierta = null;
    fichaVer = v.id;
    seguir = true;
    pintarPanel('inicio', null, true);
    toast('Viaje guardado');
  });

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
    if (!editando) ponerEdicion(true);
    const v = { id: idLibre('nuevo-viaje'), titulo: 'Nuevo viaje', puntos: [], nueva: true };
    datos.push(v);
    fichaAbierta = v.id;
    fichaVer = v.id;
    pintarPanel('inicio', null, true);
    const i = $('#ficha-' + v.id + ' [name="titulo"]');
    if (i) { i.focus({ preventScroll: true }); i.select(); }
  }
  panel.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('.tab')) {
      if (innerWidth < 900) window.scrollTo({ top: panel.getBoundingClientRect().top + scrollY, behavior: menosMov.matches ? 'auto' : 'smooth' });
      return;
    }
    const fl = t.closest('[data-anios]');
    if (fl) {
      anioIni += +fl.dataset.anios;
      $('[data-pag="fotos"]', panel).innerHTML = pintarFotos();
      const otra = $('[data-anios="' + fl.dataset.anios + '"]:not([disabled])', panel) || $('[data-anios]:not([disabled])', panel);
      if (otra) otra.focus();
      return;
    }
    const p = t.closest('[data-anio]');
    if (p) { filtro = p.dataset.anio; pintarPanel('inicio', null); return; }
    const ft = t.closest('.ft');
    if (ft) { abrirFoto(ft.dataset.v ? porId(ft.dataset.v) : viajeActual, ft.dataset.p); return; }
    const dot = t.closest('[data-ir]');
    if (dot) { seguir = true; const f = $('.pista', panel).children[+dot.dataset.ir]; if (f) irFicha(f); return; }
    const mod = t.closest('[data-modificar]');
    if (mod) {
      const id = mod.dataset.modificar;
      if (fichaAbierta === id) { const v = porId(id); if (v && v.nueva) { datos.splice(datos.indexOf(v), 1); } fichaAbierta = null; }
      else fichaAbierta = id;
      fichaVer = id;
      pintarPanel('inicio', null, true);
      return;
    }
    if (t.closest('[data-nuevo-viaje]')) { nuevoViaje(); return; }
    const adj = t.closest('[data-adjuntar]');
    if (adj) { adjuntarA = porId(adj.dataset.adjuntar); modoEntrada = 'adjunto'; abrirEntrada('image/*,application/pdf', true); return; }
    const qa = t.closest('[data-adj-quitar]');
    if (qa) {
      if (qa.dataset.ok !== '1') { qa.dataset.ok = '1'; qa.classList.add('peligro'); qa.setAttribute('aria-label', 'Toca otra vez para quitar'); return; }
      const [id, j] = qa.dataset.adjQuitar.split('/'), v = porId(id), x = v.adjuntos[+j];
      v.adjuntos.splice(+j, 1);
      if (!v.adjuntos.length) delete v.adjuntos;
      soltar(x.f);
      guardar();
      fichaVer = id;
      pintarPanel('inicio', null, true);
      toast('Archivo quitado');
      return;
    }
    const form = t.closest('.fi-form');
    const b = t.closest('[data-f]');
    if (form && b) {
      const a = b.dataset.f, v = porId(form.dataset.id);
      if (a === 'cancelar') {
        if (v.nueva) datos.splice(datos.indexOf(v), 1);
        fichaAbierta = null;
        fichaVer = v.nueva ? null : v.id;
        pintarPanel('inicio', null, true);
      } else if (a === 'mas-enl') {
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
        if (b.dataset.ok !== '1') { b.dataset.ok = '1'; $('span', b).textContent = '¿Seguro? Toca otra vez'; return; }
        puntosDe(v).forEach(q => soltar(q.f));
        adjuntosDe(v).forEach(q => soltar(q.f));
        datos.splice(datos.indexOf(v), 1);
        if (!v.nueva) guardar();
        fichaAbierta = null;
        pintarPanel('inicio', null, true);
        toast('Viaje quitado');
      }
      return;
    }
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
    if (modoEntrada === 'copia') { restaurar(files[0]); return; }
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
    delete v.nueva;
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
    if (ok) guardar();
    fichaVer = v.id;
    pintarPanel('inicio', null, true);
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
    if (!editando) {
      datos.filter(v => v.nueva).forEach(v => datos.splice(datos.indexOf(v), 1));
      fichaAbierta = null;
    }
    pintarPanel(viajeActual ? 'viaje' : 'inicio', viajeActual);
    if (!editando && /^#(punto|nuevo-punto)/.test(location.hash)) cerrarCapa(baseHoja());
  });
  $('#b-copia').addEventListener('click', () => ir('#privado', false, { capa: true }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!menu.hidden) { cerrarMenu(true); return; }
      if (!busca.hidden) { cerrarBusca(true); return; }
      if (eligiendo) { salirElegir(null); return; }
      if (!hoja.hidden) cerrarCapa(baseHoja());
      else if (!visor.hidden) cerrarCapa('#v/' + vV.id);
      else if (full) ponerFull(false);
    } else if (!visor.hidden && hoja.hidden) {
      if (e.key === 'ArrowLeft') cambiarFoto(-1);
      else if (e.key === 'ArrowRight') cambiarFoto(1);
    }
  });

  /* ===================== Arranque ===================== */
  (async function () {
    const lista = (await IDB.todo()) || [];
    hayMios = lista.some(x => x[0] === CLAVE_DATOS);
    if (hayMios && LS.leer('modo') !== 'ejemplos') {
      try { datos = JSON.parse(lista.find(x => x[0] === CLAVE_DATOS)[1]); } catch (e) { datos = []; }
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

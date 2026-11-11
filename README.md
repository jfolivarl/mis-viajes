# Mis viajes

Fichas, mapa y fotos de viajes. Web estática para GitHub Pages: https://jfolivarl.github.io/mis-viajes/

## Dos caras

- **Pública (este repositorio):** enseña unos **viajes de ejemplo** con fotos de lugares (`viajes.js` y los `.jpg`).
- **Privada (solo en tu dispositivo):** al pulsar **Empezar con mis viajes**, tus viajes, fotos y adjuntos se guardan **solo en ese iPhone**. No se suben a GitHub ni a ningún servidor.

## Copia de seguridad (importante)

1. Botón de la nube (arriba) › **Descargar copia**: guarda un zip en el equipo (en el ordenador se puede elegir la carpeta; en el móvil va a Descargas). En el móvil también hay **Compartir copia**, para mandarla a Archivos, iCloud Drive o Google Drive.
2. Para recuperarla, o pasarla a otro equipo: botón de la nube › **Restaurar una copia** › elegir el zip. En el ordenador también se puede arrastrar el zip sobre esa ventana. Si el equipo lo descomprimió solo, se pueden elegir todos sus archivos a la vez (`viajes.json` y las fotos).

La copia es la misma en iPhone, Android y ordenador.

Si se borra la app o los datos del navegador, lo guardado se pierde: la copia es la única forma de recuperarlo. La app avisa cuando hay cambios sin copia.

## Estructura (todo suelto en la raíz)

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `style.css`, `main.js` | La app: mapa, fichas, galería, visor, editor y copia de seguridad. |
| `leaflet.js`, `leaflet.css`, `LICENSE-leaflet.txt` | Leaflet 1.9.4 (librería del mapa), guardada en el repositorio. |
| `viajes.js` | Los **viajes de ejemplo** de la cara pública. |
| `miami-*.jpg`, `ocean-cay-*.jpg`, `manizales-*.jpg`, `disney-*.jpg`, `mogan-*.jpg` | Fotos de los ejemplos. |
| `logo.png`, `icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png`, `manifest.webmanifest` | Logo e iconos para instalarla como app. |
| `robots.txt` | Pide a los buscadores que no la indexen. |

## Cómo se usa

- **Viajes / Fotos / Favoritos:** las tres casillas son pestañas; también se cambia deslizando a los lados. Al tocarlas, la página baja hasta el contenido.
- **Favoritas (corazón):** solo para fotos; se marca en el visor de la foto. El corazón del mapa deja solo las fotos favoritas; en Fotos hay un filtro de corazón junto a los años, que se pasan con las flechas.
- **Viajes:** carrusel de fichas. El mapa enseña el viaje de la ficha que tienes delante. Al final, la ficha punteada **Añadir viaje**.
- **Filtro del mapa** (embudo): elegir un viaje o verlos todos.
- **Título de la ficha** o «N fotos y mapa»: abre el viaje con su galería.
- **Ampliar una foto:** en el visor, con la lupa, doble toque, pellizco o la rueda del ratón; arrastra para moverla. Las fotos nuevas se guardan a 2560 px para que se vean nítidas.
- **Editar:** Modificar la ficha, adjuntar imágenes o PDF (clip), añadir fotos, crear puntos, arrastrar marcadores.
- **Añadir fotos:** Fototeca, cámara o Archivos. Para que lleven ubicación: Fotos › Compartir › Opciones › **Ubicación** › Guardar en Archivos, y elegirlas con Explorar. Las que no la tengan: abrirlas › **Colocar en el mapa**.
- **Mapa base:** el botón de capas abre un menú con Gris oscuro (el de siempre), Gris claro, Callejero y Satélite.
- La app es **siempre oscura**, tenga el dispositivo el modo que tenga.
- En el ordenador el panel de la izquierda tiene su propio scroll y el carrusel lleva botones Anterior y Siguiente.
- **Pantalla completa:** botón de las flechas hacia fuera; al tocar un viaje sale su ventana con la portada y el enlace a sus fotos. Se sale con el mismo botón o con Escape.
- El mapa lleva **norte y escala** abajo a la izquierda.
- **Buscar** (lupa): escribe una dirección o un lugar y pulsa Buscar. Al elegir un resultado aparece un marcador de ubicación; desde su ventana se añade como punto a un viaje (y ahí se le pone nombre, fecha, comentario y foto). Necesita conexión.
- **Pasar un punto a otro viaje:** Editar punto › campo «Viaje».

## Cambiar los ejemplos

Editar `viajes.js` (títulos, fechas, textos, coordenadas) y subir las fotos nuevas con el nombre que figure en `"f"`.

## Mapa

Leaflet con fondos grises y satélite de © Esri y callejero de © OpenStreetMap. Búsqueda con Photon y Nominatim (datos de OpenStreetMap).

# Mis viajes

Álbum interactivo de viajes en forma de visor: mapa, fichas, fotos y recuerdos. Web estática para GitHub Pages: https://jfolivarl.github.io/mis-viajes/

## Dos caras

- **Pública (este repositorio):** enseña unos **viajes de ejemplo** con fotos de lugares (`viajes.js` y los `.jpg`).
- **Privada (solo en tu dispositivo):** al pulsar **Empezar con mis viajes**, tus viajes, fotos y adjuntos se guardan **solo en ese dispositivo** (iPhone, Android u ordenador). No se suben a GitHub ni a ningún servidor.

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
| `miami-*.jpg`, `ocean-cay-*.jpg`, `manizales-*.jpg`, `disney-*.jpg`, `mogan-*.jpg`, `burdeos-*.jpg` | Fotos de los ejemplos (burdeos, del recuerdo de ejemplo). |
| `*-m.jpg` | Miniaturas de las fotos de ejemplo (400 px) para el mapa, las fichas y los cuadros; la foto grande solo se carga al abrirla. Al cambiar una foto de ejemplo, rehaz su miniatura. |
| `logo.png`, `icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png`, `manifest.webmanifest` | Logo e iconos para instalarla como app. |
| `robots.txt` | Pide a los buscadores que no la indexen. |

## Cómo se usa

- **Pestañas:** Viajes, Fotos y Recuerdos se cambian tocando o deslizando a los lados. Al tocarlas, la página baja hasta el contenido.
- **Modo corazón:** el corazón del mapa y los de Fotos y Recuerdos son el mismo interruptor (en Fotos y Recuerdos, apagado es una bolita dorada con corazón turquesa y encendido, corazón blanco sobre turquesa; con él encendido, el icono de la pestaña Fotos pasa a ser un corazón). Encendido, el mapa enseña solo las fotos favoritas, las demás miniaturas se atenúan y las favoritas llevan el corazón turquesa. Tocando cualquier corazón se apaga en toda la app. Una foto se marca como favorita desde su visor.
- **Números de viaje:** cronológicos: el más antiguo es el 1 y el más reciente el último. Son los mismos en fichas, Fotos y el menú «Ver viajes», y en fichas y Fotos van con la palabra «Viaje».
- **Botones del mapa:** a la izquierda, acercar, alejar y planeta, y en un segundo bloque mi ubicación y pantalla completa; a la derecha, búsqueda y capas, y en un segundo bloque «Ver viajes» y corazón. Al activarse, búsqueda, pantalla completa, corazón y «Ver viajes» crecen igual; capas, acercar, alejar y el planeta solo se iluminan. El planeta (y el logo) vuelve a «Todos los viajes». Tocar otro botón o fuera cierra el buscador y los desplegables.
- **Viajes:** carrusel de fichas. El mapa enseña el viaje (o sus favoritas, en modo corazón) de la ficha que tienes delante. Al final, la ficha punteada **Añadir viaje**. En tablet y ordenador hay botones Anterior y Siguiente.
- **Ver viajes** (botón del avión): elegir un viaje (con su número) o verlos todos. Cuando el mapa enseña un solo viaje, el avión pasa a ser un embudo relleno con el número de ese viaje en una bolita con aro blanco.
- **Título de la ficha** o «N fotos y mapa»: abre el viaje con su galería. Dentro de un viaje, los botones de abajo, deslizar a los lados (móvil) o las flechas del teclado (ordenador) pasan al viaje anterior o al siguiente.
- **Fotos:** viajes por años con su número de viaje («Viaje 1», «Viaje 2»…). Las flechas de los años (o deslizar el dedo sobre ellos) seleccionan el año de al lado, de uno en uno: Todos › 2025 › 2024… El botón junto al título cambia entre **lista** (una fila por viaje) y **mosaico** (todas las fotos en cuadros); la app recuerda la elegida.
- **Recuerdos** (icono de la foto colgada con chincheta): sitios sueltos que no son un viaje (una escapada, una cena…), con nombre, fecha, comentario y foto, en lista o mosaico, con «Todos», corazón y años como en Fotos, y con su propio icono en el mapa. Se guardan en la copia de seguridad. Desde «Editar recuerdo › Dónde se guarda» se pasan a un viaje o a un viaje nuevo.
- **Mi ubicación** (flecha, columna izquierda del mapa): enseña dónde estás con una esferita azul, como en el iPhone. Su ventana permite **Guardar aquí como recuerdo** (se guarda al momento con el sitio y la hora; luego puedes añadir foto o nota), **Empezar un viaje aquí** o **Agregar a un viaje**. No se guarda ni se envía a ningún sitio. Necesita permiso de ubicación y https.
- **Marcar un sitio:** mantén el dedo pulsado en el mapa (clic derecho en el ordenador) o búscalo con la lupa. Su ventana ofrece **Guardar como recuerdo**, **Crear viaje** o **Agregar a un viaje**.
- **Ampliar una foto:** en el visor, con la lupa, doble toque, pellizco o la rueda del ratón; arrastra para moverla. Las fotos nuevas se guardan a 2560 px para que se vean nítidas.
- **Editar:** Modificar la ficha, adjuntar imágenes o PDF (clip), añadir fotos, crear puntos, arrastrar marcadores.
- **Añadir fotos:** Fototeca, cámara o Archivos. Para que lleven ubicación: Fotos › Compartir › Opciones › **Ubicación** › Guardar en Archivos, y elegirlas con Explorar. Las que no la tengan: abrirlas › **Colocar en el mapa**.
- **Mapa base:** el botón de capas abre un menú con muestras de color: Azul (el de siempre, a juego con la app), Gris oscuro, Gris claro, Callejero, Relieve y Satélite.
- La app es **siempre oscura**, tenga el dispositivo el modo que tenga.
- En el ordenador el panel de la izquierda tiene su propio scroll.
- **Pantalla completa:** botón de las flechas hacia fuera (crece y las flechas miran hacia dentro al activarlo); al tocar un viaje sale su ventana con la portada y el enlace a sus fotos. El logo del mapa hace de botón del planeta. Se sale con el mismo botón o con Escape.
- El mapa lleva **norte y escala** abajo a la izquierda.
- **Buscar** (lupa): escribe una dirección o un lugar y pulsa Buscar. Al elegir un resultado aparece un marcador con las mismas opciones que al marcar un sitio. Necesita conexión.
- **Pasar un punto a otro viaje:** Editar punto › campo «Dónde se guarda» (otro viaje, Recuerdos o un viaje nuevo).

## Rendimiento

- Las fotos de ejemplo se ven en miniatura (`-m.jpg`) y la grande solo se descarga al abrirla en el visor: la primera carga pasa de unos 3,8 MB a unos 0,7 MB.
- Las fotos propias tienen una miniatura en memoria, hecha en segundo plano; la copia de seguridad no cambia.

## Privacidad

- Los viajes, fotos y recuerdos propios se guardan en el navegador del dispositivo (IndexedDB) y en la copia de seguridad que descargues; el repositorio solo lleva los ejemplos.
- La ubicación del dispositivo solo se usa mientras «Mi ubicación» está encendido y no se guarda salvo que la conviertas en un recuerdo o un punto.
- Las búsquedas y el nombre de un sitio marcado se consultan a Photon y Nominatim (OpenStreetMap) solo cuando los pides.

## Al actualizar la app

En `index.html`, los archivos llevan un número de versión (`main.js?v=20261114t`). Cada vez que se cambie `main.js`, `style.css` o `viajes.js`, hay que cambiar ese número en `index.html` y subirlo también: así los móviles cargan la versión nueva en vez de la guardada.

## Cambiar los ejemplos

Editar `viajes.js` (títulos, fechas, textos, coordenadas) y subir las fotos nuevas con el nombre que figure en `"f"`.

## Mapa

Leaflet con fondos azul, grises, relieve y satélite de © Esri y callejero de © OpenStreetMap. El azul es el gris oscuro de Esri teñido con el color de la app. Búsqueda con Photon y Nominatim (datos de OpenStreetMap).

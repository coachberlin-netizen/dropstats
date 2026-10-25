# DropStats

Tienda diaria, catálogo de cosméticos, mapa interactivo, estadísticas de jugadores y torneos de Fortnite, en una web app pensada para Safari en iPhone y para ordenador.

DropStats es un proyecto independiente. No está afiliado, patrocinado ni aprobado por Epic Games. Fortnite y los nombres e imágenes de sus objetos son marcas de Epic Games, Inc.

Versión del 25 de octubre de 2026 (rediseño, planes premium, Ultra Widgets y mapa táctico).

---

## 1. Funciones y fuentes de datos

| Sección | Qué hace | Fuente |
|---|---|---|
| Tienda | Ofertas actuales con imagen, colores de la oferta, nombre, tipo, rareza, precio en paVos y rebaja. Búsqueda, filtros por tipo y precio, orden por sección, precio o nombre. Ficha con fechas de entrada y salida, si se puede regalar, conjunto, historial de apariciones y objetos del lote. Botón «Actualizar», hora de la última actualización y cuenta atrás hasta el cambio (00:00 UTC). Estados de carga, error con «Reintentar» y sin resultados. Las ofertas con fecha de salida pasada se descartan. | fortnite-api.com `/v2/shop` (no oficial, gratuita, sin clave) |
| Catálogo | Archivo histórico de cosméticos: novedades, búsqueda por nombre, filtros por tipo y rareza, «Mostrar más». Los objetos a la venta hoy llevan la etiqueta «Hoy en tienda». El precio solo aparece si DropStats lo ha visto en la tienda; no se estima. | fortnite-api.com `/v2/cosmetics/...` |
| Mapa | Mapa actual con y sin nombres, zoom con pellizco o rueda, marcadores (añadir, arrastrar, renombrar, color, borrar), rutas dibujadas con el dedo (guardar, renombrar, color, ocultar, borrar, compartir e importar con un código), distancia en casillas de la cuadrícula, lista de lugares. Si el mapa no carga, lo dice y desactiva las herramientas. | fortnite-api.com `/v1/map` |
| Stats | Búsqueda por nombre (Epic, PlayStation, Xbox) o por ID de cuenta de Epic; botón «Es mi cuenta». Victorias, eliminaciones, partidas, K/D, % de victorias y top 10, por modo y por control; total o temporada; historial y jugadores favoritos. Necesita la clave (gratuita) en el servidor. | fortnite-api.com `/v2/stats/br/v2` a través de `/api/stats` |
| Cuenta | Inicio de sesión con correo y contraseña (cuenta de DropStats, independiente de Epic). Sincroniza favoritos, jugadores, «mi cuenta» de Fortnite, historial, rutas, marcadores, recordatorios, precios y preferencias entre dispositivos. Contraseñas con scrypt, sesión en cookie HttpOnly y Secure, límite de intentos. Se puede cerrar sesión y eliminar la cuenta. | Upstash Redis (Vercel Storage) a través de `/api/auth` y `/api/sync` |
| Torneos | Enlaces al calendario y las noticias oficiales, y recordatorios que añades tú (en tu hora local). No hay calendario automático: no existe una fuente pública autorizada. | fortnite.com |
| Favoritos | Cosméticos (avisa de cuáles están hoy en la tienda) y jugadores. | Este dispositivo |
| Ajustes | Idioma de los nombres, plataforma y periodo por defecto, «Comprobar» cada fuente, borrar datos, copia de seguridad y restauración. | Este dispositivo |

Favoritos, preferencias, filtros, rutas, marcadores y recordatorios se guardan en el navegador y se mantienen al recargar.


## DropStats Premium (Pro, Elite y Drop Ultra)

Tres planes en orden ascendente, con precios **provisionales** (2,99 €, 5,99 € y 9,99 € al mes). No hay cobros ni suscripciones activas: el botón de cada plan explica que aún no está a la venta.

- **Pro:** métricas extra en Stats, filtros avanzados del catálogo (precio, orden, «solo hoy»), favoritos por categorías, temas Noche morada y Medianoche, accesos rápidos personalizables. Sin widgets.
- **Elite:** todo lo de Pro + gráficas de evolución, total y temporada lado a lado, comparar jugadores, análisis competitivo por modo, etiquetas de estrategias, temas Aurora y Cobalto, modo compacto. Sin widgets.
- **Drop Ultra (nivel máximo):** todo lo anterior + **Ultra Widgets**, personalización total (color de acento, esquinas, tamaño de texto), temas Ultravioleta y Holográfico, efectos visuales, carpetas y estrategias fijadas, insignia Ultra y tarjeta holográfica.

**Permisos:** todo pasa por una única función, `can()`. Los widgets solo existen con Drop Ultra: el panel no se dibuja en otros planes, la ruta `#widgets` muestra una pantalla de bloqueo y cada acción (añadir, quitar, ordenar, cambiar tamaño o diseño, ocultar datos) vuelve a comprobar el plan.

**Selector de demostración:** en Premium → «Selector de demostración» se simula Gratis, Pro, Elite o Ultra para probar los permisos. Es una herramienta de desarrollo, guardada solo en el navegador.

**Suscripción real (futuro):** `Entitlements.plan()` es el único sitio que decide el plan. Para cobrar de verdad habría que añadir una pasarela (por ejemplo Stripe) en una función del servidor, guardar el plan verificado de cada cuenta en la base de datos y hacer que `Entitlements.plan()` lo lea de `/api/auth` en lugar del selector. `Billing.checkout()` ya está preparado para conectarse.

## Ultra Widgets

11 tipos: estadísticas del jugador, victorias, eliminaciones, % de victorias, evolución, tienda actual, cosméticos favoritos, próximos torneos confirmados, acceso rápido al mapa, estrategias guardadas y novedades oficiales del juego. Cada widget se puede añadir, quitar, reordenar, cambiar de tamaño (pequeño, mediano, grande) y de diseño (cristal, sólido, holográfico), y ocultar datos concretos. «Restaurar diseño original» vuelve a la configuración inicial. Si falta información, cada widget muestra un estado vacío explicativo.

- Los datos de jugador salen de tu cuenta marcada con «Es mi cuenta» en Stats.
- La evolución usa mediciones reales guardadas por DropStats (una al día cada vez que se consultan las estadísticas). No se rellena con datos inventados.
- Las novedades son las noticias oficiales del juego (fortnite-api.com, `/v2/news/br`).
- Los torneos «confirmados» son los recordatorios en los que has marcado que comprobaste la fecha en la web oficial.

## Mapa táctico

- **Modo planificación:** pulsa «Planificar» para editar; fuera de ese modo el mapa solo se mira y al tocar un marcador ves su nota.
- **Marcadores con tipo:** aterrizaje, cofre, punto estratégico, rotación y nota. Cada uno tiene nombre, nota, color y una leyenda que permite ocultarlos por tipo.
- **Rutas:** se dibujan con el dedo o el ratón. Cada una tiene nombre y color, y se puede ocultar, duplicar o borrar.
- **Deshacer y rehacer,** borrar todo y encuadrar.
- **Estrategias:** guardar, guardar como nueva, cargar, duplicar, fijar, notas, etiqueta (Elite), carpeta (Ultra), compartir con un código e importarlo, y exportar como imagen PNG. Para exportar, la imagen del mapa pasa por `/api/img`, así el navegador puede dibujarla en un lienzo.

## 2. Estructura

```
dropstats/
  src/app.html          La aplicación (interfaz y lógica)
  build.mjs             Genera public/index.html a partir de src/app.html
  public/               Lo que se publica: index.html, manifest, iconos
  api/fn.js             Proxy de solo lectura a fortnite-api.com, con caché
  api/stats.js          Estadísticas; la clave vive solo aquí
  api/auth.js           Cuentas: crear, entrar, salir, eliminar
  api/sync.js           Datos sincronizados de cada cuenta
  api/_lib.js           Redis, contraseñas, sesiones y protección de peticiones
  api/prices.js         Base de precios compartida (y api/collect.js, tarea diaria)
  api/img.js            Proxy de imágenes de fortnite-api.com para exportar estrategias
  scripts/snapshot.py   Copia de tienda, mapa y novedades con sus imágenes (public/data/)
  vercel.json           Configuración de despliegue
```

La clave de la API nunca llega al navegador: solo la leen las funciones de `api/`, desde una variable de entorno.

## 3. Cómo obtiene los datos la app

1. Primero, el servidor propio `/api/fn` (si la app está desplegada en Vercel).
2. Si no hay servidor, conexión directa con fortnite-api.com desde el navegador.
3. Si las dos fallan, la copia publicada en `data/` (creada con `scripts/snapshot.py`). La copia de la tienda solo se acepta si se obtuvo después del último cambio de tienda; si es anterior, la app muestra el error y no enseña una tienda antigua como actual.

Cada petición tiene un tiempo máximo (12 s) y, si la fuente falla, la app deja de intentarlo durante 60 s salvo que pulses «Reintentar».

## 4. Publicarla (Vercel, gratis)

1. Crea una cuenta en vercel.com (puedes entrar con GitHub).
2. Sube la carpeta `dropstats` a un repositorio nuevo de GitHub (github.com → New repository → «uploading an existing file»).
3. En Vercel: **Add New → Project →** elige el repositorio → **Deploy**.
4. Abre la dirección que te da Vercel. La tienda, el catálogo y el mapa cargan en directo.

### Activar las estadísticas

1. Entra en dash.fortnite-api.com, inicia sesión con Discord y genera tu clave gratuita.
2. Vercel → tu proyecto → **Settings → Environment Variables** → `FORTNITE_API_KEY` = tu clave.
3. **Deployments → … → Redeploy**.
4. En DropStats: Ajustes → Estadísticas → «Comprobar».

### Activar las cuentas (inicio de sesión)

1. Vercel → proyecto **dropstats** → pestaña **Storage** → **Create Database** → **Upstash for Redis** (plan gratuito).
2. Conéctala al proyecto **dropstats** (todos los entornos). Vercel crea las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. **Deployments → … → Redeploy**. En DropStats: icono de persona → Crear cuenta.

No hay recuperación de contraseña por correo: si se olvida, los datos de este dispositivo se conservan y se puede crear otra cuenta.

### En el iPhone

Safari → la dirección de Vercel → Compartir → **Añadir a pantalla de inicio**.

## 5. Dentro de Claude

El visor de páginas de Claude bloquea por seguridad las conexiones y las imágenes de otras webs. Por eso, ahí la app no puede pedir la tienda en directo y muestra un aviso claro. Para verla con datos reales dentro de Claude hay que publicar la copia de `scripts/snapshot.py` junto a la página, cada día, desde un entorno con acceso a fortnite-api.com.

## 6. Limitaciones

- **Fuente no oficial.** Epic no ofrece una API pública de la tienda. fortnite-api.com es comunitaria; si cambia o cae, la app muestra el error.
- **Precios originales incompletos** en el catálogo hasta que DropStats ve cada objeto a la venta por separado.
- **Filtrar el catálogo solo por tipo** descarga todos los objetos de ese tipo; en móvil puede tardar unos segundos.
- **Mapa:** distancias en casillas, no en metros; los lugares se ven rotulados y en lista, pero no se pueden tocar; no hay vista 3D (no existe una fuente autorizada del terreno).
- **Torneos:** sin datos automáticos; los recordatorios los introduce el usuario.
- **Datos locales:** si se borran los datos de Safari se pierden; usa la copia de seguridad de Ajustes.

# DropStats

Tienda diaria, catálogo de cosméticos, mapa interactivo, estadísticas de jugadores y torneos de Fortnite, en una web app pensada para Safari en iPhone y para ordenador.

DropStats es un proyecto independiente. No está afiliado, patrocinado ni aprobado por Epic Games. Fortnite y los nombres e imágenes de sus objetos son marcas de Epic Games, Inc.

Versión del 25 de octubre de 2026 (cuatro planes con pagos por Stripe, Widgets, Drop AI y mapa táctico).

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


## Planes: Gratis, Pro, Elite y Drop Ultra

Cuatro niveles en orden ascendente. Los precios (2,99 €, 5,99 € y 9,99 € al mes) son **provisionales**: no hay pagos ni suscripciones, y el botón de cada plan dice que aún no está a la venta.

| | Gratis | Pro | Elite | Drop Ultra |
|---|---|---|---|---|
| Stats | Victorias, eliminaciones, partidas, % victorias | + K/D, top 10, métricas extra, desglose por modo y control, gráfico por modo, comparar con 1 jugador, fijar/borrar historial | + gráficas históricas (varias métricas), tendencias, total vs temporada, hasta 3 rivales | Todo |
| Mapa | Marcadores, rutas, 5 estrategias | 50 estrategias, buscar, categorías, duplicar, colores de ruta, notas, buscar lugares | Sin límite, modo/temporada/estilo, plan por fases, análisis de rutas, comparar estrategias | + carpetas y estrategias fijadas |
| Catálogo y favoritos | Búsqueda y tipo, 30 favoritos | Rareza, precio, orden, «solo hoy», 300 favoritos, 5 listas, 5 filtros guardados, comparar 2 | Tabla, comparar 4, 20 listas | Sin límites |
| Interfaz | Tema base | 3 temas, compacto, orden del inicio, acabado negro y morado | 5 temas, acabado violeta y azul | 7 temas, efectos, color/esquinas/texto |
| **Widgets** y **Drop AI** | — | — | — | **Solo Ultra** |

**Permisos centralizados:** `can(función)` y `limit(recurso)` en `src/app.html` son el único punto de decisión. `render()` comprueba `ROUTE_FEATURE` antes de dibujar cualquier vista, así que `#widgets` y `#ai` muestran la pantalla de bloqueo aunque se entre con un enlace directo, y cada acción (añadir widget, enviar a Drop AI…) vuelve a comprobar el plan.

**Selector de demostración:** Premium → «Selector de demostración» (Gratis, Pro, Elite, Ultra). Cambia los permisos al instante y no borra nada: si bajas de plan, la configuración se conserva y vuelve al subir.

**Suscripción real (futuro):** `Entitlements.plan()` es el único sitio que decide el plan. Para cobrar habría que añadir una pasarela (por ejemplo Stripe) en el servidor, guardar el plan verificado de cada cuenta y que `Entitlements.plan()` lo lea de `/api/auth`. `api/ai.js` tiene marcado dónde comprobar Drop Ultra en el servidor.

## Widgets (Drop Ultra)

12 tipos: estadísticas del jugador, victorias, eliminaciones, % de victorias, resumen de temporada, tienda actual, cosméticos favoritos, torneos confirmados, rutas y estrategias, accesos rápidos, novedades oficiales y tu mejor modo (K/D por modo). Se pueden añadir, quitar, reordenar (botones subir/bajar), cambiar de tamaño y diseño, elegir los datos visibles, configurar (por ejemplo, qué accesos muestra), cambiar la disposición (cuadrícula o lista) y restaurar el diseño original. Se guardan solos en el dispositivo y en la cuenta.

## Drop AI (Drop Ultra)

Chat con un modelo de IA real a través de `/api/ai`: burbujas, respuestas con formato, copiar, nueva conversación, historial local, preguntas sugeridas, estados de carga y error. Con «Usar mis datos de DropStats» activado envía al modelo solo lo que la app tiene cargado (tus stats, estrategias, tienda, torneos con su marca de confirmado, novedades) y una lista de lo que **no** está disponible, para que no afirme haberlo consultado.

Configuración (Vercel → Settings → Environment Variables):

- `GROQ_API_KEY` — **recomendado.** Groq tiene nivel gratuito sin tarjeta (https://console.groq.com/keys). Modelo principal `openai/gpt-oss-120b`; si está saturado, prueba `llama-3.3-70b-versatile` y `llama-3.1-8b-instant` (cambiables con `AI_MODEL` y `AI_FALLBACK_MODELS`). El nivel gratuito limita peticiones y tokens por minuto y por día; los valores exactos se ven en console.groq.com/settings/limits.
- `ANTHROPIC_API_KEY` — Claude (de pago). `AI_API_KEY` + `AI_BASE_URL` + `AI_MODEL` — cualquier API compatible con OpenAI.
- `GEMINI_API_KEY` — admitido, pero las condiciones de Google no permiten usar su nivel gratuito para dar servicio a usuarios del EEE (España incluida); solo con facturación activada.
- Opcionales: `AI_PROVIDER` (forzar proveedor), `AI_DAILY_LIMIT` (30 mensajes por cuenta y día), `AI_GLOBAL_LIMIT` (300 al día en total), `AI_PING_LIMIT` (20 pruebas al día).

Datos de armas: cuando se pregunta por un arma (daño, cadencia, cargador…), el servidor identifica el arma, consulta la **Fortnite Wiki** (fortnite.fandom.com, API pública y gratuita) y pasa al modelo solo la ficha y las estadísticas por rareza del parche actual; la respuesta cita la página. Si la wiki no tiene el arma, Drop AI lo dice y no da cifras. La búsqueda web libre de Groq queda desactivada (en pruebas devolvió notas de parche de 2018 como actuales); se activa con `AI_WEB_SEARCH=on`.

Prueba real: Ajustes → Fuentes de datos → Drop AI → «Comprobar» (llama a `/api/ai?op=ping`, que hace una petición mínima al proveedor).

Requiere sesión iniciada (para aplicar el límite diario en Redis). Si no hay clave, la pantalla dice que el servicio aún no está configurado y no envía nada.

## Competitivo: PR y earnings (gratis)

En Stats, al buscar un jugador aparece la sección «Competitivo» (`api/competitive.js`), gratis para todos:

- **PR (Power Ranking):** Power Rankings de Epic a través de api-fortnite.com (clave `APIFORTNITE_API_KEY` o `METALAB_API_KEY`, plan gratuito). Solo se usan las consultas que no necesitan la cuenta de Epic del jugador, así que solo hay datos de quien está o ha estado en el **top 10.000**. Se muestran el PR, el puesto, el mejor puesto, el PR máximo, el cambio y los torneos que cuentan.
- **Earnings:** Esports Earnings (clave `ESPORTSEARNINGS_API_KEY`). No usa cuentas de Epic: se busca el nombre exacto entre los jugadores de Fortnite con más premios (índice semanal) y se indica como «coincidencia por nombre», con enlace al perfil. Si hay varios con el mismo nombre, el usuario elige.
- **Actual frente a histórico:** cada dato lleva su etiqueta. La evolución del PR usa solo mediciones reales que guarda DropStats (una al día por jugador consultado) y aparece a partir de dos días distintos; los huecos no se rellenan. Los premios por año salen de los torneos reales de la fuente.
- Sin clave o sin respuesta de la fuente: «Datos no disponibles actualmente».
- El análisis avanzado para Drop Ultra está como «Próximamente» y no bloquea nada.

## Funciones en desarrollo («Próximamente»)

El registro `SOON` de `src/app.html` guarda cada función que depende de un servicio no disponible: su estado («Próximamente», «No disponible aún» o «En desarrollo»), el motivo y lo que falta. Sus botones explican el motivo al pulsarlos; no se muestran datos inventados ni de ejemplo.

| Función | Estado | Para activarla |
|---|---|---|
| Suscripciones Pro, Elite y Ultra | Próximamente | `BILLING_ENABLED=on` + clave de Stripe (ver «Pagos»). Requiere revisar antes las condiciones de Epic y que un adulto responsable lleve la cuenta. |
| Meta Lab | Próximamente | `METALAB_ENABLED=on` + `METALAB_API_KEY` con un plan que incluya armas. El módulo completo de la app está en el historial de git (commit `252a965`, sección «META LAB» de `src/app.html`). |
| Calendario automático de torneos | No disponible aún | Una fuente oficial de Epic. |
| Vista 3D y distancias en metros | No disponible aún | Una fuente oficial del terreno y de la escala. |

## Publicidad (preparada, desactivada)

`ADS.enabled = false` en `src/app.html`. Los espacios (`adSlot()`: inicio, tienda, catálogo y estadísticas) no se dibujan, no cargan scripts, no crean cookies y no recogen datos. Para ver cómo quedarían: añade `?adpreview=1` a la dirección.

Antes de activar cualquier publicidad hay que confirmar que está permitida: la política de contenido de fans de Epic (sección 1.4: sin objetivo comercial), el plan Hobby de Vercel (solo uso no comercial) y los requisitos de la plataforma (edad, aviso de consentimiento certificado en el EEE).

## Pagos (Stripe)

`api/billing.js` crea la página de pago de Stripe (Checkout), comprueba cada pago con Stripe en el servidor antes de activar el plan y abre el portal de cliente (cambiar de plan, cancelar, facturas, tarjeta). No hace falta configurar webhooks: el plan se vuelve a comprobar con Stripe cada 30 minutos y al volver del portal.

- **Interruptor general:** sin `BILLING_ENABLED=on` el sistema de pagos está apagado aunque haya una clave (estado actual).
- `STRIPE_SECRET_KEY` = `sk_test_…` → **modo de prueba** (tarjeta 4242 4242 4242 4242, sin dinero real). Se mantiene el selector de demostración.
- `STRIPE_SECRET_KEY` = `sk_live_…` + `BILLING_LIVE=on` → **cobros reales**. Sin `BILLING_LIVE=on` una clave real se ignora. En este modo el selector de demostración desaparece y Drop AI exige Ultra pagado también en el servidor.
- Los productos y precios (2,99 €, 5,99 € y 9,99 € al mes, IVA incluido) se crean solos en Stripe la primera vez.

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
  api/ai.js             Drop AI: llama al modelo de IA (Gemini, Claude o compatible) con límite diario
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

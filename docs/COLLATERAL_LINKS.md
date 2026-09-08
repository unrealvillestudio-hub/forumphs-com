# Enlaces con token para material comercial — ruta `/bim`

Sirve material comercial confidencial desde una ruta propia, de forma que cada destinatario
recibe un enlace único que **caduca**, es **revocable**, y **registra si fue abierto**.
Sin token válido no hay acceso.

```
https://forumphs.com/bim/7kQ2mFp9XcR4wLtY8vBnAe
```

## Lo que garantiza, y lo que no

**No es posible impedir que quien abre el documento lo guarde.** Cualquier navegador permite
guardar la página o ver el código, y ninguna solución basada en servir HTML cambia eso.
Prometer lo contrario sería mentir sobre la herramienta.

Lo que sí garantiza:

- no hay botón de descarga y el documento se sirve embebido;
- deja de servirse **de inmediato** al vencer o al revocarse, sin esperar a que expire una caché;
- queda registrado quién lo abrió, cuándo fue la primera vez y cuántas veces;
- abrir el documento **no genera ninguna conexión a un tercero** — ni tipografías ni gráficas.

## Lo que NO se registra

**La IP del visitante no se almacena.** La Cláusula Sexta del acuerdo de confidencialidad que
firma el cliente invoca los principios de finalidad y proporcionalidad: guardar la IP de quien
lee el material excede lo necesario para saber si fue abierto. La IP se usa en memoria para el
límite de tasa y se descarta.

`last_user_agent` se guarda truncado a 200 caracteres — sirve para distinguir «lo abrió en el
móvil» de «lo abrió un rastreador», no para perfilar a nadie.

---

## Piezas

| Pieza | Dónde | Qué es |
|---|---|---|
| `api/_collateral.js` | repo | **Eje.** Token, caducidad, revocación, registro y validación de marca. No conoce ninguna marca. |
| `api/bim.js` | repo | **Instancia.** La ruta que este sitio publica. Otra marca monta el módulo bajo la dirección que quiera. |
| `assets/collateral/` | repo | Chart.js y tipografías interiorizadas. |
| `scripts/vendor-collateral.mjs` | repo | Regenera lo anterior desde npm y Google Fonts. |
| `scripts/collateral-link.mjs` | repo | Genera un token y arma el `INSERT`. **No toca la base de datos.** |
| `scripts/verify-bim.mjs` | repo | Verifica la ruta entera contra simulaciones. `node scripts/verify-bim.mjs` |
| `favicon.ico` · `favicon-32x32.png` · `favicon-192x192.png` · `apple-touch-icon.png` | raíz | Derivados del icono oficial de marca. |
| `public.collateral_links` | Supabase UNRLVL | La tabla. RLS sin política: sólo `service_role`. |
| bucket `collateral` | Supabase UNRLVL | Privado. **No se hace público en ningún caso.** |

## Requisitos previos

Variables de entorno en el proyecto de Vercel — **las tres ya existen**, son las mismas que usa
el blog (`api/_channel.js`):

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | a quién preguntar |
| `SUPABASE_SERVICE_ROLE_KEY` | con qué permisos. **Nunca en el repo.** Sólo en código de servidor. |
| `BRAND_ID` | por quién preguntar. La ruta rechaza toda fila cuyo `brand_id` no coincida. |

---

## Publicar un documento

El bucket es privado y la ruta lo lee desde el servidor. La convención de rutas es
`{brand_id}/{nombre}.html`.

**Antes de subir**, interiorizar las dependencias del documento — es el paso que evita que
abrirlo filtre la IP del lector a Google y que una junta directiva detrás de un firewall
corporativo vea el informe sin gráficas:

```bash
node scripts/vendor-collateral.mjs          # sólo si assets/collateral/ no está al día
```

y en el HTML, sustituir las referencias remotas por las locales:

```html
<!-- antes -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- después -->
<link rel="stylesheet" href="/assets/collateral/fonts.css">
<script src="/assets/collateral/chart.umd.min.js"></script>
```

`scripts/vendor-collateral.mjs` exporta `localizeDocument(html)`, que hace exactamente esa
sustitución y además **devuelve las referencias remotas que hayan quedado vivas**. Una sola
que sobreviva basta para filtrar la IP, así que conviene comprobar la lista antes de subir:

```bash
grep -oE 'https?://(fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|unpkg\.com)[^"'"'"']*' documento.html
# sin salida = interiorizado
```

## Emitir un enlace

```bash
node scripts/collateral-link.mjs \
  --brand ForumPHs \
  --asset ForumPHs/suite-gestion-financiera.html \
  --name  "Nombre del destinatario" \
  --email persona@ejemplo.com \
  --note  "Junta directiva, primera revisión" \
  --days  30 \
  --base  https://forumphs.com
```

Imprime el `INSERT` listo y el enlace resultante. **No escribe en la base de datos**: el SQL se
revisa y se ejecuta aparte, porque quien genera el enlace no es quien decide enviarlo.

El token se genera con el mismo código que valida la ruta —22 caracteres base62, 128 bits— y la
tabla lo comprueba con una restricción. Un token escrito a mano falla el `INSERT` en vez de
producir un enlace muerto sin señal de por qué.

## Revocar

```sql
update public.collateral_links set revoked_at = now() where token = '<token>';
```

Surte efecto **en la petición siguiente**, sin recarga forzada: la ruta responde con
`Cache-Control: private, no-store` y el CDN nunca guarda copia.

Para retirar un documento entero de circulación, borrar el objeto del bucket: ninguna fila que
lo apunte servirá nada, y la ruta responde con un error ruidoso en vez de una página vacía.

## Auditar

```sql
select recipient_name, recipient_email, note,
       expires_at, revoked_at,
       open_count, first_opened_at, last_opened_at
from public.collateral_links
where brand_id = 'ForumPHs'
order by created_at desc;
```

Enlaces vigentes que nadie abrió todavía:

```sql
select recipient_name, recipient_email, expires_at
from public.collateral_links
where brand_id = 'ForumPHs'
  and revoked_at is null and expires_at > now() and open_count = 0
order by expires_at;
```

---

## Comportamiento de la ruta

| caso | respuesta |
|---|---|
| Token válido, vigente, no revocado, `brand_id` coincide | **200** — sirve el HTML embebido y registra la apertura |
| Token vencido | **410** — «Este enlace ha vencido» |
| Token revocado | **410** — misma página |
| Token inexistente, malformado, o **de otra marca** | **404** — «Acceso no disponible» |
| `/bim` sin token | **404** — misma página |
| Fallo de base de datos o de almacenamiento | **5xx** ruidoso, con el código en `X-Collateral-Error` |

**Un token de otra marca responde 404, no 410.** La marca se comprueba *antes* que la vigencia:
si se comprobara después, el sitio de una marca informaría del estado de un enlace de otra con
sólo conocer el token, y «404 o 410» ya es información.

**Distinguir «vencido» de «inexistente» sí es deliberado**, y en el otro sentido: le filtra algo
a quien enumere tokens, pero con 128 bits la enumeración es inviable, y el aviso de vencimiento
es justamente el que produce la solicitud de renovación.

### Cabeceras

```
Content-Type: text/html; charset=utf-8
Cache-Control: private, no-store, max-age=0, must-revalidate
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
Referrer-Policy: no-referrer
```

**`no-store` es crítico.** Sin él, el CDN de Vercel podría cachear la respuesta y seguir
sirviendo el documento después de que el token venciera o se revocara. Sería un fallo
**silencioso**: la revocación parecería aplicada y no lo estaría. Por eso va **dos veces** — la
función la fija en cada respuesta, incluidas las de error, y `vercel.json` la fija en el borde
para `/bim/*`.

No lleva `Content-Disposition: attachment`: el documento se muestra, no se descarga.

### Registro de apertura

`open_count + 1`, `last_opened_at = now()`, y `first_opened_at` **sólo si estaba vacío**.

Corre en paralelo con la descarga del objeto, así que no añade espera. **Si el registro falla,
el documento se sirve igual** — nunca al revés.

Una petición `HEAD` (`curl -I`) **no cuenta como apertura**: comprueba cabeceras, no lee el
documento, y contarla ensuciaría justo la señal que esta tabla existe para dar.

**Degradación declarada:** el incremento se calcula sobre el valor leído, no con un `UPDATE …
SET open_count = open_count + 1` atómico, porque PostgREST no expresa esa forma sin una función.
Dos aperturas simultáneas del mismo enlace podrían contar como una. Se acepta a cambio de no
añadir una `SECURITY DEFINER` a la superficie; el dato que importa —si se abrió y cuándo— no se
pierde en ningún caso.

### Límite de tasa

30 peticiones por IP por minuto sobre `/bim/*`, en memoria y **por instancia**. Es un tope
best-effort declarado, suficiente para que un intento de enumeración no consuma cuota; no
pretende ser una defensa distribuida — con 128 bits la enumeración es inviable de todos modos.

---

## Multimarca

`collateral_links` no contiene ninguna referencia a ForumPHs en su estructura, y el manejador
está escrito como módulo reutilizable.

### Test de la marca N+1

1. **¿Sobrevive a otra marca de otro rubro y país?** Sí. Otra marca monta `api/_collateral.js`
   en su dominio con su `BRAND_ID`, y sus filas apuntan a su carpeta del bucket. Sin cambios de
   esquema y sin tocar código.
2. **¿El nombre describe función o caso?** `collateral_links` describe qué es: enlaces a material
   comercial. No menciona marca ni tipo de documento. `/bim` es la dirección de *este* sitio y
   vive en `api/bim.js`, que es artefacto de una marca; el mecanismo no está ahí.
3. **¿Eje o instancia?** El eje —«un enlace con token, caducidad, revocación y registro de
   apertura»— va en código. La instancia —el token, el destinatario, el archivo, la marca, el
   tema visual de las páginas de aviso, el correo de contacto— va en la tabla.
4. **¿Cuántas marcas hay hoy en la enumeración?** Ninguna en el código. `brand_id` es un valor de
   fila. En `intel.brand_publish_channels` hay **tres** marcas con `provider = 'vercel_html'`
   [medido 2026-09-07]: ForumPHs, UnrealvilleStudio y LucienSael.

### Correo de contacto de las páginas de aviso

Sale de `config.contact_email` de la fila del canal. **Si la fila no lo trae, la línea de
contacto se omite** — dejar una dirección de respaldo en el código sería exactamente el literal
de marca que la regla prohíbe. Para activarla:

```sql
update intel.brand_publish_channels
set config = config || '{"contact_email":"info@forumphs.com"}'::jsonb
where brand_id = 'ForumPHs' and provider = 'vercel_html';
```

---

## Puesta en marcha

Todo lo de abajo es **posterior al merge** y requiere OK explícito de Sam. El PR no aplica
migraciones ni despliega.

1. **Aplicar las migraciones** en el proyecto UNRLVL (`amlvyycfepwhiindxgzw`), en orden:
   `20260908_collateral_links.sql` (tabla, índice, RLS) y después
   `20260908_collateral_links_grants.sql` (privilegios de `service_role`). La segunda ya
   está aplicada en producción desde el 2026-09-08; el archivo existe para que reconstruir
   el esquema desde las migraciones no vuelva a dejar el hueco.
2. **Crear el bucket privado** `collateral`. **No marcarlo público.**
3. **Subir el documento** ya interiorizado a `ForumPHs/<nombre>.html`.
4. **Emitir un enlace de prueba** a una dirección propia y recorrer la tabla de verificación.

### Privilegios de `service_role` — y por qué el hueco no se vio

Los privilegios **por defecto** de este proyecto sobre `public` son `{service_role=r/postgres}`
[`medido` 2026-09-08]: una tabla nueva nace con `service_role` **pudiendo leer y sin poder
escribir**.

La ruta lee con `SELECT` y registra la apertura con `UPDATE`. Así que el documento se servía
bien y sólo fallaba el registro — atrapado por su propio `catch`, anotado como
`OPEN_NOT_RECORDED`, y el documento entregado igual. **El diseño «el registro nunca bloquea
la entrega» escondía este fallo**: `open_count` se habría quedado en 0 para siempre y la
página se habría visto perfecta. La trazabilidad, que es la mitad del motivo por el que
existe esta tabla, habría estado muerta sin una sola señal.

`20260908_collateral_links_grants.sql` deja el `GRANT SELECT, INSERT, UPDATE` explícito.
**Sin `DELETE`, a propósito:** un enlace no se borra, se revoca —que es un `UPDATE` de
`revoked_at`—, y un registro que se puede borrar desde la misma ruta que lo escribe no es
un registro.

```sql
select relacl::text from pg_class
 where relname = 'collateral_links' and relnamespace = 'public'::regnamespace;
-- {postgres=arwdDxtm/postgres,service_role=arw/postgres}
```

> ### ⚠️ Lo que un PostgreSQL desechable NO verifica
>
> Las migraciones de este repositorio se validan contra un PostgreSQL local. **Esa
> validación no cubre privilegios de rol ni RLS de Supabase**, porque `anon`,
> `authenticated` y `service_role` **no existen en un PostgreSQL limpio**: hay que crearlos
> a mano, y entonces se crean sin los privilegios por defecto que Supabase configura en sus
> proyectos. Una migración puede pasar entera en local y dejar un hueco de permisos en
> producción — y este fue el segundo hallazgo de esa clase.
>
> Lo que sí cubre: sintaxis, restricciones, idempotencia, orden de aplicación y el
> comportamiento de las políticas RLS que la propia migración crea.
>
> Lo que hay que comprobar **contra el proyecto real**, siempre, después de aplicar:
>
> ```sql
> select relacl::text, relrowsecurity from pg_class
>  where relname = '<tabla>' and relnamespace = 'public'::regnamespace;
> ```

### Wordmark de las páginas de aviso

Las páginas de vencido y de acceso no disponible cierran con el wordmark de la marca. El
módulo es eje, así que **no lo lleva escrito**: sabe que un wordmark es una secuencia de
partes con un rol tipográfico, un peso, un rol de color y un espaciado, y los valores salen
de `config.wordmark` de la fila del canal. Los roles se resuelven contra `config.theme`, así
que la misma estructura sirve para una marca con acento terracota y para otra con acento
cian.

Si el canal no trae `wordmark`, la página cierra con el nombre del sitio en versalitas. No
es un wordmark pobre: es texto declaradamente sin marca, que es lo honesto cuando falta el
dato.

Para sembrarlo — los valores salen del sistema de marca, no de aquí:

```sql
update intel.brand_publish_channels
set config = config || '{"wordmark":{"parts":[
  {"text":"Forum","font":"display","weight":400,"color":"text","tracking":"0.01em"},
  {"text":"PH","font":"sans","weight":700,"color":"accent","tracking":"0.06em"},
  {"text":"s","font":"sans","weight":700,"color":"accent","tracking":"0.04em"}
]}}'::jsonb
where brand_id = 'ForumPHs' and provider = 'vercel_html';
```

**Son tres partes y no dos.** «PH» y «s» comparten familia y peso pero llevan espaciados
distintos, y eso es lo que alinea la «s» a la altura de x de «orum»
(`BluePrints/brands/ForumPHs/assets/ForumPHs_Amatista_Carbon_vFINAL.html`, bloque
`WORDMARK SYSTEM`). Partirlo en dos da un wordmark parecido y mal.

`font` acepta `display`, `serif` y `sans`; `color` acepta `text`, `text_2`, `text_3`,
`accent`, `accent_2`, `warn` y `line`. Un rol desconocido cae a un valor seguro y una parte
sin texto se descarta: un wordmark torcido en una página de error es peor que el nombre en
texto plano.

### Iconos del sitio

Los cuatro derivan del icono oficial
`BluePrints/brands/ForumPHs/assets/FPHS_favicon_deep.png` (2363×2363, RGBA, esquinas
transparentes, círculo `#3A1F4A`):

| archivo | tamaño | nota |
|---|---|---|
| `favicon.ico` | 16 · 32 · 48 | multi-tamaño, conserva transparencia |
| `favicon-32x32.png` | 32 | navegadores modernos |
| `favicon-192x192.png` | 192 | Android e instalables |
| `apple-touch-icon.png` | 180 | **aplanado** sobre `#3A1F4A` |

El `apple-touch-icon` es el único aplanado porque iOS compone la transparencia sobre negro y
dejaría un anillo oscuro alrededor del círculo. Se aplana sobre el color del **propio
círculo**, así que no se inventa ningún color: iOS redondea el cuadrado y el resultado es la
marca tal cual.

Las **rutas** (`/favicon.ico`, etc.) sí viven en el módulo compartido, y no son literal de
marca: son una convención que cumple cualquier sitio, y cada despliegue sirve en ellas el
icono de su marca. Lo que sería literal es la imagen, y la imagen está en la raíz del sitio,
no en el eje.

### Verificación posterior al despliegue

| prueba | resultado esperado |
|---|---|
| Token válido | Se muestra el informe; `open_count` pasa a 1 y `first_opened_at` se llena |
| Segunda apertura del mismo token | `open_count` en 2; `first_opened_at` **no cambia** |
| Token con `expires_at` en el pasado | 410 y página de vencimiento |
| Token con `revoked_at` fijado | 410, incluso si fue abierto minutos antes |
| Token inventado | 404 |
| `/bim` sin token | 404 |
| Token de otra marca | 404; nunca sirve el documento |
| Revocar y recargar de inmediato | 410 al primer intento — comprueba que `no-store` impide el caché del CDN |
| Cargar con red de terceros bloqueada | Gráficas y tipografías se ven igual |
| `curl -I` sobre un token válido | Las cuatro cabeceras presentes; `open_count` **no** sube |

Los diez casos están cubiertos también contra simulaciones, sin desplegar:

```bash
node scripts/verify-bim.mjs
```

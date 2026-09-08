-- 20260908_collateral_links.sql
-- Enlaces a material comercial con token, caducidad, revocación y registro de apertura.
--
-- INFRAESTRUCTURA TRANSVERSAL, NO DE UNA MARCA. La estructura no menciona ninguna marca
-- ni ningún tipo de documento: `brand_id` es un valor de fila, tomado del catálogo
-- `public.brands`, y `asset_path` apunta a la carpeta de esa marca dentro del bucket.
-- Una marca nueva entra insertando filas. Cero DDL.
--
-- NO SE APLICA CON EL MERGE. Este archivo viaja en el repo; la aplicación es un acto
-- aparte, posterior al merge y con OK explícito de Sam (HRD-R14).

create table if not exists public.collateral_links (
  id              uuid primary key default gen_random_uuid(),
  token           text        not null,
  brand_id        text        not null,
  asset_path      text        not null,   -- ruta dentro del bucket privado `collateral`
  recipient_name  text,
  recipient_email text,
  note            text,                   -- contexto interno del envío
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  first_opened_at timestamptz,
  last_opened_at  timestamptz,
  open_count      integer     not null default 0,
  last_user_agent text,
  created_at      timestamptz not null default now(),
  created_by      text,
  constraint collateral_links_token_key unique (token),

  -- La forma del token la comprueban la ruta y la tabla, y comprueban LA MISMA. Sin esta
  -- restricción, un token insertado a mano con otra longitud se guardaría sin protestar y
  -- la ruta lo rechazaría después con un 404 indistinguible de «no existe»: un enlace
  -- muerto al nacer y sin señal de por qué. 22 caracteres base62 son los 128 bits que
  -- vuelven inviable la enumeración.
  constraint collateral_links_token_shape check (token ~ '^[0-9A-Za-z]{22}$'),

  -- Un `asset_path` vacío o con salto de directorio no es un dato: es un fallo esperando
  -- a ocurrir en la lectura del bucket.
  constraint collateral_links_asset_path_shape check (
    asset_path <> '' and asset_path !~ '(^/)|(\.\.)'
  )
);

create index if not exists idx_collateral_links_brand
  on public.collateral_links (brand_id, created_at desc);

-- ── Acceso ──────────────────────────────────────────────────────────────────────────
--
-- RLS habilitada y SIN NINGUNA POLÍTICA. No es un olvido: es el diseño. Sin política,
-- `anon` y `authenticated` no leen ni escriben una sola fila, y `service_role` pasa por
-- encima de RLS. Esta tabla se lee y se escribe únicamente desde el servidor.
--
-- A diferencia del auto-respondedor de correo, aquí el acceso ocurre en una función
-- serverless de Vercel, no en un Worker público: la clave de servicio nunca llega al
-- cliente porque la ruta responde HTML ya renderizado.

alter table public.collateral_links enable row level security;

-- El `revoke` es redundante con RLS y va igual. Supabase concede privilegios por defecto
-- a `anon` y `authenticated` sobre las tablas nuevas de `public`, así que sin esta línea
-- la tabla queda expuesta en PostgREST y sólo RLS la separa de una lectura anónima. Dos
-- cerrojos en vez de uno, por la misma razón que `CC_PROTOCOL.md` §11 pone el `revoke`
-- antes del `grant`: lo que nace abierto por defecto se cierra explícitamente.
revoke all on public.collateral_links from anon, authenticated;

comment on table public.collateral_links is
  'Enlaces con token a material comercial confidencial. Eje del sistema: caducidad, revocación y registro de apertura. La marca, el destinatario y el archivo son instancia (fila). Servido por la ruta que monta api/_collateral.js. Sin política de RLS a propósito: sólo service_role.';

comment on column public.collateral_links.token is
  '22 caracteres base62 = 128 bits. Se genera con scripts/collateral-link.mjs; la restricción collateral_links_token_shape y la ruta validan la misma forma.';

comment on column public.collateral_links.brand_id is
  'FK lógica a public.brands.id. La ruta compara este valor contra el BRAND_ID del sitio que sirve y rechaza si no coinciden: sin esa comparación, el sitio de una marca serviría material de otra con sólo conocer el token.';

comment on column public.collateral_links.asset_path is
  'Ruta dentro del bucket privado `collateral`, con la forma {brand_id}/{nombre}.html. El bucket no se hace público en ningún caso.';

comment on column public.collateral_links.last_user_agent is
  'Truncado a 200 caracteres por la ruta. La IP del visitante NO se almacena: la Cláusula Sexta del acuerdo de confidencialidad invoca finalidad y proporcionalidad, y guardar la IP de quien lee excede lo necesario para saber si fue abierto.';

comment on column public.collateral_links.first_opened_at is
  'Se fija sólo en la primera apertura y no se reescribe. Una petición HEAD (curl -I) no cuenta como apertura.';

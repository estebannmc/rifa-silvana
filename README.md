# Rifa a beneficio · landing

Landing mobile-first con estética liquid glass para la rifa de Silvana. Tiene grilla de números del 00 al 200, pago con **Mercado Pago (Checkout Pro)** y transferencia como alternativa.

- **Frontend:** `index.html`, `styles.css`, `app.js` (HTML/CSS/JS sin build).
- **Backend:** funciones serverless de Vercel en `api/` (`api/_lib/` tiene código compartido y no se expone).
- **Base de datos:** Supabase, proyecto `rifa-silvana` (`https://mbhuxcmpraxqhwqbxoaj.supabase.co`). El esquema está en `supabase/schema.sql` y ya está aplicado.
- **Web publicada:** <https://rifa-silvana.vercel.app>

## Cómo funciona

1. La persona elige números y completa nombre y celular.
2. **Pago con Mercado Pago:** `/api/checkout` reserva los números por 20 minutos y crea la preferencia. La persona paga en Mercado Pago (en el celular se abre la app si está instalada).
3. Mercado Pago avisa a `/api/webhook`. El servidor consulta el pago a la API de Mercado Pago y, si está aprobado y el monto coincide, marca los números como **vendidos**.
4. La persona vuelve a la web con `?pago=ok` y ve el cartel de éxito. Si el webhook se demora, `/api/order` confirma el pago consultándolo a Mercado Pago.
5. **Transferencia:** los números quedan **reservados 12 h**. La persona le manda el comprobante a Silvana con el botón de WhatsApp de la web, y Silvana confirma a mano (ver abajo).

Las reservas vencidas se liberan solas. Silvana ve cada venta en la vista `ventas` de Supabase y cada pago en la app de Mercado Pago.

## Puesta en marcha (una sola vez)

### 1. Supabase: clave secreta del servidor
La web guarda los números vendidos en Supabase. Para escribir ahí, las funciones de Vercel necesitan una **clave secreta** del proyecto. Es como una llave maestra de la base de datos: solo se pega en Vercel, nunca en la web, en un chat ni en un mensaje.

1. Abrir <https://supabase.com/dashboard/project/mbhuxcmpraxqhwqbxoaj/settings/api-keys> (proyecto **rifa-silvana** → ⚙️ *Project Settings* → *API Keys*).
2. Copiar una de estas dos claves, según lo que muestre la página:
   - pestaña **"Publishable and secret keys"** → sección **Secret keys** → botón de copiar de la clave que empieza con `sb_secret_…` (si no hay ninguna, crearla con **+ New secret key**);
   - o, si aparece la pestaña **"Legacy API keys"**, la clave **`service_role`** (tocar *Reveal* y copiar; empieza con `eyJ…`).

   Cualquiera de las dos funciona. **No** usar la `anon` ni la `sb_publishable_…`, porque esas son públicas y no tienen permiso.
3. Pegarla en Vercel como `SUPABASE_SERVICE_ROLE_KEY` (ver el paso 3).

### 2. Mercado Pago: Access Token y webhook
1. Entrar a <https://www.mercadopago.com.ar/developers/panel/app> con la cuenta de Silvana → **Crear aplicación** → tipo *Pagos online* → producto **Checkout Pro**.
2. En **Credenciales de prueba**, copiar el **Access Token** (`TEST-…`) para probar. Cuando todo funcione, cambiarlo por el de **Credenciales de producción** (`APP_USR-…`).
3. *(Recomendado)* En **Webhooks** → *Configurar notificaciones*: URL `https://rifa-silvana.vercel.app/api/webhook`, evento **Pagos**. Copiar la **clave secreta** que muestra: es `MP_WEBHOOK_SECRET`.

### 3. Variables de entorno en Vercel
Entrar a <https://vercel.com/estebannmcs-projects/rifa-silvana/settings/environment-variables>, cargar cada una con *Environment* = **Production** y tocar **Save**:

| Variable | Valor | Estado |
|---|---|---|
| `SUPABASE_URL` | `https://mbhuxcmpraxqhwqbxoaj.supabase.co` | ✅ ya cargada |
| `SITE_URL` | `https://rifa-silvana.vercel.app` | ✅ ya cargada |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave secreta del paso 1 | falta |
| `MP_ACCESS_TOKEN` | Access Token de Mercado Pago (`TEST-…` o `APP_USR-…`) | falta |
| `MP_WEBHOOK_SECRET` | clave secreta del webhook (opcional pero recomendada) | ✅ cargada |
| `ADMIN_PASSWORD` | la contraseña del panel `/admin` | falta |
| `ADMIN_USER` | *(opcional)* usuario del panel; si no está, es `Silvana` | — |

Después de cargarlas, volver a publicar: Vercel → *Deployments* → el último → **⋯ → Redeploy** (o `npx vercel deploy --prod`).

## Publicar cambios

El proyecto de Vercel está conectado al repo privado [`estebannmc/rifa-silvana`](https://github.com/estebannmc/rifa-silvana):

- cada `git push` a **`main`** publica en producción (<https://rifa-silvana.vercel.app>) automáticamente;
- cualquier otra rama genera una **vista previa** con su propia URL, sin tocar la web real.

```bash
git add -A
git commit -m "Descripción del cambio"
git push
```

## Panel de Silvana (`/admin`)

Entrar a <https://rifa-silvana.vercel.app/admin> con el usuario `Silvana` (no distingue mayúsculas) y la contraseña cargada en `ADMIN_PASSWORD`. La sesión dura 12 h. Después de 8 intentos fallidos desde la misma conexión, el ingreso se bloquea 15 minutos.

- **Transferencias por confirmar:** cuando llega la captura y la plata está en la cuenta, tocar **Confirmar pago** y los números pasan a vendidos. **Liberar** los deja disponibles otra vez.
- **Bloquear números vendidos por fuera:** tocar los números en la grilla, completar nombre, celular e importe (todos opcionales) y tocar **Bloquear números**.
- **Ventas confirmadas:** lista de todas las ventas. **Anular venta** libera sus números, por ejemplo si hubo un error o una devolución.
- Arriba se ven los totales: vendidos, reservados, libres y recaudado.

## Tareas avanzadas (desde el Table Editor de Supabase)

Todo lo de esta sección también se puede hacer desde el panel.


- **Ver ventas:** la vista **`ventas`** muestra fecha, nombre, teléfono, números, importe, medio, estado y nota.
- **Confirmar una transferencia:** cuando llega el comprobante por WhatsApp, ir a la tabla **`orders`**, buscar el pedido (`method = transferencia`, `status = pending`) y cambiar `status` a **`paid`**. Los números pasan a vendidos automáticamente.
- **Cancelar un pedido:** cambiar `status` a **`cancelled`**. Los números reservados se liberan.
- **Registrar una venta en efectivo:** insertar una fila en **`orders`** con `nombre`, `telefono`, `numbers` (por ejemplo `{12,45}`), `amount`, `method = manual` y `status = paid`.
- **Revisar notas:** si la columna `nota` de una venta empieza con "CONFLICTO" (choque de números) o "MONTO DISTINTO" (se pagó otro importe), hay que revisarla y contactar a la persona. Las dos cosas son muy raras.

## Probar en local

```bash
npx -y http-server . -p 5173 -c-1
```

Sin backend, la página entra en **modo demo**: el 08 y el 27 aparecen vendidos y el pago no está conectado. También se puede forzar el modo demo con `?demo=1`.

## Prueba de punta a punta (con credenciales TEST)

1. En Mercado Pago Developers → *Cuentas de prueba*, crear un usuario **comprador de prueba**.
2. Abrir la web publicada, elegir números y pagar con una [tarjeta de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) (titular `APRO` = aprobado, `OTHE` = rechazado).
3. Verificar lo siguiente:
   - aparece el cartel de éxito;
   - los números salen vendidos en otra pestaña;
   - la fila está en `ventas`.

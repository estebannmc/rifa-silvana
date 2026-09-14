# Rifa a beneficio · landing

Landing mobile-first con estética liquid glass para la rifa de Silvana. Tiene grilla de números del 00 al 200, pago por **transferencia** y la opción de **reservar un número por 24 h** para bloquearlo sin pagar todavía.

- **Frontend:** `index.html`, `styles.css`, `app.js` (HTML/CSS/JS sin build).
- **Backend:** funciones serverless de Vercel en `api/` (`api/_lib/` tiene código compartido y no se expone).
- **Base de datos:** Supabase, proyecto `rifa-silvana` (`https://mbhuxcmpraxqhwqbxoaj.supabase.co`). El esquema está en `supabase/schema.sql` y ya está aplicado.
- **Web publicada:** <https://rifa-silvana.vercel.app>

## Cómo funciona

1. La persona elige números y completa nombre y celular.
2. **Transferencia:** `/api/checkout` reserva los números **12 h**. La persona ve el CBU/alias y le manda el comprobante a Silvana con el botón de WhatsApp de la web.
3. **Reservar 24 horas:** `/api/checkout` reserva los números **24 h** sin pago inmediato, para que la persona los transfiera dentro de ese plazo.
4. En ambos casos Silvana confirma el pago a mano desde el panel `/admin` (o desde Supabase) cuando ve la plata en la cuenta.

Las reservas vencidas se liberan solas. Silvana ve cada venta en la vista `ventas` de Supabase y en el panel `/admin`.

## Puesta en marcha (una sola vez)

### 1. Supabase: clave secreta del servidor
La web guarda los números vendidos en Supabase. Para escribir ahí, las funciones de Vercel necesitan una **clave secreta** del proyecto. Es como una llave maestra de la base de datos: solo se pega en Vercel, nunca en la web, en un chat ni en un mensaje.

1. Abrir <https://supabase.com/dashboard/project/mbhuxcmpraxqhwqbxoaj/settings/api-keys> (proyecto **rifa-silvana** → ⚙️ *Project Settings* → *API Keys*).
2. Copiar una de estas dos claves, según lo que muestre la página:
   - pestaña **"Publishable and secret keys"** → sección **Secret keys** → botón de copiar de la clave que empieza con `sb_secret_…` (si no hay ninguna, crearla con **+ New secret key**);
   - o, si aparece la pestaña **"Legacy API keys"**, la clave **`service_role`** (tocar *Reveal* y copiar; empieza con `eyJ…`).

   Cualquiera de las dos funciona. **No** usar la `anon` ni la `sb_publishable_…`, porque esas son públicas y no tienen permiso.
3. Pegarla en Vercel como `SUPABASE_SERVICE_ROLE_KEY` (ver el paso 3).

### 2. Variables de entorno en Vercel
Entrar a <https://vercel.com/estebannmcs-projects/rifa-silvana/settings/environment-variables>, cargar cada una con *Environment* = **Production** y tocar **Save**:

| Variable | Valor | Estado |
|---|---|---|
| `SUPABASE_URL` | `https://mbhuxcmpraxqhwqbxoaj.supabase.co` | ✅ ya cargada |
| `SITE_URL` | `https://rifa-silvana.vercel.app` | ✅ ya cargada |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave secreta del paso 1 | falta |
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

- **Pedidos por confirmar:** transferencias y reservas de 24 h pendientes. Cuando llega la captura y la plata está en la cuenta, tocar **Confirmar pago** y los números pasan a vendidos. **Liberar** los deja disponibles otra vez.
- **Bloquear números vendidos por fuera:** tocar los números en la grilla, completar nombre, celular e importe (todos opcionales) y tocar **Bloquear números**.
- **Ventas confirmadas:** lista de todas las ventas. **Anular venta** libera sus números, por ejemplo si hubo un error o una devolución.
- Arriba se ven los totales: vendidos, reservados, libres y recaudado.

## Tareas avanzadas (desde el Table Editor de Supabase)

Todo lo de esta sección también se puede hacer desde el panel.


- **Ver ventas:** la vista **`ventas`** muestra fecha, nombre, teléfono, números, importe, medio, estado y nota.
- **Confirmar un pedido:** cuando llega el comprobante por WhatsApp, ir a la tabla **`orders`**, buscar el pedido (`method = transferencia` o `reserva`, `status = pending`) y cambiar `status` a **`paid`**. Los números pasan a vendidos automáticamente.
- **Cancelar un pedido:** cambiar `status` a **`cancelled`**. Los números reservados se liberan.
- **Registrar una venta en efectivo:** insertar una fila en **`orders`** con `nombre`, `telefono`, `numbers` (por ejemplo `{12,45}`), `amount`, `method = manual` y `status = paid`.
- **Revisar notas:** si la columna `nota` de una venta empieza con "CONFLICTO" (choque de números), hay que revisarla y contactar a la persona. Es muy raro que pase.

## Probar en local

```bash
npx -y http-server . -p 5173 -c-1
```

Sin backend, la página entra en **modo demo**: el 08 y el 27 aparecen vendidos y las reservas no se guardan. También se puede forzar el modo demo con `?demo=1`.

## Migrar un proyecto de Supabase ya publicado

Si el proyecto ya tenía el esquema viejo (con `mercadopago` como medio de pago), correr una sola vez `supabase/migration_remove_mercadopago.sql` en el SQL Editor de Supabase antes de publicar este cambio.

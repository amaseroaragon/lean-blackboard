# Fase 0: hallazgos del spike

Fecha: 2026-11-04. Entorno: VS Code 1.144.0, `leanprover.lean4` **v0.0.240** (CLAUDE.md se
verificó contra v0.0.241), Lean `v4.34.1`, Node 22.

Hay dos fuentes de datos:

- **Verificado (lectura de código)**: fuente de Lean en el toolchain instalado y bundle de la
  extensión instalada (`~/.vscode/extensions/leanprover.lean4-0.0.240/dist/extension.js`).
- **Verificado (sonda LSP)**: un script mínimo que habla LSP con `lake serve` sobre
  `examples/lean-sample`, **fuera** de la extensión. Sirve para ver formas y latencias reales del
  servidor; no sustituye a la prueba con F5.
- **Pendiente (F5)**: lo que solo se puede observar en el Extension Development Host.

## API de la extensión oficial (v0.0.240)

Todo lo descrito en CLAUDE.md existe en la v0.0.240 con la misma forma. Detalles adicionales:

- `getClientFolder()` devuelve un `ExtUri`: `{ scheme: 'file', fsPath }` o
  `{ scheme: 'untitled', path }` (el cliente "ad hoc" para ficheros fuera de un proyecto Lake).
  Seleccionamos cliente comparando `fsPath` (prefijo más largo) y caemos a `getActiveClient()`.
- `restartedWorker` emite la **URI del documento como string**.
- `didClose` emite `DidCloseTextDocumentParams`: `{ textDocument: { uri } }`.
- `sendRequest` rechaza con el **string** `'No connection to Lean'` (no un `Error`) si el cliente
  no está corriendo. Los errores del servidor llegan como `ResponseError` con `.code`.
- `getActiveClient()` usa internamente `findClient(lastActiveLeanEditor.documentExtUri)`.

## Protocolo RPC

- **`sessionId` es un string**, no un número: Lean codifica `UInt64` como cadena decimal
  (`bignumToJson`), p. ej. `"7379897472780602556"`. Mandarlo como número da `-32602`
  (`RpcCallParams.sessionId: String expected`). Ventaja: no hay pérdida de precisión en JS.
- Códigos de error (`Lean/Data/JsonRpc.lean`):
  - `-32900` `RpcNeedsReconnect`, mensaje `"Outdated RPC session"`. Comprobado en la sonda con
    un `sessionId` inventado. Es el que dispara nuestra reconexión + reintento.
  - `-32901` `WorkerExited`, `-32902` `WorkerCrashed`: la InfoView oficial también descarta la
    sesión con estos. Nosotros no reintentamos; la siguiente petición reconecta.
  - `-32800` `RequestCancelled`, `-32801` `ContentModified`: se tratan como cancelación silenciosa.
- Caducidad: `keepAliveTimeMs = 30000` (`FileWorker/Utils.lean`). Keep-alive cada 10 s.
- **Sorpresa: hay que liberar referencias RPC.** Cada `getInteractiveGoals` crea objetos en el
  servidor (`SubexprInfo.info` y `InteractiveGoal.ctx`) que viven hasta que el cliente manda
  `$/lean/rpc/release` `{ uri, sessionId, refs }` o la sesión caduca. Como nuestra sesión vive
  mientras el fichero esté abierto, sin liberar habría una fuga por cada movimiento del cursor.
  El spike las libera inmediatamente tras cada llamada (no las usamos todavía).
- **Formato de las referencias depende del wire format.** La extensión oficial negocia
  `rpcWireFormat: "v1"` en `initialize`, así que en VS Code las refs son `{"__rpcref": "N"}`. La
  sonda (sin esa capacidad, formato `v0`) las ve como `{"p": "N"}`. El código detecta ambas, igual
  que la InfoView.

## Respuestas reales (sonda, cursor en `exact hpq hp` de `imp_trans`)

`$/lean/plainGoal`:

```json
{"goals":["p q r : Prop\nhpq : p → q\nhqr : q → r\nhp : p\n⊢ q"],
 "rendered":"```lean\np q r : Prop\nhpq : p → q\nhqr : q → r\nhp : p\n⊢ q\n```"}
```

En una línea sin táctica devuelve `null`.

`Lean.Widget.getInteractiveGoals` (abreviado, formato v0):

```json
{"goals":[{
  "ctx":{"p":"9"}, "goalPrefix":"⊢ ", "mvarId":"_uniq.33.16", "isRemoved":true,
  "hyps":[
    {"names":["p","q","r"], "fvarIds":["_uniq.33.2","_uniq.33.3","_uniq.33.4"], "isType":true,
     "type":{"tag":[{"info":{"p":"0"},"subexprPos":"/"},{"text":"Prop"}]}},
    {"names":["hpq"], "fvarIds":["_uniq.33.6"],
     "type":{"tag":[{"info":{"p":"1"},"subexprPos":"/"},
       {"append":[{"tag":[{"info":{"p":"2"},"subexprPos":"/0"},{"text":"p"}]},
                  {"text":" → "},
                  {"tag":[{"info":{"p":"3"},"subexprPos":"/1"},{"text":"q"}]}]}]}}
  ],
  "type":{"tag":[{"info":{"p":"8"},"subexprPos":"/"},{"text":"q"}]}
}]}
```

Observaciones:

- Las hipótesis vienen **agrupadas** (`names` es un array: `p q r : Prop`).
- Los campos opcionales (`isType`, `isInserted`, `isRemoved`, `val`...) solo aparecen cuando
  son verdaderos o existen.
- `subexprPos` es una ruta en el árbol de `Expr` (`/`, `/0`, `/1`...). Útil más adelante.
- El texto de `→` es un nodo `{"text":" → "}` entre dos `tag`: la estructura del `TaggedText`
  refleja la aplicación pero **no dice qué notación es**. Para la Fase 2 habrá que reconocer
  notaciones a partir del texto de los separadores (o usar el modo preciso).

## Latencias (sonda, fichero ya elaborado)

| Petición | Latencia |
|---|---|
| `plainGoal` | 2–9 ms |
| `rpc/connect` | ~3 ms |
| `getInteractiveGoals` (primera / siguientes) | ~12 ms / ~3 ms |

Con debounce de 150 ms la latencia del servidor es irrelevante en ficheros pequeños.

## Pendiente de observar con F5

Completar tras probar en el Extension Development Host:

- [ ] Formas reales en VS Code (deberían ser las de arriba con `__rpcref` en vez de `p`).
- [ ] Latencias reales a través del cliente oficial.
- [ ] Número de procesos `lean --server` / `lake serve` con y sin la extensión.
- [ ] Sesión viva tras > 60 s sin mover el cursor.
- [ ] Comportamiento tras `Lean 4: Restart Server` y `Lean 4: Restart File`.
- [ ] Ventana sin ficheros Lean: sin errores.

## Correcciones propuestas a CLAUDE.md

1. El código de "needs reconnect" es **`-32900`** (`"Outdated RPC session"`); añadir que
   `-32901`/`-32902` también invalidan la sesión.
2. Indicar que `sessionId` es un **string** (UInt64 en decimal) y debe enviarse tal cual.
3. Añadir que hay que **liberar las referencias RPC** con `$/lean/rpc/release` y que su formato
   es `{"__rpcref": "N"}` (wire format v1 del cliente oficial).
4. Detallar las cargas de los eventos (`restartedWorker` → URI string; `didClose` →
   `{ textDocument: { uri } }`) y la forma de `ExtUri` devuelta por `getClientFolder()`.
5. `sendRequest` rechaza con un string, no con un `Error`.
6. Anotar que la API es idéntica en v0.0.240 (la instalada) y v0.0.241.

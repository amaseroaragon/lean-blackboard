# lean-blackboard

Extensión de VS Code que muestra las hipótesis y objetivos de Lean 4 en la posición del cursor con
notación matemática renderizada (KaTeX), en un panel propio, junto a la extensión oficial de Lean 4
(`leanprover.lean4`) y **sin modificarla**.

Proyecto personal. De momento **no** se publica en el Marketplace ni en Open VSX.

## Forma de trabajar (importante)

- Desarrollo **incremental por fases**. Trabaja solo en la fase actual (ver "Estado actual").
- Al terminar una fase: resume qué se hizo, cómo probarlo y qué criterios de aceptación se cumplen.
  **Detente y espera validación** antes de empezar la siguiente.
- No crees carpetas, paquetes ni dependencias que la fase actual no necesite. La estructura de
  "Arquitectura objetivo" es el destino, no algo que haya que crear de golpe.
- Antes de añadir una dependencia nueva, justifícala en una línea.
- Commits pequeños y descriptivos (en inglés, estilo Conventional Commits: `feat:`, `fix:`, `chore:`...).
- Si algo de este documento resulta ser falso al probarlo, avisa y propón corregir este archivo.

## Convenciones

- TypeScript en modo `strict`. Bundle con esbuild.
- Código, identificadores y comentarios en inglés. Documentación del repo en español.
- Tests de lógica pura con vitest. Los tests de integración con VS Code llegarán más adelante.
- Gestor de paquetes: npm (workspaces cuando haya más de un paquete).

## Arquitectura objetivo

Modelo **híbrido**:
- **Modo rápido** (siempre disponible, sin configuración): la conversión a LaTeX se hace en
  TypeScript a partir de los objetivos interactivos que devuelve el servidor.
- **Modo preciso** (fase posterior): un paquete Lean compañero expone un método
  `@[server_rpc_method]` que recorre el `Expr` real y devuelve LaTeX. La extensión lo usa
  automáticamente si está disponible.

```
lean-blackboard/
├─ packages/
│  ├─ extension/        # host de VS Code
│  │   ├─ leanBridge.ts      # ÚNICO punto de contacto con la extensión oficial
│  │   ├─ goalTracker.ts     # cursor + debounce + cancelación + caché
│  │   └─ panel.ts           # WebviewViewProvider
│  ├─ core/             # TS puro, sin dependencia de vscode → testeable
│  │   ├─ parser/            # TaggedText / texto Lean → AST
│  │   ├─ rules/             # registro extensible: constante/notación → plantilla LaTeX
│  │   └─ render/            # AST → LaTeX
│  └─ webview/          # UI: KaTeX (empaquetado, sin CDN), toggle matemático/Lean
├─ lean/                # (fase posterior) paquete Lake compañero
├─ examples/lean-sample/  # proyecto Lean mínimo para probar a mano
└─ test/golden/         # pares objetivo-Lean → LaTeX esperado
```

Principios:
- Todo lo que dependa de la API interna de la extensión oficial vive en `leanBridge.ts`.
- **Nunca** lanzar un segundo `lean --server` / `lake serve`. Se reutiliza el cliente oficial.
- Si una expresión no se puede convertir, se muestra en sintaxis Lean (`\texttt{}`), nunca vacío.

## API de la extensión oficial (verificado leyendo el código, 2026-11-04)

Verificado sobre `leanprover/vscode-lean4` v0.0.241 y `leanprover/lean4` master, y de nuevo sobre
v0.0.240 (la instalada) y Lean v4.34.1: la API que usamos es idéntica. Detalles y respuestas reales
en `docs/spike-findings.md`.

**Acceso**
- `vscode.extensions.getExtension('leanprover.lean4')`. Si no está activa, `await ext.activate()`.
  Sus `exports` son de clase `Exports` (`vscode-lean4/src/exports.ts`):
  - `alwaysEnabledFeatures`: objeto síncrono.
  - `lean4EnabledFeatures: Promise<{ clientProvider, infoProvider, projectOperationProvider }>`.
- **La promesa puede tardar o no resolverse nunca** (instalación fallida, proyecto inválido). No
  bloquear la activación esperándola. Mostrar un estado "esperando a Lean" en el panel.
- No hay tipos publicados para estas exports: definir en `leanBridge.ts` una interfaz local mínima
  con solo los miembros que usamos.
- Declarar `"extensionDependencies": ["leanprover.lean4"]` en `package.json`.

**`clientProvider` (`LeanClientProvider`)**
- `getActiveClient()`: cliente del último editor Lean activo.
- `getClients()`: todos los clientes.
- Eventos: `clientAdded`, `clientRemoved`, `clientStopped`.
- `findClient(uri)` exige un `ExtUri` interno que no podemos construir. **No usarlo**: usar
  `getActiveClient()` o `getClients()` comparando `getClientFolder()` nosotros.
- `getClientFolder()` devuelve un `ExtUri`: `{ scheme: 'file', fsPath }` o
  `{ scheme: 'untitled', path }` (cliente "ad hoc" para ficheros fuera de un proyecto Lake).

**`LeanClient`**
- `sendRequest(method, params, token?)` y `sendNotification(method, params)` sobre el proceso ya
  existente. `sendRequest` rechaza con el **string** `'No connection to Lean'` (no un `Error`) si el
  cliente no está corriendo. Los errores del servidor llegan como `ResponseError` con `.code`.
- `isRunning()`.
- Eventos: `restarted`, `restartedWorker`, `stopped`, `didChange`, `didClose`. Tras un reinicio
  del servidor o del worker, las sesiones RPC dejan de valer y hay que reconectar.
  - `restartedWorker` emite la URI del documento como string.
  - `didClose` emite `{ textDocument: { uri } }`.
- URIs: el cliente usa el conversor por defecto, así que basta con `document.uri.toString()`.

**Peticiones al servidor** (documentadas en `lean4/src/Lean/Server/ProtocolOverview.lean`)
- `$/lean/plainGoal`
  - Parámetros: `{ textDocument: { uri }, position }`.
  - Respuesta: `{ rendered: string, goals: string[] } | null`.
  - Lean lo marca como "no usado en VS Code". Lo usamos solo como comprobación y respaldo.
- **Vía principal: RPC**
  1. `$/lean/rpc/connect` con `{ uri }`. Devuelve `{ sessionId }`. **`sessionId` es un string**
     (UInt64 en decimal) y se envía tal cual; como número el servidor responde `-32602`.
  2. `$/lean/rpc/call` con `{ sessionId, method, params, textDocument: { uri }, position }`.
  3. `method = 'Lean.Widget.getInteractiveGoals'`, `params = { textDocument: { uri }, position }`.
     Respuesta: `{ goals: InteractiveGoal[] } | null`.
  - `$/lean/rpc/keepAlive` con `{ uri, sessionId }` **cada 10 s**: el servidor caduca la sesión a
    los 30 s. Parar el intervalo al cerrar el documento o al hacer dispose.
  - El servidor admite varias sesiones por fichero, así que la nuestra convive con la de la InfoView.
  - Si una llamada falla con **`-32900`** (`RpcNeedsReconnect`, mensaje `"Outdated RPC session"`),
    reconectar y reintentar una vez. `-32901` (`WorkerExited`) y `-32902` (`WorkerCrashed`) también
    invalidan la sesión. `-32800`/`-32801` (cancelada / contenido modificado) se ignoran.
  - **Liberar las referencias RPC** de cada respuesta con `$/lean/rpc/release`
    `{ uri, sessionId, refs }`; si no, el servidor las guarda hasta que caduca la sesión. El cliente
    oficial negocia el wire format `v1`, así que las refs son `{"__rpcref": "N"}` (en `v0`,
    `{"p": "N"}`).
- Tipos (`InteractiveGoal`, `InteractiveHypothesisBundle`, `CodeWithInfos`, `TaggedText`): ver
  `lean4-infoview-api/src/rpcApi.ts`. Se puede usar `@leanprover/infoview-api` como dependencia
  solo de tipos, comprobando antes la versión publicada en npm.
  - Forma de `TaggedText`: `{ text } | { append: TaggedText[] } | { tag: [SubexprInfo, TaggedText] }`.

## Fases

### Fase 0: Spike de viabilidad (cerrada 2026-11-04)
Objetivo: demostrar que obtenemos los objetivos desde el cliente oficial, sin otro proceso.

Alcance:
- Scaffolding mínimo: una sola extensión en `packages/extension` (aún sin `core` ni `webview`).
- `examples/lean-sample`: proyecto Lean mínimo sin Mathlib, con `lean-toolchain` y 2–3 teoremas
  con tácticas.
- `leanBridge.ts`: acceso a las exports, selección de cliente, `plainGoal` y sesión RPC con
  keep-alive y reconexión.
- Al mover el cursor (con debounce de unos 150 ms y cancelación de la petición anterior), escribir
  en un `OutputChannel` "Lean Blackboard":
  - el resultado de `plainGoal`;
  - el JSON de `getInteractiveGoals`, truncado si es muy largo;
  - la latencia de cada petición.
- Comando `Lean Blackboard: Dump Goals` que hace lo mismo bajo demanda.

Criterios de aceptación (los comprueba el usuario a mano con F5 en el Extension Development Host):
1. Con el cursor en una táctica aparecen las hipótesis y el objetivo en el canal de salida.
2. Solo hay un proceso de servidor Lean por proyecto: comparar los procesos con y sin la extensión.
3. La sesión RPC sigue viva tras más de 60 s sin mover el cursor.
4. `Lean 4: Restart Server` no rompe nada: la extensión reconecta sola.
5. Abrir VS Code sin ningún fichero Lean no produce errores. La extensión espera.
6. La InfoView oficial sigue funcionando igual.

Entregable adicional: una nota en `docs/spike-findings.md` con lo observado (formas reales de las
respuestas, latencias, sorpresas) y las correcciones que haya que hacer a este documento.

### Fase 1: Panel con texto plano (cerrada 2026-11-04)
`WebviewView` en la barra lateral que sigue al cursor y muestra hipótesis y objetivos como texto
Lean (aplanando el `TaggedText`). Sin LaTeX todavía. Se aplican el estado "esperando a Lean" y la
seguridad del webview (CSP estricta).

### Fase 2: Conversión y KaTeX (cerrada 2026-11-04)
- `packages/core`: `TaggedText` → AST → LaTeX, con unas 30 reglas iniciales (`∀ ∃ → ↔ ∧ ∨ ¬ ∈ ⊆
  ∑ ∏`, fracciones, `√`, `|x|`, potencias, subíndices, `ℕ ℤ ℚ ℝ ℂ`).
- Tests golden en `test/golden`.
- KaTeX empaquetado en el webview, con respaldo `\texttt{}` cuando falle la conversión.

### Fase 3: Usabilidad y extensibilidad (cerrada 2026-11-04)
Toggle global y por hipótesis entre matemáticas y Lean, botón "copiar LaTeX", reglas de usuario en
la configuración (`leanBlackboard.customRules`) y macros `\newcommand`.

### Fase 4: Modo preciso (paquete Lean compañero) ← ESTADO ACTUAL
Paquete Lake en `lean/` con un `@[server_rpc_method]` que devuelve LaTeX a partir del `Expr`. La
extensión detecta si existe y cambia de modo sola. Evaluar reutilizar LeanTeX (Apache 2.0).
Debe resolver lo que el modo rápido no puede saber sin tipos:
- `→` como implicación (`\Rightarrow`) cuando es entre proposiciones y como `\to` en tipos de
  función (decidido 2026-11-04: nada de heurísticas en el modo rápido).
- `/` en `ℕ`/`ℤ` (división entera) frente a fracción real.

Decisiones (2026-11-04): printer propio solo con Lean core (LeanTeX descartado: anclado a
v4.18.0-rc1, sin mantenimiento y con ProofWidgets); las reglas `functions`/`symbols` del cliente se
envían en cada petición y se aplican también aquí. Detalles de uso en `docs/modo-preciso.md`.

## Comandos

Desde la raíz (npm workspaces: `packages/core`, `packages/webview`, `packages/extension`):

- `npm install`: dependencias de todos los paquetes.
- `npm run build`: bundles con esbuild. `packages/webview` escribe en
  `packages/extension/dist/webview/` (script, CSS con KaTeX y fuentes) y `packages/extension` en
  `packages/extension/dist/extension.js`.
- `npm run watch`: ambos bundles en modo watch.
- `npm run typecheck`: `tsc --noEmit` (strict) en cada paquete.
- `npm test`: vitest. Incluye los golden de `test/golden/*.golden` (formato `lean:` / `tex:`), que
  además comprueban que KaTeX acepta cada salida.
- Lint: todavía no hay.

Paquete Lean compañero (desde `lean/`):

- `lake build`: compila `LeanBlackboard`.
- `lake build LeanBlackboardTest`: tests golden del printer (`#guard_msgs` sobre `#latex`).

`examples/lean-sample` depende de `lean/` por ruta: `LeanSample.lean` lo importa (modo preciso) y
`FastSample.lean` no (modo rápido).

`packages/core` no se compila por separado: se consume como TypeScript fuente (`main` apunta a
`src/index.ts`) y esbuild lo empaqueta.

Probar a mano: F5 en VS Code con la configuración "Run Extension (lean-sample)" (abre
`examples/lean-sample`) o "Run Extension (empty window)" (sin ficheros Lean).
`cd examples/lean-sample && lake build` compila el proyecto de ejemplo.

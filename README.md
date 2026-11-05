# Lean Blackboard

Extensión de VS Code que muestra las hipótesis y objetivos de Lean 4 en la posición del cursor
con **notación matemática renderizada** (KaTeX), en un panel propio. Funciona junto a la extensión
oficial de Lean 4 (`leanprover.lean4`), sin modificarla y sin lanzar otro servidor de Lean:
reutiliza el que ya tiene abierto la extensión oficial.

Por ejemplo, el objetivo

```lean
∀ ε > 0, ∃ δ > 0, ∀ (x : ℝ), |x - a| < δ → |f x - f a| < ε
```

se dibuja como

$$\forall \varepsilon > 0,\ \exists \delta > 0,\ \forall x \in \mathbb{R},\ \left|x - a\right| < \delta \to \left|f\left(x\right) - f\left(a\right)\right| < \varepsilon$$

> Proyecto personal. No está publicado en el Marketplace de VS Code ni en Open VSX: se instala
> desde el código fuente (ver abajo).

## Qué hace

- Panel **Goals** en la barra de actividad (icono de pizarra) que sigue al cursor.
- Hipótesis y objetivos en notación matemática, con conmutador global y por fila entre
  matemáticas y sintaxis Lean.
- Tipo esperado en modo término, sección *Before* (el estado al principio de la línea) con los
  cambios resaltados, y mensajes de error/aviso de la línea con notación matemática.
- Copiar el LaTeX de una fila o de todo el estado, y fijar estados para compararlos.
- Reglas propias (`leanBlackboard.customRules`) y macros `\newcommand` (`leanBlackboard.macros`).
- Fórmulas largas partidas en líneas según el ancho del panel.

Dos modos, que la extensión elige sola:

| Modo | Requisitos | Cómo funciona |
|---|---|---|
| **Rápido** | Ninguno | Convierte a LaTeX en TypeScript el texto de los objetivos que devuelve Lean. |
| **Preciso** | El paquete Lean `LeanBlackboard` (en `lean/`) como dependencia del proyecto | El servidor de Lean recorre el `Expr` real y devuelve LaTeX. Distingue `⇒` de `→`, la división entera de la fracción, etc., y permite ver el tipo de una subexpresión al pasar el ratón por encima y abrir su definición con Ctrl/Cmd+clic. |

Si una expresión no se puede convertir, se muestra en sintaxis Lean, nunca vacía.

## Instalación

Requisitos: VS Code ≥ 1.90, la extensión oficial
[Lean 4](https://marketplace.visualstudio.com/items?itemName=leanprover.lean4) y, solo para
compilar, Node.js (probado con la versión 22).

```sh
git clone https://github.com/amaseroaragon/lean-blackboard.git
cd lean-blackboard
npm install
npm run package                                   # genera lean-blackboard.vsix
code --install-extension lean-blackboard.vsix
```

Recarga VS Code, abre un fichero `.lean` y pulsa el icono de pizarra de la barra de actividad.
Con eso ya funciona el modo rápido.

### Modo preciso (opcional)

Añade el paquete compañero al `lakefile.toml` de tu proyecto Lean:

```toml
[[require]]
name = "LeanBlackboard"
git = "https://github.com/amaseroaragon/lean-blackboard"
rev = "main"
subDir = "lean"
```

Después ejecuta `lake update LeanBlackboard && lake build`, añade `import LeanBlackboard` en los
ficheros donde lo quieras y reinicia el fichero (`Lean 4: Restart File`). El panel indica `precise`
o `fast` junto a la posición. Detalles, alternativas y limitaciones en
[`docs/modo-preciso.md`](docs/modo-preciso.md).

## Documentación

- [`docs/configuracion.md`](docs/configuracion.md): funciones del panel, reglas propias y macros.
- [`docs/modo-preciso.md`](docs/modo-preciso.md): el paquete Lean compañero.
- [`docs/spike-findings.md`](docs/spike-findings.md): notas técnicas sobre la API de la extensión
  oficial y el protocolo del servidor de Lean.

## Desarrollo

Monorepo con npm workspaces: `packages/core` (conversión a LaTeX, TypeScript puro),
`packages/webview` (UI con KaTeX) y `packages/extension` (host de VS Code). El paquete Lean
está en `lean/` y los proyectos de ejemplo en `examples/`.

```sh
npm run build              # bundles con esbuild
npm run typecheck          # tsc --noEmit (strict)
npm run lint               # ESLint
npm test                   # vitest: tests unitarios y golden (test/golden)
npm run test:integration   # VS Code real + extensión de Lean (requiere `lake build` en examples/lean-sample)
```

Para probar a mano: F5 en VS Code con la configuración *Run Extension (lean-sample)*.

En `lean/`: `lake build` compila el paquete y `lake build LeanBlackboardTest` ejecuta sus tests
golden.

## Licencia

[MIT](LICENSE). El bundle incluye [KaTeX](https://katex.org/) (MIT).

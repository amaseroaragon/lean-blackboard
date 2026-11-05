# Modo preciso

[English](../en/precise-mode.md) · **Español**

El modo rápido convierte el **texto** que imprime Lean, así que no conoce los tipos. El modo
preciso usa el paquete Lean compañero `LeanBlackboard` (en `lean/`), que recorre el `Expr` real
en el servidor de Lean y devuelve LaTeX. Lo que cambia:

| Lean | Modo rápido | Modo preciso |
|---|---|---|
| `p → q` (proposiciones) | p → q | p ⇒ q |
| `ℕ → ℕ` (tipos) | ℕ → ℕ | ℕ → ℕ |
| `n / m` en `ℕ` | n/m (fracción) | ⌊n/m⌋ |
| `a / b` en `ℤ` | a/b (fracción) | a div b |
| `∀ x, x ∈ l → p x` | ∀ x ∈ ℕ, x ∈ l → … | ∀ x ∈ l, … |
| `∃ m, n < m` | ∃ m, n < m | ∃ m ∈ ℕ, n < m |
| `if c then a else b` | `\texttt{}` | `cases` |
| `↑n` | n | n |

Además, solo en modo preciso: al pasar el ratón por una subexpresión se ve su tipo, y Ctrl/Cmd+clic
abre su definición (Lean core, Mathlib o tu propio proyecto).

Con Mathlib, también: `deriv (fun x => …) x` como d/dx, integrales `∫_a^b … dx`, límites
`Tendsto f atTop (nhds l)` como lim, `∃!`, conjuntos por comprensión `{x ∈ ℝ | …}` y la inclusión
de conjuntos (Mathlib elabora `s ⊆ t` como `s ≤ t`; el modo preciso lo devuelve a ⊆ por el tipo).

Las reglas propias `functions` y `symbols` (`leanBlackboard.customRules`) se aplican en los dos
modos; las de operadores (`infix`, `prefix`…) solo en el rápido. Las macros se aplican siempre.

## Cómo activarlo en un proyecto

1. Añade la dependencia en el `lakefile.toml` del proyecto, desde GitHub:

   ```toml
   [[require]]
   name = "LeanBlackboard"
   git = "https://github.com/amaseroaragon/lean-blackboard"
   rev = "main"
   subDir = "lean"
   ```

   Con `lakefile.lean`:
   `require LeanBlackboard from git "https://github.com/amaseroaragon/lean-blackboard" @ "main" / "lean"`.

   O desde una copia local del repositorio:

   ```toml
   [[require]]
   name = "LeanBlackboard"
   path = "/ruta/a/lean-blackboard/lean"
   ```

   Con `lakefile.lean`: `require LeanBlackboard from "/ruta/a/lean-blackboard/lean"`.

2. `lake update LeanBlackboard && lake build`.
3. Añade `import LeanBlackboard` en los ficheros donde quieras el modo preciso. El método RPC solo
   existe en ficheros que lo importan (directa o indirectamente).
4. Reinicia el fichero en VS Code (`Lean 4: Restart File`) si ya estaba abierto.

El paquete está probado con `leanprover/lean4:v4.34.1` (y Mathlib `v4.34.1`). Lake lo compila con
el toolchain de tu proyecto, así que con otras versiones de Lean puede no compilar; en ese caso
queda el modo rápido.

El panel muestra una etiqueta `precise` o `fast` junto a la posición. Si el paquete no está
importado, la extensión vuelve al modo rápido sola y lo vuelve a intentar al guardar el fichero o
pasados 30 s.

Si el `lake-manifest.json` del proyecto no incluye el paquete `LeanBlackboard` (o no existe), la
extensión ni siquiera llama a sus métodos RPC. Para un método de usuario desconocido, Lean recorre
todos los snapshots del fichero antes de responder "method not found". Mientras el fichero se
elabora, ese recorrido escribe en el log del servidor
`` `Task.get` called from a `(sync := true)` task `` (es un problema de Lean core:
`AsyncList.waitFind?` evalúa la búsqueda en continuaciones `sync`). El manifest se vuelve a leer
cuando cambia, así que basta con `lake update`.

Para forzar el modo rápido: `"leanBlackboard.mode": "fast"`.

## Probar el printer sin VS Code

Con `import LeanBlackboard`, el comando `#latex t` muestra el LaTeX que generaría el modo preciso:

```lean
#latex ∀ (p q : Prop), p → q → p
-- \forall p, q : \mathrm{Prop},\ p \Rightarrow q \Rightarrow p
```

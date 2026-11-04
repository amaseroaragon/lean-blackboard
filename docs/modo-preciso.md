# Modo preciso

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

Las reglas propias `functions` y `symbols` (`leanBlackboard.customRules`) se aplican en los dos
modos; las de operadores (`infix`, `prefix`…) solo en el rápido. Las macros se aplican siempre.

## Cómo activarlo en un proyecto

1. Añade la dependencia en el `lakefile.toml` del proyecto (ruta local, porque el proyecto no está
   publicado):

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

El toolchain del paquete debe coincidir con el del proyecto. Ahora mismo es
`leanprover/lean4:v4.34.1`.

El panel muestra una etiqueta `precise` o `fast` junto a la posición. Si el paquete no está
importado, la extensión vuelve al modo rápido sola y lo vuelve a intentar al guardar el fichero o
pasados 30 s.

Para forzar el modo rápido: `"leanBlackboard.mode": "fast"`.

## Probar el printer sin VS Code

Con `import LeanBlackboard`, el comando `#latex t` muestra el LaTeX que generaría el modo preciso:

```lean
#latex ∀ (p q : Prop), p → q → p
-- \forall p, q : \mathrm{Prop},\ p \Rightarrow q \Rightarrow p
```

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

Las constantes se nombran como las imprime Lean donde está el cursor: `fact` dentro de
`namespace Foo` (o tras `open Foo`), no `Foo.fact`.

Con Mathlib, también: `deriv (fun x => …) x` como d/dx, integrales `∫_a^b … dx`, límites
`Tendsto f atTop (nhds l)` como lim, `∃!`, conjuntos por comprensión `{x ∈ ℝ | …}` y la inclusión
de conjuntos (Mathlib elabora `s ⊆ t` como `s ≤ t`; el modo preciso lo devuelve a ⊆ por el tipo).

Las reglas propias `functions` y `symbols` (`leanBlackboard.customRules`) se aplican en los dos
modos; las de operadores (`infix`, `prefix`…) solo en el rápido. Las macros se aplican siempre.

## Definiciones

Con el cursor en cualquier punto de un `def` o un `abbrev` (o de una `structure` o un `inductive`), el panel muestra una sección
**Definition**: la firma y las ecuaciones que la definen, como en la pizarra. El ajuste de patrones
da una ecuación por caso, y las definiciones recursivas se leen como su recursión (las ecuaciones
que genera el propio Lean, `f.eq_1`, …), no como el término compilado:

```lean
def factorial : ℕ → ℕ
  | 0 => 1
  | n + 1 => (n + 1) * factorial n
```

muestra *factorial : ℕ → ℕ*, *factorial(0) = 1* y *factorial(n + 1) = (n + 1) · factorial(n)*.
Los patrones solapados (`| _ => …`) añaden la condición que Lean demuestra para ellos
(*… if x ≠ 0*). Cada fila tiene el cambio Math/Lean y el botón Copy; el botón Copy de la sección y
`Copy Goal State` la exportan como LaTeX.

Una `structure` muestra sus campos (*lo : ℤ*, *hi : ℤ*, *valid : lo ≤ hi*) y un tipo `inductive`
sus constructores (*leaf : Tree*, *node : Tree → ℕ → Tree → Tree*). No se muestran instancias, las
funciones que genera Lean (proyecciones, recursores…) ni teoremas.

El modo rápido también muestra la sección, con menos precisión: el tipo lo da Lean, pero las
ecuaciones, los campos y los constructores se leen del texto fuente, así que entiende las formas
habituales (`:= cuerpo`, casos `| patrón => …`, `match` sobre parámetros, campos `nombre : tipo`) y
no da condiciones laterales. Los cuerpos con tácticas (`:= by …`) no tienen ecuaciones.

## Pasos dentro de `simp`

`simp only [a, b]` es una sola táctica: Lean no guarda ningún estado entre `a` y `b`. Con el cursor
dentro de los corchetes, el modo preciso lo calcula ejecutando la táctica otra vez, desde el estado
anterior a ella, solo con los lemas que quedan antes del cursor:

```lean
theorem simp_steps (a b : ℕ) (h : b = a) : (a + 0) * 1 = b := by
  simp only [Nat.add_zero, Nat.mul_one, h]
```

| Cursor | *Before* | Estado actual |
|---|---|---|
| en `Nat.add_zero` (o justo tras su coma) | (a + 0) · 1 = b | a · 1 = b |
| en `Nat.mul_one` | a · 1 = b | a = b |
| en `h` | a = b | sin objetivos |
| fuera de los corchetes | principio de la línea | tras el `simp` completo |

Un lema cuenta como aplicado cuando el cursor ha pasado su primer carácter; justo después de `[`
el panel muestra el estado anterior a la táctica. Una nota encima de los objetivos dice cuántos
lemas hay aplicados (*Lemma list: first 1 of 3 applied*).

Funciona con `simp`, `simp?`, `simp_all`, `dsimp`, `simpa`, `simp … at h` y, con Mathlib,
`simp_rw`, `field_simp`, `norm_num [...]` y `push_cast [...]`. Tres cosas a tener en cuenta:

- Es lo que **aporta** cada lema, no una traza de lo que hizo `simp`. `simp` usa todos sus lemas a
  la vez, así que la lista completa puede reescribir un término de otra forma que un prefijo suyo.
  (`simp_rw` reescribe con sus reglas en orden, así que ahí los estados son los intermedios reales.)
- Un lema que por sí solo no progresa deja el estado como estaba, y *Before* se oculta.
- `simpa … using e` tiene que cerrar el objetivo, cosa que un prefijo de su lista no hace: sus
  pasos muestran lo que `simp` con los mismos lemas le hace al objetivo.

`rw [a, b]` no necesita nada de esto: Lean ya guarda el estado tras cada regla, y el panel lo
muestra como la InfoView. El modo rápido no puede ejecutar tácticas, así que siempre muestra los
estados alrededor de la línea.

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

El paquete está probado con `leanprover/lean4:v4.34.1` (y Mathlib `v4.34.1`); también compila, y
pasan los tests de su printer, con `v4.35.0`. Lake lo compila con el toolchain de tu proyecto, así
que con otras versiones de Lean puede no compilar; en ese caso queda el modo rápido.

El paquete y la extensión tienen que hablar la misma versión del protocolo. Si uno de los dos es
más antiguo, el panel se queda en modo rápido y lo dice encima de los objetivos: actualiza el
paquete (`lake update LeanBlackboard`) o la extensión.

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

Y `#latex_def f` muestra la firma y las ecuaciones de la definición `f` (o los campos o
constructores de un tipo), una por línea.

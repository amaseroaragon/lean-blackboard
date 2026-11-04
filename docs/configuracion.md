# Configuración

## Notación matemática / Lean

- **Global**: botón en la barra de título del panel Goals, o el comando
  `Lean Blackboard: Toggle Math / Lean Notation`. Se recuerda entre sesiones.
- **Por fila**: al pasar el ratón por una hipótesis u objetivo aparecen los botones `Lean`/`Math`
  y `Copy`. El cambio por fila se recuerda mientras no cambies la notación global (que lo
  reinicia).
- `Copy` copia siempre el LaTeX de la fila (por ejemplo `\mathrm{hpq} : p \to q`).
- `Copy all` (junto al número de objetivos) o el comando `Lean Blackboard: Copy Goal State as
  LaTeX` (icono en la barra del panel) copian todo el estado: un bloque `\[ \begin{array}{l} …`
  por objetivo, hipótesis encima de una raya y el objetivo debajo.

## Otras funciones del panel

- **Tipo esperado**: dentro de un término (`exact foo _`, `fun x => …`) aparece una sección
  *Expected type*, como en la InfoView.
- **Fórmulas largas**: si no caben en el ancho del panel se parten en líneas por los operadores de
  nivel superior (cuantificadores, ⇒, ∨, ∧, relaciones, +). Se recalcula al cambiar el ancho.
- **Interactividad (solo modo preciso)**: al pasar el ratón por una subexpresión se resalta y
  aparece su tipo; Ctrl+clic (⌘+clic en macOS) abre su definición.

## Reglas propias: `leanBlackboard.customRules`

Se combinan con las reglas por defecto (las tuyas ganan). Secciones:

| Sección | Clave | Plantilla |
|---|---|---|
| `symbols` | identificador (`G`, `Real.pi`) | LaTeX sin parámetros |
| `functions` | nombre completo (`Real.sinh`) | con `#1`, `#2`… (aridad = mayor `#n`) |
| `infix` | operador infijo que el parser ya conoce (`→`, `+`, `∣`…) | `#1` y `#2` |
| `prefix` | `¬ - ↑ √ #`… | `#1` |
| `postfix` | `⁻¹ !` | `#1` |
| `binders` | `∀ ∃ ∃! ∑ ∏` | un comando (`\forall`) |

`{#1}` (el marcador rodeado exactamente por llaves) quita los paréntesis que solo existían en
Lean: `\frac{#1}{#2}` convierte `(a + b) / c` en `\frac{a + b}{c}`. Fuera de llaves se conservan.

Ejemplo (`settings.json`):

```json
"leanBlackboard.customRules": {
  "symbols": { "G": "\\mathcal{G}" },
  "functions": {
    "Real.sinh": "\\sinh #1",
    "Nat.choose": "\\binom{#1}{#2}"
  },
  "infix": { "→": "#1 \\Rightarrow #2" }
}
```

Limitaciones: no se pueden añadir operadores nuevos al parser (por ejemplo `≡`); solo cambiar cómo
se dibujan los que ya reconoce. Las entradas inválidas se ignoran con un aviso en el canal de
salida "Lean Blackboard".

## Macros: `leanBlackboard.macros`

Equivalen a `\newcommand` y se pasan a KaTeX. Se pueden usar en las reglas propias.

```json
"leanBlackboard.macros": {
  "\\R": "\\mathbb{R}",
  "\\abs": "\\left|#1\\right|"
}
```

Si una macro produce LaTeX inválido, esa fila se muestra en sintaxis Lean.

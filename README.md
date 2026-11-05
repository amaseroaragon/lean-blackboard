# Lean Blackboard

**English** · [Español](README.es.md)

A VS Code extension that shows Lean 4 hypotheses and goals at the cursor with rendered math
notation (KaTeX), in its own panel next to the official Lean 4 extension. It reuses the official
extension's Lean server: no extra process, nothing to configure.

$$\forall \varepsilon > 0,\ \exists \delta > 0,\ \forall x \in \mathbb{R},\ \left|x - a\right| < \delta \to \left|f\left(x\right) - f\left(a\right)\right| < \varepsilon$$

## Installation

Requires VS Code ≥ 1.90, the [Lean 4 extension](https://marketplace.visualstudio.com/items?itemName=leanprover.lean4)
and Node.js to build it.

```sh
git clone https://github.com/amaseroaragon/lean-blackboard.git
cd lean-blackboard
npm install && npm run package
code --install-extension lean-blackboard.vsix
```

Open a `.lean` file and click the blackboard icon in the activity bar.

## Precise mode (optional)

By default the goals are converted from Lean's text output. For type-aware rendering (`⇒` vs `→`,
integer division, hover types, Ctrl/Cmd+click to definition), add the companion Lean package to
your project's `lakefile.toml`:

```toml
[[require]]
name = "LeanBlackboard"
git = "https://github.com/amaseroaragon/lean-blackboard"
rev = "main"
subDir = "lean"
```

Then run `lake update LeanBlackboard && lake build` and add `import LeanBlackboard` to your files. See
[docs/en/precise-mode.md](docs/en/precise-mode.md).

## Documentation

- [Configuration](docs/en/configuration.md): panel features, custom rules and macros.
- [Precise mode](docs/en/precise-mode.md).

## License

[MIT](LICENSE).

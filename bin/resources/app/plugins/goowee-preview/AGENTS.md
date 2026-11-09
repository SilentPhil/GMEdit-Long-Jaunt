# GooWee Preview architecture

- Keep the plugin independent of game projects. Never add recognition of a game's
  menus, managers, widget names, catalogue schemas, font helpers or data files.
- Obtain custom control behavior and ordinary helper functions from indexed GML
  source. Built-in models may implement documented GML and GooWee library APIs.
- Put sample gameplay state and expensive initialization substitutions in explicit
  `@preview` tags or advanced `@goowee-preview` blocks owned by the game project,
  not in plugin JavaScript. Prefer concise tags beside the affected code; keep
  larger sample datasets in project-owned fixture files.
- Keep interpretation bounded and read-only. Unsupported operations must produce
  actionable diagnostics; do not silently invent project-specific values.
- Cover language/library improvements with fixtures using arbitrary identifiers.
  Real project examples belong in integration tests, not production dispatch rules.

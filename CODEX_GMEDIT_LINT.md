# GMEdit Lint Instructions for Codex

Use these instructions when modifying GML files in this repository.

For automatic discovery by Codex, copy this file to the target GameMaker project as `AGENTS.md`,
or merge this section into an existing `AGENTS.md`.

## Finding the lint command

These repository instructions must not contain a user-specific or machine-specific absolute path.
GMEdit is distributed as a portable package and may be installed anywhere.

Resolve the launcher in this order:

1. Use `Get-Command gmedit-lint.cmd` when the launcher is available through `PATH`.
2. Use `$env:GMEDIT_LINT` as an optional workstation-specific override when it points to an
   existing `gmedit-lint.cmd`.
3. If neither is configured, stop and ask the user where `gmedit-lint.cmd` is installed.

Do not search the entire filesystem, assume a GMEdit installation directory, hard-code another
user's path, or launch `GMEdit.exe` directly as a substitute.

PowerShell discovery example:

```powershell
$command = Get-Command gmedit-lint.cmd -ErrorAction SilentlyContinue
$lint = if ($command) { $command.Source } else { $null }
if (-not $lint -or -not (Test-Path -LiteralPath $lint)) {
	$lint = $env:GMEDIT_LINT
}
if (-not $lint -or -not (Test-Path -LiteralPath $lint)) {
    throw 'gmedit-lint.cmd was not found in PATH and GMEDIT_LINT is not configured. Ask the user for its location.'
}
```

## Finding the GameMaker project

Prefer the exact `.yyp` path when known. A directory may also be passed; the launcher searches up
to three directory levels for a single `.yyp`. If a directory contains multiple projects, pass the
intended `.yyp` explicitly.

All file filters must be relative to the directory containing the `.yyp`, using paths such as:

```text
scripts/player/player.gml
objects/obj_game/obj_game.yy
rooms/rm_game/RoomCreationCode.gml
```

## Running checks

Check one modified file:

```powershell
& $lint 'C:\path\to\project.yyp' --file 'scripts/player/player.gml'
$lintExitCode = $LASTEXITCODE
```

Check several modified files:

```powershell
& $lint 'C:\path\to\project.yyp' `
    --file 'scripts/player/player.gml' `
    --file 'scripts/inventory/inventory.gml' `
    --file 'objects/obj_game/obj_game.yy'
$lintExitCode = $LASTEXITCODE
```

Check the entire project:

```powershell
& $lint 'C:\path\to\project.yyp'
$lintExitCode = $LASTEXITCODE
```

Request machine-readable output when it is useful for processing results:

```powershell
& $lint 'C:\path\to\project.yyp' --json
$lintExitCode = $LASTEXITCODE
```

Available options:

- `--file <relative-path>`: include diagnostics for this file; repeat for multiple files.
- Positional file paths after the project path are equivalent to repeated `--file` options.
- `--json` or `--format json`: emit JSON.
- `--errors-only`: omit warnings from the result.
- `--warnings-as-errors`: return exit code `1` when warnings are present.

The project is always fully indexed so that cross-file types and resources resolve correctly. File
arguments filter the reported diagnostics; they do not skip project indexing.

## Exit codes

- `0`: no lint errors were found. Warnings may still be present unless `--warnings-as-errors` was
  used, so always inspect the output.
- `1`: lint errors were found, or warnings were found with `--warnings-as-errors`.
- `2`: the CLI could not complete the scan.

Treat exit code `1` as a completed scan with diagnostics, not as a launcher failure. Treat exit code
`2`, a timeout, missing output, or invalid JSON as an infrastructure failure and report it clearly.

## Required workflow

1. After changing GML, run a targeted check for every modified GML/YY code file.
2. Fix diagnostics caused by the change. Do not silently suppress or exclude them.
3. For broad refactors or changes to shared types, constructors, macros, extensions, or APIs, run a
   full-project check before finishing.
4. Report the exact command scope, error count, warning count, and exit code in the final response.
5. The CLI copies the current GMEdit configuration into an isolated temporary profile, so its
   linter preferences should match the GMEdit Problems panel while remaining safe to run alongside
   an open GMEdit window.
6. The lint process uses hidden Electron. If execution is blocked by a sandbox or GUI-process
   restriction, rerun it with the required approval instead of replacing it with a different check.

## Workstation setup

Each workstation must make its own GMEdit installation discoverable. The recommended setup is to
add the directory containing `gmedit-lint.cmd` to that workstation's user `PATH`. This keeps project
instructions portable and allows the same command to work in CMD, PowerShell, CI, and Codex:

```powershell
gmedit-lint.cmd path\to\project.yyp
```

If changing `PATH` is not desirable, the workstation may define `GMEDIT_LINT` with its own absolute
launcher path. This is local machine configuration and must not be committed to the project or
written into `AGENTS.md`. After changing `PATH` or `GMEDIT_LINT`, restart Codex so it inherits the
updated environment.

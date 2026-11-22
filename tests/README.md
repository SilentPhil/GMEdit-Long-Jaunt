# tests/

This folder contains tests!

This includes unit tests (`unittest/`)
and simpler visual tests (`TestGMEditGMS*`) for things like syntax highlighter that are tricky to load/test.

## Color picker regression tests

Run `npm.cmd run test:colors` from the repository root. This builds the production
color dialogs and context menu into a small test bridge and runs them with real
Ace sessions in a hidden Electron window. It covers literal targeting, RGB/BGR
conversion, HEX input, Apply/Cancel, Undo/Redo, clipboard actions, and tab colors.
The runner prints the path to a screenshot of the dialog.

## Runtime fnames integration

Run `npm.cmd run test:fnames` for the API source selector and loader checks.
To include Constructor and an installed runtime, run:

```sh
node tests/run-fnames-tests.js --constructor "path/to/GMEdit-Constructor" --runtime "path/to/runtime-version"
```

The test uses an isolated profile and fixtures, loads the plugin's actual bridge,
and can parse the installed runtime's `fnames` with GMEdit's API patches. It does
not change the user's preferences or project files.

## Running unit tests

From the repository root:

```sh
npm.cmd run test:electron
```

This compiles `tests/test.hxml`, starts `tests/unittest_node`, and runs the browser test target in Electron.
The full runner log is written to `tests/electron-test-result.txt` (ignored by Git).

If Codex is running these tests, use the same command with escalated sandbox permissions. The Electron runner starts a GUI/browser process, and may exit before writing `tests/electron-test-result.txt` when run inside the default sandbox.

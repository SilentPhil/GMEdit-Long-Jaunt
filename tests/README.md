# tests/

This folder contains tests!

This includes unit tests (`unittest/`)
and simpler visual tests (`TestGMEditGMS*`) for things like syntax highlighter that are tricky to load/test.

## Running unit tests

From the repository root:

```sh
npm.cmd run test:electron
```

This compiles `tests/test.hxml`, starts `tests/unittest_node`, and runs the browser test target in Electron.
The full runner log is written to `tests/electron-test-result.txt` (ignored by Git).

If Codex is running these tests, use the same command with escalated sandbox permissions. The Electron runner starts a GUI/browser process, and may exit before writing `tests/electron-test-result.txt` when run inside the default sandbox.

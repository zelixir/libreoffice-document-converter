# Bun Support

This document describes the Bun support added in this change, why it is implemented this way, and how the runtime works in both normal Bun scripts and Bun single-file executables.

## What changed

- Added runtime detection for Bun.
- Added automatic resolution of the packaged `wasm/` directory for Node-like runtimes.
- Added Bun-specific fallback logic that can extract the packaged LibreOffice WASM assets to a temporary directory when the code is running from a Bun-compiled single executable.
- Made `LibreOfficeConverter` auto-load `wasm/loader.cjs` when the caller does not explicitly provide `wasmLoader`.
- Made `WorkerConverter` and `SubprocessConverter` reuse the same resolved `wasmPath`, so Bun script mode can find the packaged runtime assets without requiring `./wasm` in the caller's current working directory.
- Changed `convertDocument()` so Bun uses the in-process converter path instead of the Node subprocess shortcut. This avoids depending on external worker entry files when the app is compiled into one binary.
- Added Bun examples for script mode and compiled mode.

## Why this design

The library already ships the full LibreOffice runtime in `wasm/`. In Node.js, callers often point `wasmPath` at a filesystem directory or pass `wasmLoader` explicitly. That works, but it is a poor default for Bun because:

1. Bun users expect packages to be self-contained.
2. In a Bun-compiled executable there is no ordinary `./wasm` directory next to the executable.
3. Requiring users to manually import `loader.cjs` or unpack assets would turn Bun support into a workaround instead of first-class runtime support.

The new implementation keeps the existing public API intact and moves the runtime-specific logic inside the library, where it belongs.

## Technical principles

### 1. Runtime-aware wasm path resolution

The library now resolves runtime assets in this order:

1. A caller-provided `wasmPath` that already contains the required files.
2. The package's own published `wasm/` directory.
3. For Bun only: a temporary extracted copy of the embedded `wasm/` assets.
4. Finally, the original user-provided/default path as a last fallback.

This means Bun script mode works with the package contents directly, while Bun compiled mode can still materialize a real directory for the Emscripten runtime.

### 2. Automatic loader resolution

`LibreOfficeConverter` now resolves `loader.cjs` automatically from the same runtime directory. Consumers can still pass `wasmLoader` explicitly, but it is no longer required for the common Bun path.

### 3. Compiled Bun executables need real files

The LibreOffice runtime is not just a single `.wasm` file. It also depends on:

- `loader.cjs`
- `soffice.cjs`
- `soffice.js`
- `soffice.data`
- `soffice.wasm`
- pthread worker entry files

Emscripten expects these assets to exist in a real directory with stable relative paths. For Bun single-file executables, the library therefore extracts the embedded assets to a temporary directory and runs the loader from there. This preserves the expected file layout instead of patching around Emscripten internals.

### 4. Why `convertDocument()` behaves differently on Bun

On Node.js, `convertDocument()` prefers `SubprocessConverter` for simple conversions so the process can exit cleanly after WASM work finishes.

That optimization is not the right default for Bun single-file executables because it depends on standalone subprocess entry files. In Bun, `convertDocument()` now uses the direct converter path so script mode and compiled mode share the same asset-resolution flow.

## Usage

### Bun script mode

```bash
npm run build
bun examples/bun-script.ts tests/sample_2_page.docx /tmp/sample.pdf
```

### Bun single-file executable mode

```bash
npm run build
bun build examples/bun-compiled.ts --compile --outfile ./libreoffice-bun-demo
./libreoffice-bun-demo tests/sample_2_page.docx /tmp/sample.pdf
```

## Scope and limitations

- The Bun work in this PR focuses on the standard conversion path and the one-shot `convertDocument()` API.
- `WorkerConverter` and `SubprocessConverter` benefit from the shared `wasmPath` resolution in normal Bun script mode.
- The compiled Bun path intentionally routes the simplest public APIs through the direct converter flow because that is the most stable and least surprising packaging model.

import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isBunRuntime, resolveRuntimeWasmDirectory } from '../src/runtime.js';

describe('runtime helpers', () => {
  it('does not report Bun in the Node.js test runtime', () => {
    expect(isBunRuntime()).toBe(false);
  });

  it('resolves the repository packaged wasm directory by default', async () => {
    await expect(resolveRuntimeWasmDirectory()).resolves.toBe(resolve(process.cwd(), 'wasm'));
  });

  it('keeps an explicit wasm directory when it already exists', async () => {
    const explicitPath = resolve(process.cwd(), 'wasm');
    await expect(resolveRuntimeWasmDirectory(explicitPath)).resolves.toBe(explicitPath);
  });
});

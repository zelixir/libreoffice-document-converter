import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { WasmLoaderModule } from './types.js';

interface BunFileLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface BunRuntimeLike {
  version: string;
  file(path: string | URL): BunFileLike;
}

const bunRuntime = (globalThis as typeof globalThis & { Bun?: BunRuntimeLike }).Bun;

const DEFAULT_WASM_PATH = './wasm';
const EMBEDDED_WASM_FILES = [
  'loader.cjs',
  'soffice.cjs',
  'soffice.js',
  'soffice.data',
  'soffice.wasm',
  'soffice.worker.cjs',
  'soffice.worker.js',
] as const;

const EMBEDDED_WASM_URLS = Object.fromEntries(
  EMBEDDED_WASM_FILES.map((filename) => [filename, new URL(`../wasm/${filename}`, import.meta.url)])
) as Record<(typeof EMBEDDED_WASM_FILES)[number], URL>;
const EMBEDDED_DIST_FILES = ['subprocess.worker.cjs'] as const;
const EMBEDDED_DIST_URLS = Object.fromEntries(
  EMBEDDED_DIST_FILES.map((filename) => [filename, new URL(`./${filename}`, import.meta.url)])
) as Record<(typeof EMBEDDED_DIST_FILES)[number], URL>;

let extractedBunWasmDirPromise: Promise<string> | null = null;
let extractedBunPackageRootPromise: Promise<string> | null = null;

function isDefaultWasmPath(wasmPath?: string): boolean {
  return wasmPath == null || wasmPath === DEFAULT_WASM_PATH || wasmPath === 'wasm';
}

function hasAllEmbeddedWasmFiles(dirPath: string): boolean {
  return EMBEDDED_WASM_FILES.every((filename) => existsSync(join(dirPath, filename)));
}

function isBunVirtualPath(pathValue: string): boolean {
  return pathValue.startsWith('/$bunfs/');
}

function resolveExistingWasmDir(wasmPath?: string): string | null {
  if (!wasmPath) {
    return null;
  }

  const resolvedPath = resolve(wasmPath);
  return hasAllEmbeddedWasmFiles(resolvedPath) ? resolvedPath : null;
}

function resolvePackagedWasmDir(): string | null {
  try {
    const loaderPath = fileURLToPath(EMBEDDED_WASM_URLS['loader.cjs']);
    const wasmDir = dirname(loaderPath);
    if (isBunRuntime() && isBunVirtualPath(wasmDir)) {
      return null;
    }
    return hasAllEmbeddedWasmFiles(wasmDir) ? wasmDir : null;
  } catch {
    return null;
  }
}

async function extractBundledBunWasmDir(): Promise<string> {
  const packageRoot = await extractBundledBunPackageRoot();
  return join(packageRoot, 'wasm');
}

export function isBunRuntime(): boolean {
  return Boolean(bunRuntime?.version);
}

function resolvePackagedSubprocessWorkerPath(): string | null {
  try {
    const workerPath = fileURLToPath(EMBEDDED_DIST_URLS['subprocess.worker.cjs']);
    if (isBunRuntime() && isBunVirtualPath(workerPath)) {
      return null;
    }
    return existsSync(workerPath) ? workerPath : null;
  } catch {
    return null;
  }
}

async function extractBundledBunPackageRoot(): Promise<string> {
  if (!bunRuntime) {
    throw new Error('Bundled Bun asset extraction is only available when running on Bun');
  }

  const extractionInstanceId = `${process.pid}-${Date.now()}-${randomUUID()}`;
  const packageRoot = join(tmpdir(), 'libreoffice-document-converter-bun', extractionInstanceId);
  const wasmDir = join(packageRoot, 'wasm');
  const distDir = join(packageRoot, 'dist');
  mkdirSync(wasmDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  for (const filename of EMBEDDED_WASM_FILES) {
    const destinationPath = join(wasmDir, filename);
    if (!existsSync(destinationPath)) {
      const data = await bunRuntime.file(EMBEDDED_WASM_URLS[filename]).arrayBuffer();
      await writeFile(destinationPath, new Uint8Array(data));
    }
  }

  for (const filename of EMBEDDED_DIST_FILES) {
    const destinationPath = join(distDir, filename);
    if (!existsSync(destinationPath)) {
      const data = await bunRuntime.file(EMBEDDED_DIST_URLS[filename]).arrayBuffer();
      await writeFile(destinationPath, new Uint8Array(data));
    }
  }

  return packageRoot;
}

export async function resolveRuntimeWasmDirectory(wasmPath?: string): Promise<string> {
  const explicitWasmDir = resolveExistingWasmDir(wasmPath);
  if (explicitWasmDir) {
    return explicitWasmDir;
  }

  if (!wasmPath || isDefaultWasmPath(wasmPath)) {
    const packagedWasmDir = resolvePackagedWasmDir();
    if (packagedWasmDir) {
      return packagedWasmDir;
    }

    if (isBunRuntime()) {
      if (!extractedBunWasmDirPromise) {
        extractedBunWasmDirPromise = extractBundledBunWasmDir().catch((error: unknown) => {
          extractedBunWasmDirPromise = null;
          throw error;
        });
      }
      return extractedBunWasmDirPromise;
    }
  }

  return resolve(wasmPath || DEFAULT_WASM_PATH);
}

export async function resolveRuntimeSubprocessWorkerPath(workerPath?: string): Promise<string> {
  if (workerPath) {
    return resolve(workerPath);
  }

  const packagedWorkerPath = resolvePackagedSubprocessWorkerPath();
  if (packagedWorkerPath) {
    return packagedWorkerPath;
  }

  if (isBunRuntime()) {
    if (!extractedBunPackageRootPromise) {
      extractedBunPackageRootPromise = extractBundledBunPackageRoot().catch((error: unknown) => {
        extractedBunPackageRootPromise = null;
        throw error;
      });
    }

    const packageRoot = await extractedBunPackageRootPromise;
    return join(packageRoot, 'dist', 'subprocess.worker.cjs');
  }

  return resolve(workerPath || 'dist/subprocess.worker.cjs');
}

export function getBunNodeExecPath(): string {
  return process.env.LIBREOFFICE_CONVERTER_NODE_PATH || 'node';
}

export async function resolveRuntimeWasmLoader(
  wasmPath?: string,
  wasmLoader?: WasmLoaderModule
): Promise<{ wasmDir: string; wasmLoader: WasmLoaderModule }> {
  const wasmDir = await resolveRuntimeWasmDirectory(wasmPath);

  if (wasmLoader) {
    return { wasmDir, wasmLoader };
  }

  const loaderPath = join(wasmDir, 'loader.cjs');
  if (!existsSync(loaderPath)) {
    throw new Error(`WASM loader not found at ${loaderPath}`);
  }

  const require = createRequire(import.meta.url);
  return {
    wasmDir,
    wasmLoader: require(loaderPath) as WasmLoaderModule,
  };
}

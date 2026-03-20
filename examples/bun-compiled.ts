/**
 * Example: Bun single-file executable mode
 *
 * Build:
 *   bun build examples/bun-compiled.ts --compile --outfile ./libreoffice-bun-demo
 *
 * Run:
 *   # from the package root after `npm run build`
 *   ./libreoffice-bun-demo tests/sample_2_page.docx /tmp/sample.pdf
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { convertDocument } from '../dist/index.js';
import type { OutputFormat } from '../dist/index.js';

async function main() {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath || !outputPath) {
    console.log('Usage: ./libreoffice-bun-demo <input> <output>');
    process.exit(1);
  }

  const outputFormat = extname(outputPath).slice(1).toLowerCase() as OutputFormat;
  if (!outputFormat) {
    throw new Error(`Could not infer output format from ${outputPath}`);
  }

  const wasmPath = resolve(process.cwd(), 'wasm');
  const workerPath = resolve(process.cwd(), 'dist', 'subprocess.worker.cjs');
  if (!existsSync(wasmPath) || !existsSync(workerPath)) {
    throw new Error(
      'The Bun compiled example must be run from the built package root so ./wasm and ./dist/subprocess.worker.cjs are available.'
    );
  }

  const input = await readFile(inputPath);
  const result = await convertDocument(input, { outputFormat }, {
    verbose: true,
    wasmPath,
    workerPath,
    onProgress: (progress) => {
      process.stdout.write(`\r[${progress.phase}] ${progress.percent}% ${progress.message}`);
    },
  });
  await writeFile(outputPath, result.data);

  console.log('\nDone');
  console.log(`Input : ${basename(inputPath)}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Bytes : ${result.data.length}`);
}

main().catch((error) => {
  console.error('\nBun compile example failed:', error);
  process.exit(1);
});

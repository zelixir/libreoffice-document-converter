/**
 * Example: Bun single-file executable mode
 *
 * Build:
 *   bun build examples/bun-compiled.ts --compile --outfile ./libreoffice-bun-demo
 *
 * Run:
 *   ./libreoffice-bun-demo tests/sample_2_page.docx /tmp/sample.pdf
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, extname } from 'path';
import { createConverter } from '../dist/index.js';
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

  const converter = await createConverter({
    verbose: true,
    onProgress: (progress) => {
      process.stdout.write(`\r[${progress.phase}] ${progress.percent}% ${progress.message}`);
    },
  });

  try {
    const input = await readFile(inputPath);
    const result = await converter.convert(input, { outputFormat }, basename(inputPath));

    await writeFile(outputPath, result.data);

    console.log('\nDone');
    console.log(`Input : ${basename(inputPath)}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Bytes : ${result.data.length}`);
  } finally {
    await converter.destroy();
  }
}

main().catch((error) => {
  console.error('\nBun compile example failed:', error);
  process.exit(1);
});

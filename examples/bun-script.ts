/**
 * Example: Bun script mode
 *
 * Usage:
 *   bun examples/bun-script.ts tests/sample_2_page.docx /tmp/sample.pdf
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, extname } from 'path';
import { convertDocument } from '../dist/index.js';
import type { OutputFormat } from '../dist/index.js';

async function main() {
  const [, , inputPath, outputPath] = process.argv;

  if (!inputPath || !outputPath) {
    console.log('Usage: bun examples/bun-script.ts <input> <output>');
    process.exit(1);
  }

  const outputFormat = extname(outputPath).slice(1).toLowerCase() as OutputFormat;
  if (!outputFormat) {
    throw new Error(`Could not infer output format from ${outputPath}`);
  }

  const input = await readFile(inputPath);
  const result = await convertDocument(input, { outputFormat }, {
    verbose: true,
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
  console.error('\nBun script example failed:', error);
  process.exit(1);
});

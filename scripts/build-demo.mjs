import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'assets/scripts/core/GameSession.ts');
const outputPath = resolve(root, 'demo/generated/GameSession.js');
const source = await readFile(sourcePath, 'utf8');
const output = stripTypeScriptTypes(source, { mode: 'transform', sourceMap: true });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
console.log(`Built ${outputPath}`);

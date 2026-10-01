#!/usr/bin/env node
/** Yerel önizleme: `node tools/serve.mjs` — boş bir port seçer ve adresi yazar. */
import path from 'node:path';
import { startServer } from './lib/serve.mjs';

const server = await startServer(path.resolve(import.meta.dirname, '..'));
console.log(`Önizleme: ${server.origin}/  (durdurmak için Ctrl+C)`);

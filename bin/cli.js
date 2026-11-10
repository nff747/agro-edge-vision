#!/usr/bin/env node
/**
 * AgroEdge Vision CLI
 * Copyright (c) 2026 nff747. Licensed under Apache-2.0.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const daemonScript = join(__dirname, '..', 'server', 'daemon.py');

const port = process.env.PORT || '8080';
console.log('🌱 AgroEdge Vision - Starting Autonomous Field Hub on http://localhost:' + port);

const proc = spawn('python3', [daemonScript], {
  stdio: 'inherit',
  env: { ...process.env, PORT: port }
});

proc.on('error', (err) => {
  console.error('Failed to start AgroEdge backend daemon:', err.message);
  process.exit(1);
});

proc.on('close', (code) => {
  process.exit(code || 0);
});

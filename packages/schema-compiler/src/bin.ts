#!/usr/bin/env node
// The `pvl` executable: runs the CLI against the real process.
import { runCli } from './cli.js';

void runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: process.stdout,
  stderr: process.stderr,
}).then((exitCode) => {
  process.exitCode = exitCode;
});

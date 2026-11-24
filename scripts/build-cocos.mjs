import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const creator = process.env.COCOS_CREATOR
  ?? 'C:\\Users\\19443\\AppData\\Local\\CocosCreator\\3.8.7\\CocosCreator.exe';
const configPath = resolve(project, 'configs/build-web-mobile.json');
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;

const child = spawn(creator, [
  '--project',
  project,
  '--build',
  `configPath=${configPath}`,
], {
  cwd: project,
  env: childEnvironment,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  // Creator uses 36 to report a successful command-line build.
  if (code !== 0 && code !== 36) process.exitCode = code ?? 1;
});

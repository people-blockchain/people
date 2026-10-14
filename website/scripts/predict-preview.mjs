import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Local preview only: an ephemeral auth secret, never written to disk or printed.
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', process.env.PREDICT_PREVIEW_PORT ?? '3101'], {
 stdio: 'inherit', env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString('hex') },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));

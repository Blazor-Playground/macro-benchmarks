import { access, mkdir, mkdtemp, rmdir, symlink, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startStaticServer } from '../../bench/src/lib/measure-utils.ts';
import { startViewerDataProxy } from './viewer-data-proxy.mjs';

const wwwroot = resolve(process.env.VIEWER_WWWROOT ?? 'artifacts/bench-viewer/wwwroot');
await access(join(wwwroot, 'index.html'));
await mkdir('artifacts', { recursive: true });
const site = await mkdtemp(resolve('artifacts/viewer-site-'));
await symlink(wwwroot, join(site, 'macro-benchmarks'), 'dir');
await symlink(join(wwwroot, 'index.html'), join(site, 'index.html'));
const dataUrl = process.env.VIEWER_DATA_URL;
const staticServer = await startStaticServer(site, dataUrl ? 0 : Number(process.env.PORT ?? 0));
const server = dataUrl
    ? await startViewerDataProxy(staticServer.port, dataUrl, Number(process.env.PORT ?? 0))
    : staticServer;
console.log(`VIEWER_URL=http://127.0.0.1:${server.port}/macro-benchmarks/net12-focus`);
console.log(`VIEWER_WWWROOT=${wwwroot}`);
console.log(`VIEWER_SITE=${site}`);
console.log(`VIEWER_PID=${process.pid}`);
console.log(`VIEWER_DATA_SOURCE=${dataUrl || 'local published wwwroot/data/views'}`);

let closing = false;
async function close() {
    if (closing) return;
    closing = true;
    await server.close();
    if (server !== staticServer) await staticServer.close();
    await unlink(join(site, 'macro-benchmarks'));
    await unlink(join(site, 'index.html'));
    await rmdir(site);
}
process.once('SIGINT', () => { close().catch(error => { console.error(error); process.exitCode = 1; }); });
process.once('SIGTERM', () => { close().catch(error => { console.error(error); process.exitCode = 1; }); });

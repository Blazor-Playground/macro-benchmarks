import { buildContext } from '../../bench/src/args.ts';
import { run } from '../../bench/src/stages/measure-dev-loop.ts';

try {
    const ctx = await buildContext([
        '--stages', 'measure-dev-loop', '--app', 'empty-blazor', '--runtime', 'mono',
        '--debug-dotnet', process.argv[2], '--debug-browser-channel', process.env.PLAYWRIGHT_CHANNEL || 'chrome',
        '--debug-scenarios', 'first-run', '--debug-runs', '1', '--timeout', '60000',
    ]);
    await run(ctx);
    throw new Error('Cancellation fixture unexpectedly completed');
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}

import { runQuickStartCli } from './runtime-bench.mjs';

await runQuickStartCli(['bootstrap', ...process.argv.slice(2)]);

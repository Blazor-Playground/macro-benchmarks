import { runQuickStartCli } from './runtime-bench.mjs';

await runQuickStartCli(['iterate', ...process.argv.slice(2)]);

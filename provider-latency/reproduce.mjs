import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const [sourceRoot, label, expectation] = process.argv.slice(2);
assert(sourceRoot && label && ['negative', 'nonnegative'].includes(expectation));
const outputDir = resolve(process.env.PROMPTFOO_CONFIG_DIR);
await mkdir(outputDir, { recursive: true });
const { evaluate } = await import(pathToFileURL(resolve(sourceRoot, 'src/index.ts')).href);
const originalDateNow = Date.now;
const restoreClock = (output) => {
  Date.now = originalDateNow;
  return output;
};
const provider = {
  id: () => 'synthetic-local-clock-rollback',
  label: 'Synthetic local provider',
  async callApi() {
    await sleep(30);
    Date.now = () => originalDateNow() - 5000;
    return { output: 'Synthetic local response; process-local wall clock stepped back 5000 ms.' };
  },
};
try {
  const record = await evaluate({
    description: `Synthetic clock rollback — ${label}`,
    providers: [provider],
    prompts: ['Return a synthetic local response.'],
    tests: [{ vars: { scenario: 'Local 30 ms wait; process-local -5000 ms wall-clock step' }, options: { transform: restoreClock } }],
    writeLatestResults: true,
    sharing: false,
  }, { cache: false, maxConcurrency: 1, showProgressBar: false });
  const result = await record.toEvaluateSummary();
  const row = result.results[0];
  assert.equal(row.success, true);
  assert.equal(Date.now, originalDateNow, 'Clock must be restored before evaluation completes');
  assert.equal(expectation === 'negative' ? row.latencyMs < 0 : row.latencyMs >= 0, true);
  await writeFile(resolve(outputDir, 'native-results.json'), JSON.stringify(result, null, 2));
  await writeFile(resolve(outputDir, 'measurement.json'), JSON.stringify({ label, evalId: record.id, latencyMs: row.latencyMs, success: row.success, expectation }, null, 2));
  console.log(JSON.stringify({ label, evalId: record.id, latencyMs: row.latencyMs, success: row.success, expectation }));
} finally {
  Date.now = originalDateNow;
}

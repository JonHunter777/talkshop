import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Why a child process: Jest gives every test file its own copy of process.env, but
// process.loadEnvFile (used by loadSeedEnv) writes to the REAL process environment.
// So inside Jest the loaded values are invisible. A child Node process runs the real
// load-env.ts exactly like the seed script does (Node 24 runs .ts files by stripping types).
const FROM_FILE = 'SEED_TEST_LOADENV_FROM_FILE';
const PRIORITY = 'SEED_TEST_LOADENV_PRIORITY';

const RUNNER_SOURCE = `
const [loadEnvUrl, file, ...names] = process.argv.slice(2);
const { loadSeedEnv } = await import(loadEnvUrl);
let error = null;
try {
  loadSeedEnv(file);
} catch (e) {
  error = { name: e.name, code: e.code ?? null };
}
const env = {};
for (const name of names) {
  env[name] = process.env[name] ?? null;
}
console.log(JSON.stringify({ env, error }));
`;

interface RunnerOutput {
  env: Record<string, string | null>;
  error: { name: string; code: string | null } | null;
}

describe('loadSeedEnv', () => {
  let tempDir: string;
  let runnerPath: string;
  const loadEnvUrl = pathToFileURL(join(__dirname, 'load-env.ts')).href;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'seed-load-env-'));
    runnerPath = join(tempDir, 'runner.mjs');
    writeFileSync(runnerPath, RUNNER_SOURCE);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // Runs loadSeedEnv(file) in a fresh process whose environment is `processEnv`
  function runLoadSeedEnv(file: string, processEnv: Record<string, string> = {}): RunnerOutput {
    const baseEnv = { ...process.env };
    delete baseEnv[FROM_FILE];
    delete baseEnv[PRIORITY];
    const stdout = execFileSync(
      process.execPath,
      [runnerPath, loadEnvUrl, file, FROM_FILE, PRIORITY],
      { env: { ...baseEnv, ...processEnv, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' },
    );
    return JSON.parse(stdout.trim().split('\n').pop() ?? '') as RunnerOutput;
  }

  it('loads a variable from the file into process.env', () => {
    const file = join(tempDir, 'loads.env');
    writeFileSync(file, `${FROM_FILE}=value-from-file\n`);

    const result = runLoadSeedEnv(file);

    expect(result.error).toBeNull();
    expect(result.env[FROM_FILE]).toBe('value-from-file');
  });

  it('does not overwrite a variable that is already set in the process (command beats .env)', () => {
    const file = join(tempDir, 'priority.env');
    writeFileSync(file, `${PRIORITY}=value-from-file\n${FROM_FILE}=other-from-file\n`);

    const result = runLoadSeedEnv(file, { [PRIORITY]: 'value-from-command' });

    expect(result.error).toBeNull();
    expect(result.env[PRIORITY]).toBe('value-from-command');
    // The same file still loads the variables that are not set yet
    expect(result.env[FROM_FILE]).toBe('other-from-file');
  });

  it('does not throw when the file does not exist', () => {
    const result = runLoadSeedEnv(join(tempDir, 'missing.env'));

    expect(result.error).toBeNull();
    expect(result.env[FROM_FILE]).toBeNull();
  });

  it('rethrows a non-ENOENT error when the path is a directory', () => {
    const directory = join(tempDir, 'a-directory.env');
    mkdirSync(directory);

    const result = runLoadSeedEnv(directory);

    expect(result.error).not.toBeNull();
    expect(result.error?.code).not.toBe('ENOENT');
  });
});

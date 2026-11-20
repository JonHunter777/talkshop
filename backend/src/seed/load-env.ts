// Loads variables from a .env file into process.env.
// Variables that are already set in the process are NOT overwritten
// (the environment / command line has priority over the file).
// Only a missing file is ignored; any other error (e.g. a permission problem) is rethrown.
export function loadSeedEnv(filePath = '.env'): void {
  try {
    process.loadEnvFile(filePath);
  } catch (error) {
    const isMissing =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
    if (!isMissing) {
      throw error;
    }
  }
}

// Removes a package's `database` directory when its compiled mirror is complete.
//
// The template's `scripts/utils/prune-dist-artifacts.mjs` prunes by file extension, and this is the one case an
// extension rule cannot see: a plugin declares its migrations, seeds and collections as paths under `./database`, and
// publishes the TypeScript sources of that directory alongside the compiled copy under `dist/database`. The resolver
// tries `<package>/database/...` first and only then `<package>/dist/database/...`, so a package that ships both wins
// with the sources. That works under the repository's `tsx`-driven CLI and fails on a deployment, where plain `node`
// refuses to strip types for a file inside `node_modules`:
//
//   Stripping types is currently unsupported for files under node_modules,
//   for ".../app-plugin-ai-employee/database/migrations/202608260002_create_ai_employee.ts"
//
// The whole directory has to go, not just the files in it. Emptying it instead would be worse than leaving it: the
// resolver returns the first candidate that *exists*, so a `database/migrations` directory left behind with no files
// in it reports zero migrations and the compiled ones are never reached — a deployment that boots with its tables
// missing. Removing the directory is what makes the fallback happen for migrations, seeds and collections alike.
//
// The compiled mirror is checked first, so a package that ships sources and nothing else is left intact rather than
// broken.
//
// It lives here, rather than in the template's script, because no published template carries it: the template ignores
// a file by extension and a directory is not a file. The overlay calls it from the prune script it patches, so one
// copy serves every baseline the factory generates.
import fs from 'node:fs';
import path from 'node:path';

/** How a package's source file is named once it has been compiled. */
const compiledName = (fileName) => {
  if (fileName.endsWith('.mts')) return fileName.replace(/\.mts$/, '.mjs');
  if (fileName.endsWith('.cts')) return fileName.replace(/\.cts$/, '.cjs');
  if (fileName.endsWith('.ts')) return fileName.replace(/\.ts$/, '.js');
  if (fileName.endsWith('.tsx')) return fileName.replace(/\.tsx$/, '.js');
  return fileName;
};

/**
 * Whether a package's `database` directory is fully superseded by its compiled mirror.
 *
 * Empty would be a wrong answer here, so a source file without a compiled counterpart means the directory is not
 * superseded and is left untouched.
 */
const isCompletelyCompiled = (sourceDir, compiledDir) => {
  let entries;
  try {
    entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name);
    if (entry.isDirectory()) {
      if (!isCompletelyCompiled(source, path.join(compiledDir, entry.name)))
        return false;
      continue;
    }
    if (!entry.isFile()) return false;
    if (!fs.existsSync(path.join(compiledDir, compiledName(entry.name))))
      return false;
  }
  return true;
};

/** Removes a directory, counting what it held, since the caller's walk will not reach inside it. */
const removeTree = (directoryPath, removed) => {
  let entries;
  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      removeTree(entryPath, removed);
      continue;
    }
    if (!entry.isFile()) continue;
    let size;
    try {
      size = fs.lstatSync(entryPath).size;
    } catch {
      continue;
    }
    fs.rmSync(entryPath, { force: true });
    removed.count += 1;
    removed.bytes += size;
  }
  fs.rmSync(directoryPath, { recursive: true, force: true });
};

/**
 * Removes `directoryPath` when it is a `database` directory shadowing its own compiled output.
 *
 * Returns whether it was removed, so a caller walking a deployment tree can skip descending into it: the directory
 * itself is what has to go, and a walk that reached its files first would have to undo its own work.
 */
export const removeSupersededDatabaseDirectory = (directoryPath, removed) => {
  if (path.basename(directoryPath) !== 'database') return false;
  const compiled = path.join(path.dirname(directoryPath), 'dist', 'database');
  if (!fs.existsSync(compiled)) return false;
  if (!isCompletelyCompiled(directoryPath, compiled)) return false;
  removeTree(directoryPath, removed);
  return true;
};

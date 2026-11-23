import fs from 'node:fs';
import path from 'node:path';

export interface MigrationResult {
  migrated: boolean;
  source?: string;
}

const DATA_FILE = 'notes-data.json';

/**
 * Copy the legacy MacNotes data into the new FreeNotes userData directory.
 * Copying (rather than moving) keeps the old installation recoverable.
 */
export function migrateLegacyData(newDir: string, legacyDir: string): MigrationResult {
  if (path.resolve(newDir) === path.resolve(legacyDir)) return { migrated: false };

  const legacyDataPath = path.join(legacyDir, DATA_FILE);
  const newDataPath = path.join(newDir, DATA_FILE);
  if (!fs.existsSync(legacyDataPath) || fs.existsSync(newDataPath)) {
    return { migrated: false };
  }

  fs.mkdirSync(newDir, { recursive: true });
  fs.copyFileSync(legacyDataPath, newDataPath);

  const legacyBackupDir = path.join(legacyDir, 'backups');
  const newBackupDir = path.join(newDir, 'backups');
  if (fs.existsSync(legacyBackupDir)) {
    fs.mkdirSync(newBackupDir, { recursive: true });
    for (const entry of fs.readdirSync(legacyBackupDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const source = path.join(legacyBackupDir, entry.name);
      const target = path.join(newBackupDir, entry.name);
      if (!fs.existsSync(target)) fs.copyFileSync(source, target);
    }
  }

  return { migrated: true, source: legacyDir };
}

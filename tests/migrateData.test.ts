import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateLegacyData } from '../src/main/migrateData';

const tempDirs: string[] = [];

function makeDir(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `freenotes-${name}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('legacy data migration', () => {
  it('copies notes and backups without moving the legacy directory', () => {
    const legacy = makeDir('legacy');
    const current = makeDir('current');
    fs.writeFileSync(path.join(legacy, 'notes-data.json'), '{"version":1}');
    fs.mkdirSync(path.join(legacy, 'backups'));
    fs.writeFileSync(path.join(legacy, 'backups', 'notes-2026-01-01.json'), '{}');

    const result = migrateLegacyData(current, legacy);

    expect(result.migrated).toBe(true);
    expect(fs.readFileSync(path.join(current, 'notes-data.json'), 'utf8')).toBe('{"version":1}');
    expect(fs.existsSync(path.join(current, 'backups', 'notes-2026-01-01.json'))).toBe(true);
    expect(fs.existsSync(path.join(legacy, 'notes-data.json'))).toBe(true);
  });

  it('never overwrites an existing new data file', () => {
    const legacy = makeDir('legacy');
    const current = makeDir('current');
    fs.writeFileSync(path.join(legacy, 'notes-data.json'), 'legacy');
    fs.writeFileSync(path.join(current, 'notes-data.json'), 'current');

    expect(migrateLegacyData(current, legacy).migrated).toBe(false);
    expect(fs.readFileSync(path.join(current, 'notes-data.json'), 'utf8')).toBe('current');
  });
});

import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Reset de lokale SQLite-database van StudyBase.
 * Verwijdert data/app.db (+ WAL/SHM-journalen). De schema wordt automatisch
 * opnieuw aangemaakt bij de eerste start (getDb() voert de migratie uit).
 *
 * Gebruik: npm run db:reset
 * Alle accounts en studiegegevens gaan verloren. Exporteer eerst een back-up
 * als je ze nodig hebt (Instellingen -> Gegevens & back-up).
 */

const root = process.cwd();
const files = ['app.db', 'app.db-wal', 'app.db-shm'].map((f) => path.join(root, 'data', f));

let removed = 0;
for (const f of files) {
  if (existsSync(f)) {
    rmSync(f);
    console.log(`verwijderd: ${path.relative(root, f)}`);
    removed++;
  }
}
if (!removed) console.log('Geen databasebestanden gevonden — niets te verwijderen.');
console.log('Klaar. De schema wordt opnieuw aangemaakt bij de eerste start.');

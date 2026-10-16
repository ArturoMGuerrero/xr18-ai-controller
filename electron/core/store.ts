import fs from 'node:fs';
import path from 'node:path';

/** A JSON file in the app's data folder. Writes are atomic (temp file + rename). */
export class JsonStore<T> {
  private readonly file: string;

  constructor(dir: string, name: string, private readonly fallback: () => T) {
    this.file = path.join(dir, name);
  }

  read(): T {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[store] could not read ${this.file}, using defaults:`, (err as Error).message);
      }
      return this.fallback();
    }
  }

  write(data: T): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

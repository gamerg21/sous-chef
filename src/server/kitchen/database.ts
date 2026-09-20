import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import schema from './schema';
import { validate, type Shape } from './validation';
import type { GenericDatabaseWriter } from 'convex/server';
import type { DataModel } from './_generated/dataModel';

export const dataDirectory = () => resolve(process.env.SOUS_CHEF_DATA_DIR || './data');
const definitions = JSON.parse((schema as unknown as {export():string}).export()).tables as {tableName: string; documentType: Shape; indexes: {indexDescriptor: string; fields: string[]}[]}[];
const ident = (name: string) => { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Invalid identifier'); return `"${name}"`; };
const field = (name: string) => name === '_id' ? 'id' : name === '_creationTime' ? 'created' : `json_extract(data, '$.${name.replace(/[^a-zA-Z0-9_]/g, '')}')`;
const bind = (value: unknown): SQLInputValue => value === undefined || value === null ? null : typeof value === 'boolean' ? Number(value) : value as SQLInputValue;

export class KitchenDatabase {
  sql: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(filename: string) {
    this.sql = new DatabaseSync(filename);
    this.sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    for (const table of definitions) {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS ${ident(table.tableName)} (id TEXT PRIMARY KEY, created REAL NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)))`);
      for (const index of table.indexes) this.sql.exec(`CREATE INDEX IF NOT EXISTS ${ident(table.tableName + '_' + index.indexDescriptor)} ON ${ident(table.tableName)} (${[...index.fields.map(field), 'created'].join(',')})`);
    }
    this.sql.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_unique_email ON users(json_extract(data,'$.email')) WHERE json_extract(data,'$.email') IS NOT NULL;
      CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reset_tokens(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS login_limits(subject TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, mime TEXT NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES('schema_version','1');`);
  }
  // Serialize complete async transactions, including reads, on this connection.
  // Network actions execute outside this queue and open short transactions as needed.
  transaction<T>(fn: (db: GenericDatabaseWriter<DataModel>) => Promise<T>, writable = true): Promise<T> {
    const result = this.tail.then(async () => {
      this.sql.exec(writable ? 'BEGIN IMMEDIATE' : 'BEGIN');
      try { const result = await fn(this.adapter(writable)); this.sql.exec('COMMIT'); return result; }
      catch (error) { this.sql.exec('ROLLBACK'); throw error; }
    });
    this.tail = result.catch(() => {});
    return result;
  }
  adapter(writable = true): GenericDatabaseWriter<DataModel> {
    const sql = this.sql;
    const tableFor = (id: string) => {
      const table = definitions.find(t => id.startsWith(`${t.tableName}_`));
      if (!table) throw new Error('Invalid record ID');
      return table;
    };
    const read = (id: string) => {
      const table = tableFor(id);
      const row = sql.prepare(`SELECT * FROM ${ident(table.tableName)} WHERE id=?`).get(id);
      return row ? { ...JSON.parse(row.data as string), _id: row.id, _creationTime: row.created } : null;
    };
    const assertWrite = () => { if (!writable) throw new Error('Queries cannot write'); };
    const adapter = {
      get: async (id: string) => read(id),
      insert: async (tableName: string, value: Record<string, unknown>) => {
        assertWrite(); const table = definitions.find(t => t.tableName === tableName); if (!table) throw new Error('Unknown table');
        const clean = JSON.parse(JSON.stringify(value)); validate(table.documentType, clean);
        const id = `${tableName}_${randomUUID()}`;
        sql.prepare(`INSERT INTO ${ident(tableName)} VALUES(?,?,?)`).run(id, Date.now(), JSON.stringify(clean)); return id;
      },
      patch: async (id: string, patch: Record<string, unknown>) => {
        assertWrite(); const current = read(id); if (!current) throw new Error('Record not found');
        const {_id, _creationTime, ...data} = current; void _id; void _creationTime;
        Object.assign(data, patch); const clean = JSON.parse(JSON.stringify(data)); validate(tableFor(id).documentType, clean);
        sql.prepare(`UPDATE ${ident(tableFor(id).tableName)} SET data=? WHERE id=?`).run(JSON.stringify(clean), id);
      },
      delete: async (id: string) => { assertWrite(); sql.prepare(`DELETE FROM ${ident(tableFor(id).tableName)} WHERE id=?`).run(id); },
      query: (tableName: string) => {
        const table = definitions.find(t => t.tableName === tableName); if (!table) throw new Error('Unknown table');
        const clauses: string[] = []; const params: SQLInputValue[] = []; let orderFields = ['created']; let direction = 'ASC';
        const indexBuilder = { lt: (name: string, value: unknown) => { clauses.push(`${field(name)} < ?`); params.push(bind(value)); return indexBuilder; }, eq: (name: string, value: unknown) => { clauses.push(`${field(name)} IS ?`); params.push(bind(value)); return indexBuilder; } };
        const filterBuilder = { field: (name: string) => ({field: name}), eq: (left: {field: string}, right: unknown) => { clauses.push(`${field(left.field)} IS ?`); params.push(bind(right)); return true; } };
        const rows = (limit?: number) => {
          if (limit !== undefined && (!Number.isInteger(limit) || limit < 0 || limit > 100000)) throw new Error('Invalid limit');
          return sql.prepare(`SELECT * FROM ${ident(tableName)}${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''} ORDER BY ${orderFields.map(f => `${f} ${direction}`).join(',')}, rowid ${direction}${limit === undefined ? '' : ' LIMIT ?'}`).all(...params, ...(limit === undefined ? [] : [limit])).map(r => ({...JSON.parse(r.data as string), _id:r.id, _creationTime:r.created}));
        };
        const query = {
          withIndex: (name: string, range?: (q: typeof indexBuilder) => unknown) => {
            const index = table.indexes.find(i => i.indexDescriptor === name); if (!index) throw new Error(`Unknown index ${tableName}.${name}`);
            orderFields = [...index.fields.map(field), 'created']; range?.(indexBuilder); return query;
          },
          filter: (fn: (q: typeof filterBuilder) => unknown) => { fn(filterBuilder); return query; },
          order: (order: string) => { direction = order === 'desc' ? 'DESC' : 'ASC'; return query; },
          collect: async () => rows(), take: async (n: number) => rows(n), first: async () => rows(1)[0] ?? null,
          unique: async () => { const result = rows(2); if (result.length > 1) throw new Error('Expected unique record'); return result[0] ?? null; },
        }; return query;
      },
    };
    // Narrow implementation of the operations used by the ported kitchen services.
    return adapter as unknown as GenericDatabaseWriter<DataModel>;
  }
  close() { this.sql.close(); }
}
const globalStore = globalThis as typeof globalThis & { kitchenDatabase?: KitchenDatabase };
export function getDatabase(): KitchenDatabase {
  if (!globalStore.kitchenDatabase) {
    const directory = dataDirectory(); mkdirSync(directory, {recursive:true, mode:0o700});
    const keyFile = join(directory, 'secrets.key');
    if (!process.env.SECRETS_ENCRYPTION_KEY) {
      if (!existsSync(keyFile)) { try { writeFileSync(keyFile, randomBytes(32).toString('hex'), {mode:0o600, flag:'wx'}); } catch (e) { if (!existsSync(keyFile)) throw e; } }
      process.env.SECRETS_ENCRYPTION_KEY = readFileSync(keyFile, 'utf8').trim();
    }
    globalStore.kitchenDatabase = new KitchenDatabase(join(directory, 'kitchen.sqlite'));
    chmodSync(join(directory, 'kitchen.sqlite'), 0o600);
  }
  return globalStore.kitchenDatabase;
}

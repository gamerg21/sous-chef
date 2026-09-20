// Compatibility entry point: backups now cover the local SQLite kitchen.
process.argv.splice(2,0,'backup');
await import('./local-admin.mjs');

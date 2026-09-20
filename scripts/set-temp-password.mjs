// Local recovery compatibility command; new password must come from stdin.
process.argv.splice(2,0,'reset-password');
await import('./local-admin.mjs');

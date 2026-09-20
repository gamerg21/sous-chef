import { initialize } from '../src/server/kitchen/execute';
initialize().then(()=>console.log('SQLite schema and unit catalog ready.')).catch(error=>{console.error(error);process.exitCode=1;});

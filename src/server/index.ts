import { createApp } from './app.js';
import { getConfig } from './config.js';
const {PORT}=getConfig();
const server=createApp().listen(PORT,'0.0.0.0',()=>process.stdout.write(`Listening on :${PORT}
`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));

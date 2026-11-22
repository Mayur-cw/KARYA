import { createApp } from './app.js';
import { getConfig } from './config.js';
import { getDb } from './repository.js';
import { attachmentDirectory } from './storage.js';

const config = getConfig();
// Refuse readiness when the database or evidence directory cannot be opened.
const db = getDb();
attachmentDirectory();
const server = createApp().listen(config.PORT, '0.0.0.0', () => process.stdout.write(`Listening on :${config.PORT}\n`));
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); db.close(); process.exit(0); });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Explicit locations avoid silently changing databases when a mount is unavailable. */
export function dataDirectory(): string {
  const directory = process.env.DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.data');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}
export function attachmentDirectory(): string {
  const directory = process.env.ATTACHMENT_STORAGE_DIR || path.join(process.cwd(), '.karya_storage', 'attachments');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

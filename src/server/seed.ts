import type { DatabaseSync } from 'node:sqlite';
import { SEEDED_USERS } from './session.js';

export function seedDatabase(db: DatabaseSync): void {
  const insertUser = db.prepare(`
    INSERT INTO users (id, departmentId, name, email, role, active, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  for (const user of SEEDED_USERS) {
    insertUser.run(
      user.id,
      user.departmentId,
      user.name,
      user.email,
      user.role,
      user.active ? 1 : 0,
      user.createdAt
    );
  }
}

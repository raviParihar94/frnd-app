import { pool } from '../../config/db';

export interface UserRecord {
  id: string;
  phone: string;
  nickname: string | null;
  avatar_url: string | null;
  gender: string | null;
  languages: string[];
  token_balance: string; // BIGINT comes back as string from pg by default
  is_banned: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function findUserByPhone(phone: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>('SELECT * FROM users WHERE phone = $1', [phone]);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const { rows } = await pool.query<UserRecord>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createUser(phone: string): Promise<UserRecord> {
  const { rows } = await pool.query<UserRecord>(
    `INSERT INTO users (phone) VALUES ($1) RETURNING *`,
    [phone]
  );
  return rows[0];
}

export async function findOrCreateUserByPhone(phone: string): Promise<{
  user: UserRecord;
  isNewUser: boolean;
}> {
  const existing = await findUserByPhone(phone);
  if (existing) {
    return { user: existing, isNewUser: false };
  }
  const created = await createUser(phone);
  return { user: created, isNewUser: true };
}

export interface ProfileUpdate {
  nickname?: string;
  avatarUrl?: string;
  gender?: string;
  languages?: string[];
}

export async function updateUserProfile(
  userId: string,
  update: ProfileUpdate
): Promise<UserRecord | null> {
  // Build the SET clause dynamically so a partial update (e.g. just the
  // nickname) doesn't overwrite untouched columns with NULL.
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (update.nickname !== undefined) {
    fields.push(`nickname = $${i++}`);
    values.push(update.nickname);
  }
  if (update.avatarUrl !== undefined) {
    fields.push(`avatar_url = $${i++}`);
    values.push(update.avatarUrl);
  }
  if (update.gender !== undefined) {
    fields.push(`gender = $${i++}`);
    values.push(update.gender);
  }
  if (update.languages !== undefined) {
    fields.push(`languages = $${i++}`);
    values.push(update.languages);
  }

  if (fields.length === 0) {
    return findUserById(userId);
  }

  fields.push(`updated_at = now()`);
  values.push(userId);

  const { rows } = await pool.query<UserRecord>(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

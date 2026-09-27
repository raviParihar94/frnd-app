import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from '../../config/db';
import { env } from '../../config/env';
import { ApiError } from '../../utils/asyncHandler';
import { getSmsProvider } from './smsProvider';

const HASH_ROUNDS = 10;

function generateNumericOtp(length: number): string {
  // crypto.randomInt avoids Math.random()'s predictability for a security-sensitive code.
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return crypto.randomInt(min, max + 1).toString();
}

export async function requestOtp(phone: string): Promise<void> {
  // Cooldown: block rapid repeat requests for the same phone number.
  const { rows: recent } = await pool.query<{ created_at: Date }>(
    `SELECT created_at FROM otp_requests
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (recent.length > 0) {
    const secondsSinceLast = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
    if (secondsSinceLast < env.OTP_REQUEST_COOLDOWN_SECONDS) {
      const wait = Math.ceil(env.OTP_REQUEST_COOLDOWN_SECONDS - secondsSinceLast);
      throw new ApiError(429, `Please wait ${wait}s before requesting another OTP`);
    }
  }

  const otp = generateNumericOtp(env.OTP_LENGTH);
  const otpHash = await bcrypt.hash(otp, HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);

  await pool.query(
    `INSERT INTO otp_requests (phone, otp_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [phone, otpHash, expiresAt]
  );

  await getSmsProvider().sendOtp(phone, otp);
}

export async function verifyOtp(phone: string, otp: string): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    otp_hash: string;
    expires_at: Date;
    attempt_count: number;
    consumed: boolean;
  }>(
    `SELECT id, otp_hash, expires_at, attempt_count, consumed
     FROM otp_requests
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone]
  );

  if (rows.length === 0) {
    throw new ApiError(400, 'No OTP was requested for this phone number');
  }

  const record = rows[0];

  if (record.consumed) {
    throw new ApiError(400, 'This OTP has already been used. Please request a new one.');
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new ApiError(400, 'OTP has expired. Please request a new one.');
  }

  if (record.attempt_count >= env.OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many incorrect attempts. Please request a new OTP.');
  }

  const isMatch = await bcrypt.compare(otp, record.otp_hash);

  if (!isMatch) {
    await pool.query(`UPDATE otp_requests SET attempt_count = attempt_count + 1 WHERE id = $1`, [
      record.id,
    ]);
    const remaining = env.OTP_MAX_ATTEMPTS - (record.attempt_count + 1);
    throw new ApiError(400, `Incorrect OTP. ${Math.max(remaining, 0)} attempt(s) remaining.`);
  }

  await pool.query(`UPDATE otp_requests SET consumed = TRUE WHERE id = $1`, [record.id]);
}

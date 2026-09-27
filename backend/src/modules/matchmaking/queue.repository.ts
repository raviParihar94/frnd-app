import { redis } from '../../config/redis';
import { CallType, Language, QueueEntry } from './types';

function queueKey(callType: CallType, language: Language): string {
  return `queue:${callType}:${language}`;
}

// Tracks which queue (if any) a user is currently sitting in, and the exact
// serialized entry we pushed — needed so LEAVE_QUEUE can LREM the precise
// value back out of the list (Redis lists remove by value, not index).
function membershipKey(userId: string): string {
  return `queue_membership:${userId}`;
}

function serializeEntry(entry: QueueEntry): string {
  return JSON.stringify(entry);
}

/**
 * Atomically pops two entries from a queue, or does nothing if fewer than
 * two are waiting. Implemented as a Lua script so this is safe even with
 * multiple concurrent JOIN_QUEUE calls racing to trigger a match — Redis
 * runs the whole script as a single atomic operation.
 */
const DEQUEUE_PAIR_SCRIPT = `
local len = redis.call('LLEN', KEYS[1])
if len < 2 then
  return nil
end
local a = redis.call('LPOP', KEYS[1])
local b = redis.call('LPOP', KEYS[1])
return {a, b}
`;

export async function enqueue(
  callType: CallType,
  language: Language,
  entry: QueueEntry
): Promise<void> {
  const key = queueKey(callType, language);
  const value = serializeEntry(entry);

  await redis
    .multi()
    .rpush(key, value)
    .set(membershipKey(entry.userId), JSON.stringify({ key, value, callType, language }))
    .exec();
}

/**
 * Idempotent: removes the user from whichever queue they're currently in, if
 * any. Safe to call even if the user isn't queued at all.
 */
export async function removeFromQueue(userId: string): Promise<void> {
  const raw = await redis.get(membershipKey(userId));
  if (!raw) return;

  const { key, value } = JSON.parse(raw) as { key: string; value: string };
  await redis.multi().lrem(key, 1, value).del(membershipKey(userId)).exec();
}

export async function isUserQueued(userId: string): Promise<boolean> {
  const raw = await redis.get(membershipKey(userId));
  return raw !== null;
}

export async function dequeuePair(
  callType: CallType,
  language: Language
): Promise<[QueueEntry, QueueEntry] | null> {
  const key = queueKey(callType, language);
  const result = (await redis.eval(DEQUEUE_PAIR_SCRIPT, 1, key)) as [string, string] | null;

  if (!result) return null;

  const [a, b] = result;
  const entryA = JSON.parse(a) as QueueEntry;
  const entryB = JSON.parse(b) as QueueEntry;

  // Both entries came from the same matched queue, so their membership
  // records are now stale — clear them regardless of exact key/value (the
  // list entry is already gone; this just tidies the lookup-by-userId side).
  await redis.del(membershipKey(entryA.userId), membershipKey(entryB.userId));

  return [entryA, entryB];
}

export async function getQueueLength(callType: CallType, language: Language): Promise<number> {
  return redis.llen(queueKey(callType, language));
}

import { getEvents } from "./calendar";

export type Slot = { start: string; end: string };

type Busy = { start: Date; end: Date };

/**
 * Find N open slots of the requested duration across the given user IDs.
 * Uses events.list (calendar.events scope) instead of freebusy.query
 * because freebusy requires the broader calendar.readonly scope.
 *
 * Only searches during 09:00-18:00 local time Mon-Fri.
 */
export async function findCommonSlots(
  userIds: string[],
  args: {
    durationMinutes: number;
    daysAhead?: number;
    maxSlots?: number;
    workdayStartHour?: number;
    workdayEndHour?: number;
    tzOffsetHours?: number; // e.g. 7 for WIB
  },
): Promise<Slot[]> {
  const duration = args.durationMinutes;
  const days = args.daysAhead ?? 7;
  const maxSlots = args.maxSlots ?? 5;
  const startHour = args.workdayStartHour ?? 9;
  const endHour = args.workdayEndHour ?? 18;
  const tz = args.tzOffsetHours ?? 7;

  const now = new Date();
  const searchEnd = new Date(now);
  searchEnd.setDate(searchEnd.getDate() + days);

  // Fetch each user's events in the window and treat each event as a "busy" block
  const allEvents = await Promise.all(
    userIds.map((uid) => getEvents(uid, now, searchEnd)),
  );
  const busy: Busy[] = allEvents
    .flat()
    .map((e) => ({ start: new Date(e.start), end: new Date(e.end) }))
    .filter((b) => !isNaN(b.start.getTime()) && !isNaN(b.end.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: Slot[] = [];
  const slotMs = duration * 60_000;

  // Iterate day by day, slot by slot in 30-min increments
  for (let d = 0; d < days && slots.length < maxSlots; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const dayOfWeek = day.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekend

    // Workday window in local tz → UTC
    const startLocal = new Date(day);
    startLocal.setUTCHours(startHour - tz, 0, 0, 0);
    const endLocal = new Date(day);
    endLocal.setUTCHours(endHour - tz, 0, 0, 0);

    for (
      let t = Math.max(startLocal.getTime(), now.getTime());
      t + slotMs <= endLocal.getTime() && slots.length < maxSlots;
      t += 30 * 60_000
    ) {
      const slotStart = new Date(t);
      const slotEnd = new Date(t + slotMs);
      const conflicts = busy.some(
        (b) => b.start < slotEnd && b.end > slotStart,
      );
      if (!conflicts) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }
  }

  return slots;
}

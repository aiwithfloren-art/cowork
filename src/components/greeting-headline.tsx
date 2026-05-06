"use client";

import { useEffect, useState } from "react";

/**
 * Client-side greeting + emoji that uses the visitor's local hour
 * instead of the server's UTC time. Without this, a Jakarta user
 * logging in at 9pm local would see "Good afternoon" because the
 * server (UTC) thinks it's 14:00.
 *
 * SSR fallback: emit the user's first name only (no greeting verb)
 * so we don't mismatch the localized branch on hydration. Once
 * mounted, we read Date().getHours() and pick morning/afternoon/
 * evening from the user's actual clock.
 */
export function GreetingHeadline({
  firstName,
  morning,
  afternoon,
  evening,
}: {
  firstName: string;
  morning: string;
  afternoon: string;
  evening: string;
}) {
  const [text, setText] = useState<string>(`${firstName}`);

  useEffect(() => {
    const h = new Date().getHours();
    const verb = h < 12 ? morning : h < 18 ? afternoon : evening;
    const emoji = h < 12 ? "☀️" : h < 18 ? "🌤" : "🌙";
    setText(`${verb}, ${firstName} ${emoji}`);
  }, [firstName, morning, afternoon, evening]);

  return <>{text}</>;
}

import { CalendarClock } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { SetupNotice } from "@/components/SetupNotice";
import { listUpcomingEvents } from "@/db/repository";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requireUser();
  let events: Awaited<ReturnType<typeof listUpcomingEvents>> = [];
  let error: string | null = null;
  try {
    events = await listUpcomingEvents(60);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load events.";
  }

  return (
    <main className="mobile-shell">
      <AppHeader eyebrow="Forward view" title="Calendar" />
      {error ? <SetupNotice message={error} /> : null}
      <div className="space-y-3">
        {events.length > 0 ? (
          events.map((event) => (
            <section key={event.id} className="glass-card rounded-[28px] p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-limewash text-forest">
                  <CalendarClock size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink/45">
                    {event.eventDate ? event.eventDate.toLocaleDateString() : "Date unknown"} · {event.eventType}
                  </p>
                  <h2 className="mt-1 text-lg font-black tracking-[-0.03em]">{event.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/60">{event.summary}</p>
                </div>
              </div>
            </section>
          ))
        ) : (
          <section className="glass-card rounded-[30px] p-5 text-sm leading-6 text-ink/65">
            No upcoming events yet. The daily digest will populate this after sources are configured.
          </section>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

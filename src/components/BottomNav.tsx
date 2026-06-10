import { BarChart3, CalendarDays, Radar, Settings, Star } from "lucide-react";
import Link from "next/link";

const items = [
  { href: "/", label: "Today", icon: Radar },
  { href: "/watchlist", label: "Watchlist", icon: Star },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] px-4 pb-[calc(14px+env(safe-area-inset-bottom))]">
      <div className="glass-card grid grid-cols-4 rounded-[28px] p-2">
        {items.map((item) => {
          const Icon = item.icon === Radar ? BarChart3 : item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold text-forest/70 transition hover:bg-limewash hover:text-forest"
            >
              <Icon size={19} strokeWidth={2.2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

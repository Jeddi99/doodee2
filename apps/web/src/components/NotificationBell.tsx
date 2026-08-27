import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markNotificationsRead } from "../lib/api";
import { useLocale } from "../useLocale";

/**
 * The in-app half of the notification system.
 *
 * Renewal reminders reach people three ways — here, by email and by push — and all three are
 * deliveries of one server-side row, so a user who reads it in the app does not get chased by
 * the other two. Opening the panel marks everything read, which is what makes that true.
 *
 * There is no polling. A renewal reminder is a once-a-day event; refetching every thirty
 * seconds to catch it sooner would cost far more than it is worth, so the query refreshes when
 * the window regains focus and otherwise sits still.
 */

const COPY = {
  th: { title: "การแจ้งเตือน", empty: "ยังไม่มีการแจ้งเตือน", label: "การแจ้งเตือน" },
  en: { title: "Notifications", empty: "Nothing yet", label: "Notifications" },
};

// Where each kind takes you when tapped. A notification that cannot be acted on is a nag.
const DESTINATIONS: Record<string, string> = {
  renewal_due: "/pricing",
  renewal_lapsed: "/pricing",
  referral_reward: "/referral",
  referral_joined: "/referral",
  coupon_granted: "/pricing",
  order_paid: "/pricing",
  withdrawal_paid: "/referral",
  withdrawal_rejected: "/referral",
};

type Item = {
  id: number;
  kind: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { locale } = useLocale();
  const copy = COPY[locale === "en" ? "en" : "th"];
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    // The bell is mounted on every dashboard route, so with the default staleTime it refetched
    // on each navigation. Notifications are renewal reminders and referral credits — minutes-old
    // is fine, and markRead already invalidates this key when the user actually reads them.
    staleTime: 5 * 60_000,
  });

  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // The bell count also rides on the session payload, so the header agrees with the panel.
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });

  const unread = Number(notifications.data?.unread || 0);
  const items: Item[] = notifications.data?.results ?? [];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markRead.mutate();
  };

  return (
    <div className="app-bell">
      <button
        type="button"
        onClick={toggle}
        aria-label={copy.label}
        aria-expanded={open}
        className={unread > 0 ? "has-unread" : ""}
      >
        <Bell />
        {unread > 0 && <span className="app-bell__count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="app-bell__panel">
          <strong>{copy.title}</strong>
          {items.length === 0 ? (
            <p className="app-bell__empty">{copy.empty}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li className={item.read ? "" : "is-unread"} key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      const to = DESTINATIONS[item.kind];
                      if (to) navigate(to);
                    }}
                  >
                    <strong>{item.title}</strong>
                    {item.body && <span>{item.body}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

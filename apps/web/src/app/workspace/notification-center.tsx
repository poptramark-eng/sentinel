"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";

type Item = {
  id: string; subject: string; textBody: string;
  status: "QUEUED" | "PROCESSING" | "SENT" | "DELIVERED" | "FAILED";
  createdAt: string; readAt: string | null;
};
type Feed = { items: Item[]; unreadCount: number };

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await apiRequest("/notifications?limit=25");
      if (!response.ok) throw new Error();
      setFeed(await response.json() as Feed);
    } catch { setError("Notifications could not be loaded. Please retry."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { queueMicrotask(() => { void refresh(); }); }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function markRead(id: string) {
    const response = await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
    if (!response.ok) { setError("Could not update this notification."); return; }
    setFeed((current) => {
      const target = current.items.find((item) => item.id === id);
      if (!target || target.readAt) return current;
      return {
        ...current,
        items: current.items.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item),
        unreadCount: Math.max(0, current.unreadCount - 1),
      };
    });
  }

  async function markAllRead() {
    const response = await apiRequest("/notifications/read-all", { method: "POST" });
    if (!response.ok) { setError("Could not update notifications."); return; }
    const readAt = new Date().toISOString();
    setFeed((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
    }));
  }

  const statusLabel = (status: Item["status"]) => ({
    QUEUED: "Email queued", PROCESSING: "Sending email", SENT: "Email sent",
    DELIVERED: "Email delivered", FAILED: "Email failed",
  })[status];

  return (
    <div className="relative" ref={root}>
      <button type="button" onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications, ${feed.unreadCount} unread`} aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-xl border border-[#dbe3ee] bg-white text-[#52647d] hover:bg-[#f7f9fc]">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {feed.unreadCount > 0 ? <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#c43d4b] px-1 text-center text-[10px] font-bold leading-5 text-white">{feed.unreadCount > 99 ? "99+" : feed.unreadCount}</span> : null}
      </button>
      {open ? <section aria-label="Notifications" className="absolute right-0 top-[calc(100%+12px)] z-50 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-[#dbe3ee] bg-white shadow-[0_18px_55px_rgba(23,43,77,0.16)]">
        <header className="flex items-center justify-between border-b border-[#edf1f6] px-5 py-4">
          <div><h2 className="text-sm font-semibold text-[#172b4d]">Notifications</h2><p className="mt-1 text-xs text-[#718096]">{feed.unreadCount} unread</p></div>
          <div className="flex gap-3">
            <button type="button" onClick={() => void refresh()} className="text-xs font-semibold text-[#52647d] hover:text-[#2457c5]">Refresh</button>
            {feed.unreadCount > 0 ? <button type="button" onClick={() => void markAllRead()} className="text-xs font-semibold text-[#2457c5]">Mark all read</button> : null}
          </div>
        </header>
        <div className="max-h-[min(65vh,520px)] overflow-y-auto">
          {loading && feed.items.length === 0 ? <p className="px-5 py-10 text-center text-sm text-[#718096]">Loading notifications…</p> : null}
          {error ? <p role="alert" className="mx-4 mt-4 rounded-xl bg-[#fff5f4] px-3 py-2 text-xs text-[#a33b3b]">{error}</p> : null}
          {!loading && feed.items.length === 0 && !error ? <div className="px-6 py-10 text-center"><p className="text-sm font-semibold text-[#263b59]">You’re all caught up</p><p className="mt-1 text-xs text-[#718096]">Important updates will appear here.</p></div> : null}
          {feed.items.map((item) => <article key={item.id} className={`border-b border-[#f0f3f7] px-5 py-4 last:border-0 ${item.readAt ? "bg-white" : "bg-[#f7faff]"}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-[#2457c5]"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold leading-5 text-[#263b59]">{item.subject}</h3><time className="shrink-0 text-[10px] text-[#8290a4]">{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#64748b]">{item.textBody}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${item.status === "FAILED" ? "bg-[#fff0ef] text-[#a33b3b]" : "bg-[#eef3fa] text-[#5c6d84]"}`}>{statusLabel(item.status)}</span>
                  {!item.readAt ? <button type="button" onClick={() => void markRead(item.id)} className="text-xs font-semibold text-[#2457c5] hover:underline">Mark read</button> : <span className="text-[10px] text-[#91a0b3]">Read</span>}
                </div>
              </div>
            </div>
          </article>)}
        </div>
      </section> : null}
    </div>
  );
}
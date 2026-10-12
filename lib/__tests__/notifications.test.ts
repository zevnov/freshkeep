import { buildDigestBody, countDigestBuckets } from "@/lib/notifications";
import type { ItemRow, NotificationPrefs } from "@/types";
import { makeItem } from "./itemFixture";
import { DEFAULT_NOTIFICATION_PREFS } from "@/types";

const item = makeItem;

describe("countDigestBuckets", () => {
  const prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS, notificationStyle: "digest" };

  it("counts soon, today, and overdue for a fixed calendar day", () => {
    const today = "2026-04-08";
    const items: ItemRow[] = [
      item({ id: "1", name: "Soon", spoil_on: "2026-04-11" }),
      item({ id: "2", name: "Today", spoil_on: "2026-04-08" }),
      item({ id: "3", name: "Overdue", spoil_on: "2026-04-05" }),
    ];
    const counts = countDigestBuckets(items, prefs, today);
    expect(counts).toEqual({ soon: 1, today: 1, overdue: 1 });
  });

  it("skips inactive and remind_me off", () => {
    const items: ItemRow[] = [
      item({ id: "1", name: "X", spoil_on: "2026-04-08", status: "consumed" }),
      item({ id: "2", name: "Y", spoil_on: "2026-04-08", remind_me: false }),
    ];
    const counts = countDigestBuckets(items, prefs, "2026-04-08");
    expect(counts).toEqual({ soon: 0, today: 0, overdue: 0 });
  });

  it("skips mine when includeMine false", () => {
    const items: ItemRow[] = [item({ id: "1", name: "M", spoil_on: "2026-04-08", scope: "mine" })];
    const p = { ...prefs, includeMine: false };
    expect(countDigestBuckets(items, p, "2026-04-08")).toEqual({ soon: 0, today: 0, overdue: 0 });
  });
});

describe("buildDigestBody", () => {
  const prefs: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };

  it("joins non-zero parts", () => {
    expect(buildDigestBody(prefs, { soon: 2, today: 1, overdue: 0 })).toBe("2 use soon · 1 due today");
  });

  it("returns calm message when empty", () => {
    expect(buildDigestBody(prefs, { soon: 0, today: 0, overdue: 0 })).toBe(
      "Nothing urgent in your lists right now."
    );
  });

  it("respects toggles", () => {
    const p = { ...prefs, notifySoon: false, notifyToday: true, notifyOverdue: true };
    expect(buildDigestBody(p, { soon: 2, today: 1, overdue: 1 })).toBe("1 due today · 1 overdue");
  });
});

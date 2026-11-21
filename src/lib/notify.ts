import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Emails go through Resend's REST API (no SDK needed for one endpoint). A missing key or a
// failed send never breaks the action that triggered it: callers get `false` and move on.
export async function sendEmail(to: string, subject: string, html: string, idempotencyKey?: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("ro-RO", { dateStyle: "long", timeZone: "Europe/Bucharest" }).format(new Date(iso));

type TaskMail = { id: string; title: string; deadline: string | null };

// Brand colours from globals.css (primary purple, warning amber, destructive red). Inline styles
// and tables only: mail clients ignore <style> blocks and modern layout.
const TONES = {
  assigned: { color: "#7c3aed", label: "Sarcină nouă" },
  due_soon: { color: "#f59e0b", label: "Termen apropiat" },
  overdue: { color: "#ef4444", label: "Întârziată" },
} as const;

function taskEmail(tone: keyof typeof TONES, intro: string, task: TaskMail) {
  const { color, label } = TONES[tone];
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  const link = `${origin}/tasks/${task.id}`;
  const font = "Inter,Segoe UI,Helvetica,Arial,sans-serif";
  const deadline = task.deadline
    ? `<p style="margin:0 0 24px;font-size:14px;color:#6b7280">Termen: <b style="color:#0f172a">${fmtDate(task.deadline)}</b></p>`
    : "";
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#1a0b2e;padding:14px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td><img src="${origin}/logos/logo-dark.png" width="76" height="39" alt="ThinkUp" style="display:block;border:0"></td>
<td style="padding-left:12px;font-family:Georgia,'Playfair Display',serif;font-size:20px;color:#a78bfa">Intranet</td>
</tr></table></td></tr>
<tr><td style="height:4px;background:${color};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${color}">${label}</p>
<h1 style="margin:0 0 12px;font-family:Georgia,'Playfair Display',serif;font-size:24px;line-height:1.3;color:#0f172a">${esc(task.title)}</h1>
<p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#334155">${intro}</p>
${deadline}
<a href="${link}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">Deschide sarcina</a>
</td></tr>
<tr><td style="padding:16px 28px;background:#faf5ff;font-size:12px;color:#6b7280">ThinkUp Academy · mesaj automat din intranet</td></tr>
</table></td></tr></table></body></html>`;
}

// Immediate email when someone is assigned a task (PRD 5.3). Recipient is looked up with the
// secret key because mentors cannot read other people's profile rows.
export async function notifyAssigned(task: TaskMail, assigneeId: string) {
  const { data: p } = await createAdminClient()
    .from("profiles")
    .select("email")
    .eq("clerk_id", assigneeId)
    .eq("is_active", true)
    .maybeSingle();
  if (!p) return;
  await sendEmail(p.email, `Sarcină nouă: ${task.title}`, taskEmail("assigned", "Ți-a fost atribuită o sarcină nouă.", task));
}

// Daily job: one email per task entering the 48h window and one when it becomes overdue.
// The claim row (task_id, kind) is inserted BEFORE sending (primary key = lock), stamped with
// sent_at on success and removed on failure so tomorrow's run retries. A reassigned task keeps
// its claim: the new owner is not reminded again for the same stage.
export async function sendDueReminders() {
  const db = createAdminClient();
  const { data: tasks, error } = await db
    .from("tasks_with_alert")
    .select("id, title, deadline, alert, assignee_id")
    .in("alert", ["due_soon", "overdue"])
    .not("assignee_id", "is", null);
  if (error) throw error;

  let sent = 0;
  for (const t of tasks ?? []) {
    const kind = t.alert as "due_soon" | "overdue";
    const { data: claimed } = await db
      .from("task_notifications")
      .upsert({ task_id: t.id, kind }, { onConflict: "task_id,kind", ignoreDuplicates: true })
      .select("task_id");
    if (!claimed?.length) continue; // already sent

    const { data: p } = await db.from("profiles").select("email").eq("clerk_id", t.assignee_id).eq("is_active", true).maybeSingle();
    const intro = kind === "overdue" ? "Această sarcină a depășit termenul." : "Această sarcină are termen în următoarele 48 de ore.";
    const subject = `${kind === "overdue" ? "Întârziată" : "Termen apropiat"}: ${t.title}`;
    const ok = p ? await sendEmail(p.email, subject, taskEmail(kind, intro, t), `${t.id}-${kind}`) : false;
    if (ok) {
      sent++;
      await db.from("task_notifications").update({ sent_at: new Date().toISOString() }).match({ task_id: t.id, kind });
    } else await db.from("task_notifications").delete().match({ task_id: t.id, kind });
  }
  return { checked: tasks?.length ?? 0, sent };
}

const isoWeekStart = (d = new Date()) => {
  const ro = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  ro.setHours(0, 0, 0, 0);
  ro.setDate(ro.getDate() - ((ro.getDay() + 6) % 7));
  return ro.toISOString().slice(0, 10);
};

const gamificationEmail = (title: string, intro: string) => {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  const font = "Inter,Segoe UI,Helvetica,Arial,sans-serif";
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px 12px;background:#f8fafc;font-family:${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:white;border-radius:12px;border:1px solid #e5e7eb">
<tr><td style="background:#1a0b2e;padding:14px 28px"><strong style="color:#a78bfa;font-size:20px">ThinkUp Intranet</strong></td></tr>
<tr><td style="height:4px;background:#7c3aed"></td></tr>
<tr><td style="padding:28px"><h1 style="margin:0 0 12px;font-size:24px;color:#0f172a">${esc(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#334155">${intro}</p>
<a href="${origin}/platform/leaderboard" style="display:inline-block;background:#7c3aed;color:white;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px">Deschide clasamentul</a>
</td></tr></table></td></tr></table></body></html>`;
};

export async function sendGamificationNotifications() {
  const db = createAdminClient();
  const week = isoWeekStart();
  const sent: Record<"streak_risk" | "new_badge" | "rank_change", number> = {
    streak_risk: 0,
    new_badge: 0,
    rank_change: 0,
  };
  const roDay = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Bucharest", weekday: "short" }).format(new Date());

  if (roDay === "Thu" || roDay === "Fri") {
    const monday = `${week}T00:00:00+03:00`;
    const { data: ambassadors } = await db
      .from("ambassadors")
      .select("profile_id")
      .eq("active", true)
      .not("profile_id", "is", null);
    for (const a of ambassadors ?? []) {
      if (!a.profile_id) continue;
      const { data: activity } = await db
        .from("xp_events")
        .select("id")
        .eq("profile_id", a.profile_id)
        .gte("created_at", monday)
        .limit(1);
      if (activity?.length) continue;
      const { data: claimed } = await db
        .from("gamification_notification_claims")
        .upsert({ profile_id: a.profile_id, kind: "streak_risk", week_start: week }, { onConflict: "profile_id,kind,week_start", ignoreDuplicates: true })
        .select("profile_id");
      if (!claimed?.length) continue;
      const { data: p } = await db.from("profiles").select("email").eq("clerk_id", a.profile_id).eq("is_active", true).maybeSingle();
      const ok = p ? await sendEmail(p.email, "Streak în pericol", gamificationEmail("Streak în pericol", "Săptămâna ta este goală. Fă o activitate pentru a-ți păstra ritmul."), `${a.profile_id}-streak-${week}`) : false;
      if (!ok) await db.from("gamification_notification_claims").delete().match({ profile_id: a.profile_id, kind: "streak_risk", week_start: week });
      else sent.streak_risk++;
    }
  }

  const { data: badges } = await db
    .from("user_badges")
    .select("profile_id,badge_key,earned_at")
    .gte("earned_at", `${week}T00:00:00+03:00`);
  for (const badge of badges ?? []) {
    const { data: claimed } = await db
      .from("gamification_notification_claims")
      .upsert({ profile_id: badge.profile_id, kind: "new_badge", week_start: week }, { onConflict: "profile_id,kind,week_start", ignoreDuplicates: true })
      .select("profile_id");
    if (!claimed?.length) continue;
    const { data: p } = await db.from("profiles").select("email").eq("clerk_id", badge.profile_id).eq("is_active", true).maybeSingle();
    const ok = p ? await sendEmail(p.email, "Ai câștigat un badge nou!", gamificationEmail("Badge nou", `Felicitări! Ai primit badge-ul „${esc(badge.badge_key)}”.`), `${badge.profile_id}-badge-${week}-${badge.badge_key}`) : false;
    if (!ok) await db.from("gamification_notification_claims").delete().match({ profile_id: badge.profile_id, kind: "new_badge", week_start: week });
    else sent.new_badge++;
  }

  // Rank change: compare this week's school rank with the previous snapshot.
  const previousWeek = new Date(`${week}T12:00:00Z`);
  previousWeek.setUTCDate(previousWeek.getUTCDate() - 7);
  const previous = previousWeek.toISOString().slice(0, 10);
  const { data: ranked } = await db
    .from("ambassadors")
    .select("profile_id,schools(name,county_code,county:counties(zone_id))")
    .eq("active", true)
    .not("profile_id", "is", null);
  const { data: events } = await db
    .from("xp_events")
    .select("profile_id,xp")
    .gte("created_at", `${week}T00:00:00+03:00`);
  const xpByProfile = new Map<string, number>();
  for (const event of events ?? []) xpByProfile.set(event.profile_id, (xpByProfile.get(event.profile_id) ?? 0) + event.xp);
  const schoolGroups = new Map<string, { profileId: string; xp: number }[]>();
  for (const row of ranked ?? []) {
    const profileId = row.profile_id as string;
    if (!profileId) continue;
    const school = (row as any).schools;
    const schoolName = school?.name ?? "";
    const group = schoolGroups.get(schoolName) ?? [];
    group.push({ profileId, xp: xpByProfile.get(profileId) ?? 0 });
    schoolGroups.set(schoolName, group);
  }
  for (const group of schoolGroups.values()) {
    const ordered = [...group].sort((a, b) => b.xp - a.xp || a.profileId.localeCompare(b.profileId));
    for (let i = 0; i < ordered.length; i++) {
      const student = ordered[i];
      const rank = i + 1;
      const { data: old } = await db
        .from("gamification_rank_snapshots")
        .select("rank")
        .match({ profile_id: student.profileId, scope: "school", period: "week", snapshot_week: previous })
        .maybeSingle();
      await db.from("gamification_rank_snapshots").upsert({
        profile_id: student.profileId, scope: "school", period: "week", rank, snapshot_week: week,
      }, { onConflict: "profile_id,scope,period,snapshot_week" });
      if (!old || old.rank === rank) continue;
      const { data: claimed } = await db
        .from("gamification_notification_claims")
        .upsert({ profile_id: student.profileId, kind: "rank_change", week_start: week }, { onConflict: "profile_id,kind,week_start", ignoreDuplicates: true })
        .select("profile_id");
      if (!claimed?.length) continue;
      const { data: p } = await db.from("profiles").select("email").eq("clerk_id", student.profileId).eq("is_active", true).maybeSingle();
      const ok = p ? await sendEmail(p.email, "S-a schimbat locul în clasament", gamificationEmail("Schimbare în clasament", `Acum ai locul ${rank} în clasamentul școlii.`), `${student.profileId}-rank-${week}`) : false;
      if (!ok) await db.from("gamification_notification_claims").delete().match({ profile_id: student.profileId, kind: "rank_change", week_start: week });
      else sent.rank_change++;
    }
  }
  return sent;
}

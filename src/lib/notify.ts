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

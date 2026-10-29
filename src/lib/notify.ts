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

function taskEmail(intro: string, task: TaskMail) {
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/tasks/${task.id}`;
  const deadline = task.deadline ? `<p>Termen: <b>${fmtDate(task.deadline)}</b></p>` : "";
  return `<p>${intro}</p><p><b>${esc(task.title)}</b></p>${deadline}<p><a href="${link}">Deschide sarcina</a></p>`;
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
  await sendEmail(p.email, `Sarcină nouă: ${task.title}`, taskEmail("Ți-a fost atribuită o sarcină nouă.", task));
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
    const ok = p ? await sendEmail(p.email, subject, taskEmail(intro, t), `${t.id}-${kind}`) : false;
    if (ok) {
      sent++;
      await db.from("task_notifications").update({ sent_at: new Date().toISOString() }).match({ task_id: t.id, kind });
    } else await db.from("task_notifications").delete().match({ task_id: t.id, kind });
  }
  return { checked: tasks?.length ?? 0, sent };
}

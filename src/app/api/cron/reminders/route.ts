import { sendDueReminders, sendGamificationNotifications } from "@/lib/notify";

// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` (see vercel.json).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const due = await sendDueReminders();
  const gamification = await sendGamificationNotifications();
  return Response.json({ ...due, gamification });
}

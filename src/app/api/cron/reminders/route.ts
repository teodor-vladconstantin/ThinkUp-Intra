import { sendDueReminders } from "@/lib/notify";

// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` (see vercel.json).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await sendDueReminders());
}

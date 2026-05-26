import { runPollingCycle } from "@/lib/poller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const pollSecret = process.env.POLL_SECRET;

  if (!pollSecret) {
    return Response.json({ error: "POLL_SECRET is not configured." }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${pollSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runPollingCycle();
  return Response.json(summary);
}

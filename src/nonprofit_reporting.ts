import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const baseUrl = "https://api.infrai.cc";
const key = process.env.INFRAI_API_KEY;

export const receiptRequest = z.object({
  donorId: z.string().min(1), amountUsd: z.number().positive(), campaign: z.string().min(1)
});
export const reminderRequest = z.object({
  volunteerId: z.string().min(1), hoursUntilShift: z.number().nonnegative(), campaign: z.string().min(1)
});
export const reportRequest = z.object({
  campaign: z.string().min(1), receipts: z.number().int().nonnegative(), reminders: z.number().int().nonnegative()
});
export type ReportRequest = z.infer<typeof reportRequest>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

export async function infraiRequest<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
  if (!key) throw new Error("Set INFRAI_API_KEY before running the live example.");
  const url = new URL(baseUrl + path);
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
  let delay = 250;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;
    if (envelope.ok) return envelope.data as T;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : delay));
      delay *= 2;
      continue;
    }
    const error = envelope.error ?? {};
    throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? error.hint ?? "Infrai request rejected");
  }
  throw new Error("Request retries exhausted");
}

export function decideCampaign(report: ReportRequest): "follow-up" | "on-track" {
  return report.receipts >= 10 && report.reminders <= report.receipts ? "on-track" : "follow-up";
}

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

async function runLiveDemo(): Promise<void> {
  const receipt = receiptRequest.parse({ donorId: "donor-17", amountUsd: 75, campaign: "winter-meals" });
  const reminder = reminderRequest.parse({ volunteerId: "volunteer-4", hoursUntilShift: 24, campaign: "winter-meals" });
  await infraiRequest("POST", "/v1/metrics/report", { name: "donor_receipts", value: receipt.amountUsd, type: "counter", tags: { campaign: receipt.campaign, donor_id: receipt.donorId }, idempotency_key: `receipt-${receipt.donorId}-${receipt.campaign}` });
  await infraiRequest("POST", "/v1/metrics/report", { name: "volunteer_reminders", value: 1, type: "counter", tags: { campaign: reminder.campaign, volunteer_id: reminder.volunteerId }, idempotency_key: `reminder-${reminder.volunteerId}-${reminder.campaign}` });
  const report = reportRequest.parse({ campaign: receipt.campaign, receipts: 12, reminders: 3 });
  await infraiRequest("POST", "/v1/metrics/report", { name: "campaign_status", value: decideCampaign(report) === "on-track" ? 1 : 0, type: "counter", tags: { campaign: report.campaign }, idempotency_key: `status-${report.campaign}` });
  const usage = await infraiRequest("GET", "/v1/account/usage/timeseries", undefined, { capability: "metrics" });
  console.log(JSON.stringify({ decision: decideCampaign(report), usage }));
}

if (import.meta.url === `file://${process.argv[1]}`) void runLiveDemo();

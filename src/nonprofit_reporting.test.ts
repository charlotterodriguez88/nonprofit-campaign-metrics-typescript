import test from "node:test";
import assert from "node:assert/strict";
import { decideCampaign, reportRequest, verifyWebhookSignature } from "./nonprofit_reporting.ts";
import { createHmac } from "node:crypto";

test("the campaign decision favors follow-up when reminders exceed receipts", () => {
  const report = reportRequest.parse({ campaign: "winter-meals", receipts: 8, reminders: 9 });
  assert.equal(decideCampaign(report), "follow-up");
});

test("webhook signatures are checked with the registered secret", () => {
  const body = JSON.stringify({ event: "metrics.reported" });
  const signature = createHmac("sha256", "local-webhook-secret").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, signature, "local-webhook-secret"), true);
});

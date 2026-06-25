// SNS → Slack notifier (§2 observability, SNS→Slack). Subscribes to the alarms SNS topic and posts
// a formatted message to a Slack Incoming Webhook whose URL is an SSM SecureString (never in env/code).
import type { SNSEvent, SNSEventRecord } from "aws-lambda";
import { request } from "node:https";
import { getSecret } from "../secrets/get.js";
import { requireEnv } from "../env.js";

function formatAlarm(sns: SNSEventRecord["Sns"]): string {
  try {
    const m = JSON.parse(sns.Message) as Record<string, unknown>;
    if (typeof m.AlarmName === "string") {
      const state = String(m.NewStateValue ?? "");
      const emoji = state === "ALARM" ? ":rotating_light:" : state === "OK" ? ":white_check_mark:" : ":warning:";
      return `${emoji} *${m.AlarmName}* → ${state}\n${String(m.NewStateReason ?? "")}`;
    }
  } catch {
    // not a CloudWatch alarm payload — fall through to raw
  }
  return `:bell: ${sns.Subject ?? "alert"}\n${sns.Message}`;
}

function postSlack(webhookUrl: string, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const u = new URL(webhookUrl);
    const req = request(
      {
        hostname: u.hostname,
        path: `${u.pathname}${u.search}`,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () =>
          res.statusCode && res.statusCode < 300
            ? resolve()
            : reject(new Error(`slack responded ${res.statusCode}`)),
        );
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export const handler = async (event: SNSEvent): Promise<void> => {
  const webhookUrl = await getSecret(requireEnv("SLACK_WEBHOOK_SECRET"));
  for (const record of event.Records) {
    await postSlack(webhookUrl, formatAlarm(record.Sns));
  }
};

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

export type OutboundEmail = {
  to: string;
  from: string; // "Name <email>"
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  listUnsubscribe?: string;
  tags?: Record<string, string>;
};

export type SendResult = { ok: true; messageId: string; simulated: boolean } | { ok: false; permanent: boolean; error: string };

export function providerMode(): "ses" | "simulation" {
  return process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION ? "ses" : "simulation";
}

let client: SESv2Client | null = null;

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim(); // header-injection guard

export async function sendEmail(m: OutboundEmail): Promise<SendResult> {
  if (providerMode() === "simulation") return simulate(m);
  client ??= new SESv2Client({ region: process.env.AWS_REGION });
  try {
    const headers = m.listUnsubscribe
      ? [
          { Name: "List-Unsubscribe", Value: `<${clean(m.listUnsubscribe)}>` },
          { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
        ]
      : undefined;
    const res = await client.send(
      new SendEmailCommand({
        FromEmailAddress: clean(m.from),
        Destination: { ToAddresses: [clean(m.to)] },
        ReplyToAddresses: m.replyTo ? [clean(m.replyTo)] : undefined,
        ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET || undefined,
        EmailTags: m.tags ? Object.entries(m.tags).map(([Name, Value]) => ({ Name, Value: Value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) })) : undefined,
        Content: {
          Simple: {
            Subject: { Data: clean(m.subject), Charset: "UTF-8" },
            Body: { Html: { Data: m.html, Charset: "UTF-8" }, Text: { Data: m.text, Charset: "UTF-8" } },
            Headers: headers,
          },
        },
      })
    );
    return { ok: true, messageId: res.MessageId ?? `ses-${Date.now()}`, simulated: false };
  } catch (e) {
    const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const status = err.$metadata?.httpStatusCode ?? 0;
    // Throttling / 5xx / network are temporary; validation or rejected addresses are permanent.
    const temporary = status === 0 || status >= 500 || status === 429 || /Throttl|TooManyRequests|ServiceUnavailable|Timeout/i.test(err.name ?? "");
    return { ok: false, permanent: !temporary, error: `${err.name ?? "Error"}: ${err.message ?? "unknown"}` };
  }
}

/** Simulation mode lets the whole pipeline run safely without a provider.
 *  Addresses containing "bounce" hard-bounce; addresses containing "tempfail" fail temporarily. */
async function simulate(m: OutboundEmail): Promise<SendResult> {
  if (/bounce/i.test(m.to)) return { ok: false, permanent: true, error: "Simulated: mailbox does not exist (hard bounce)" };
  if (/tempfail/i.test(m.to)) return { ok: false, permanent: false, error: "Simulated: temporary provider error" };
  return { ok: true, messageId: `sim-${crypto.randomUUID()}`, simulated: true };
}

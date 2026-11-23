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

export type ProviderMode = "brevo" | "ses" | "simulation";
export const PROVIDER_LABEL: Record<ProviderMode, string> = { brevo: "Brevo", ses: "Amazon SES", simulation: "Simulation" };

/** Brevo (BREVO_API_KEY) is preferred, then Amazon SES (AWS_*). With neither, the pipeline runs in simulation. */
export function providerMode(): ProviderMode {
  if (process.env.BREVO_API_KEY) return "brevo";
  return process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION ? "ses" : "simulation";
}

/** "Name <email>" → parts */
function parseAddress(a: string) {
  const m = /^s*(.*?)s*<([^>]+)>s*$/.exec(a);
  return m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2].trim() } : { name: "", email: a.trim() };
}

/** Brevo transactional email API. Free plan: 300 emails/day. */
async function sendBrevo(m: OutboundEmail): Promise<SendResult> {
  const from = parseAddress(clean(m.from));
  const sender = { name: from.name || "AOJ Global", email: process.env.BREVO_SENDER_EMAIL || from.email };
  const headers: Record<string, string> = {};
  if (m.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${clean(m.listUnsubscribe)}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: clean(m.to) }],
        replyTo: m.replyTo ? { email: clean(m.replyTo) } : process.env.BREVO_SENDER_EMAIL && from.email !== sender.email ? { email: from.email, name: sender.name } : undefined,
        subject: clean(m.subject),
        htmlContent: m.html,
        textContent: m.text,
        headers: Object.keys(headers).length ? headers : undefined,
        tags: m.tags ? Object.values(m.tags).map((v) => v.slice(0, 50)) : undefined,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (res.ok) return { ok: true, messageId: body.messageId ?? `brevo-${Date.now()}`, simulated: false };
    // 429/5xx and auth/config problems are retried later; a rejected request (bad address etc.) is permanent.
    const temporary = res.status === 429 || res.status >= 500 || res.status === 401 || res.status === 403;
    return { ok: false, permanent: !temporary, error: `Brevo ${res.status}: ${body.message ?? body.code ?? "error"}` };
  } catch (e) {
    return { ok: false, permanent: false, error: `Brevo network error: ${(e as Error).message}` };
  }
}

let client: SESv2Client | null = null;

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim(); // header-injection guard

export async function sendEmail(m: OutboundEmail): Promise<SendResult> {
  const mode = providerMode();
  if (mode === "simulation") return simulate(m);
  if (mode === "brevo") return sendBrevo(m);
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

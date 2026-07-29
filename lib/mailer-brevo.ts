const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export type BrevoInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from: string;
  fromName: string;
};

export type BrevoPayload = {
  sender: { email: string; name: string };
  to: { email: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
};

export const buildBrevoPayload = (input: BrevoInput): BrevoPayload => {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map((email) => ({ email }));
  const payload: BrevoPayload = {
    sender: { email: input.from, name: input.fromName },
    to: recipients,
    subject: input.subject,
    htmlContent: input.html,
  };
  if (input.text) payload.textContent = input.text;
  return payload;
};

export const sendWithBrevo = async (input: BrevoInput): Promise<void> => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is not set.");

  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(buildBrevoPayload(input)),
  });

  if (!response.ok) {
    // Body may echo request content; truncate and never include the key.
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Brevo send failed (${response.status}): ${body}`);
  }
};

import "server-only";

import nodemailer from "nodemailer";

import type { AlertRecord, MacroEvent, SignalScore } from "@/db/repository";

export type AlertWithSignal = AlertRecord & {
  event: MacroEvent;
  score: SignalScore;
};

export async function sendSignalEmail(alerts: AlertWithSignal[]) {
  if (alerts.length === 0) return { status: "skipped" as const, reason: "no_alerts" };
  const to = process.env.ALERT_EMAIL_TO;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? "Macro Radar <alerts@example.com>";

  if (!to || !host || !user || !pass) {
    return { status: "skipped" as const, reason: "email_not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user, pass }
  });

  const topAlerts = alerts.slice(0, 8);
  await transporter.sendMail({
    from,
    to,
    subject: `Macro Radar: ${topAlerts.length} high-signal event${topAlerts.length === 1 ? "" : "s"}`,
    text: renderText(topAlerts),
    html: renderHtml(topAlerts)
  });

  return { status: "sent" as const };
}

function renderText(alerts: AlertWithSignal[]): string {
  return alerts
    .map(
      (alert) =>
        `${alert.score.score}/100 — ${alert.event.title}\n${alert.event.summary}\nSuggestion: ${alert.score.directionalSuggestion}\n`
    )
    .join("\n---\n");
}

function renderHtml(alerts: AlertWithSignal[]): string {
  return `
    <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; color: #07130c;">
      <h1>Macro Radar</h1>
      ${alerts
        .map(
          (alert) => `
            <section style="border:1px solid #dfe8d9;border-radius:16px;padding:16px;margin:12px 0;">
              <p style="margin:0;color:#00a86b;font-weight:700;">${alert.score.score}/100 ${alert.score.rankingLabel.toUpperCase()}</p>
              <h2 style="margin:6px 0 8px;">${escapeHtml(alert.event.title)}</h2>
              <p>${escapeHtml(alert.event.summary)}</p>
              <p><strong>Directional suggestion:</strong> ${escapeHtml(alert.score.directionalSuggestion)}</p>
            </section>
          `
        )
        .join("")}
      <p style="color:#65736b;font-size:12px;">Decision support only. Macro Radar does not place trades or provide financial advice.</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

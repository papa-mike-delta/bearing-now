// Signed session tokens. Kept free of database imports so the proxy can verify them.
import crypto from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET || "lifeos-dev-secret-change-in-production";

export interface SessionData {
  userId: string;
  email: string;
  twoFactorVerified: boolean;
  createdAt: number;
  expiresAt: number;
}

export function createSession(userId: string, email: string, twoFactorVerified: boolean): string {
  const data: SessionData = {
    userId,
    email,
    twoFactorVerified,
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function verifySession(token: string): SessionData | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;

    const payload = decoded.substring(0, lastDot);
    const signature = decoded.substring(lastDot + 1);

    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
    if (signature !== expectedSig) return null;

    const data: SessionData = JSON.parse(payload);
    if (Date.now() > data.expiresAt) return null;

    return data;
  } catch {
    return null;
  }
}

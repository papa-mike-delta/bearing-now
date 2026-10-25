import crypto from "node:crypto";
import { z } from "zod";
import { v1db } from "../src/lib/v1/db";
const email = z.email().parse(process.argv[2]).toLowerCase();
const token = crypto.randomBytes(32).toString("hex");
try {
  await v1db.invitation.create({
    data: {
      email,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    },
  });
  console.log(`Invitation for ${email} (expires in 7 days): ${token}`);
} finally {
  await v1db.$disconnect();
}

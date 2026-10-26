import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { ItemDraftSession } from "@/components/bearing/item-draft-session";
/** The existing draft owner lives at the signed-in layout, not at a changing view. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = verifySession(
    (await cookies()).get("lifeos-session")?.value ?? "",
  );
  if (!session?.twoFactorVerified) redirect("/login");
  return (
    <ItemDraftSession key={session.userId} userId={session.userId}>
      {children}
    </ItemDraftSession>
  );
}

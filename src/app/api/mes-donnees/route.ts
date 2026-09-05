import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Export RGPD (droit à la portabilité, art. 20) : toutes les données du compte en JSON. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });

  const db = await getDb();
  const [driverProfile, ownerProfile, vehicles, documents, bookings, notifications, favorites, alertes, avisEcrits] =
    await Promise.all([
      db.query.driverProfiles.findFirst({ where: eq(schema.driverProfiles.userId, user.id) }),
      db.query.ownerProfiles.findFirst({ where: eq(schema.ownerProfiles.userId, user.id) }),
      db.query.vehicles.findMany({ where: eq(schema.vehicles.ownerId, user.id) }),
      db.query.documents.findMany({ where: eq(schema.documents.ownerUserId, user.id) }),
      db.query.bookings.findMany({ where: eq(schema.bookings.driverId, user.id) }),
      db.query.notifications.findMany({ where: eq(schema.notifications.userId, user.id) }),
      db.query.favorites.findMany({ where: eq(schema.favorites.userId, user.id) }),
      db.query.savedSearches.findMany({ where: eq(schema.savedSearches.userId, user.id) }),
      db.query.reviews.findMany({ where: eq(schema.reviews.auteurId, user.id) }),
    ]);

  const bookingIds = bookings.map((b) => b.id);
  const contrats = bookingIds.length
    ? await db.query.contracts.findMany({ where: inArray(schema.contracts.bookingId, bookingIds) })
    : [];
  const paiements = bookingIds.length
    ? await db.query.payments.findMany({ where: inArray(schema.payments.bookingId, bookingIds) })
    : [];
  const messages = await db.query.messages.findMany({ where: eq(schema.messages.senderId, user.id) });

  await audit(user.id, "rgpd.export", { type: "user", id: user.id });

  const { passwordHash: _mdp, ...profil } = user as typeof user & { passwordHash?: string };
  const donnees = {
    exporteLe: new Date().toISOString(),
    profil,
    profilChauffeur: driverProfile ?? null,
    profilLoueur: ownerProfile ?? null,
    vehicules: vehicles,
    documents: documents.map((d) => ({ ...d, note: "fichier téléchargeable via /api/fichiers/" + d.fichierPath })),
    locations: bookings,
    contrats,
    paiements,
    messagesEnvoyes: messages,
    notifications,
    favoris: favorites,
    alertesRecherche: alertes,
    avisEcrits,
  };

  return new NextResponse(JSON.stringify(donnees, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="forvtc-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { readStored, contentTypeOf } from "@/lib/storage";

/**
 * Fichiers JAMAIS servis statiquement.
 * - photos/* : publiques uniquement si liées à une annonce publiée (sinon propriétaire/admin).
 * - documents/* : strictement propriétaire ou admin.
 */
export async function GET(_req: NextRequest, { params }: { params: { path: string[] } }) {
  const storagePath = params.path.join("/");
  const db = await getDb();

  if (storagePath.startsWith("photos/")) {
    const photo = await db.query.vehiclePhotos.findFirst({ where: eq(schema.vehiclePhotos.path, storagePath) });
    if (!photo) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    const listing = await db.query.listings.findFirst({ where: eq(schema.listings.vehicleId, photo.vehicleId) });
    if (!listing || listing.statut !== "publiee") {
      const user = await currentUser();
      const veh = await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, photo.vehicleId) });
      if (!user || !veh || (veh.ownerId !== user.id && user.role !== "admin"))
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  } else if (storagePath.startsWith("documents/")) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    const doc = await db.query.documents.findFirst({ where: eq(schema.documents.fichierPath, storagePath) });
    if (!doc) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    if (doc.ownerUserId !== user.id && user.role !== "admin")
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  } else if (storagePath.startsWith("contrats/")) {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    const contrat = await db.query.contracts.findFirst({ where: eq(schema.contracts.pdfPath, storagePath) });
    if (!contrat) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    if (user.role !== "admin") {
      const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, contrat.bookingId) });
      const listing = booking
        ? await db.query.listings.findFirst({ where: eq(schema.listings.id, booking.listingId) })
        : null;
      const veh = listing
        ? await db.query.vehicles.findFirst({ where: eq(schema.vehicles.id, listing.vehicleId) })
        : null;
      const partie = booking && (booking.driverId === user.id || veh?.ownerId === user.id);
      if (!partie) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  } else if (storagePath.startsWith("recus/")) {
    // Reçus de paiement : strictement le titulaire ou un admin
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    const recu = await db.query.receipts.findFirst({ where: eq(schema.receipts.pdfPath, storagePath) });
    if (!recu) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    if (recu.userId !== user.id && user.role !== "admin")
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  } else {
    return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  }

  try {
    const buf = await readStored(storagePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentTypeOf(storagePath),
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "Fichier indisponible" }, { status: 404 });
  }
}

import { and, eq, inArray, lt, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";

/**
 * MACHINE À ÉTATS DE LA LOCATION — aucune transition incohérente possible.
 * DRAFT → REQUESTED → ACCEPTED → PAYMENT_PENDING → PAID → CONTRACT_PENDING
 * → SIGNED → ACTIVE → RETURN_PENDING → RETURNED → COMPLETED
 * Sorties : CANCELLED / DISPUTED / FAILED
 */
export const TRANSITIONS: Record<string, string[]> = {
  draft: ["requested", "cancelled"],
  requested: ["accepted", "cancelled"],
  accepted: ["payment_pending", "cancelled"],
  payment_pending: ["paid", "failed", "cancelled"],
  paid: ["contract_pending", "cancelled"],
  contract_pending: ["signed", "cancelled"],
  signed: ["active", "cancelled"],
  active: ["return_pending", "disputed"],
  return_pending: ["returned", "disputed"],
  returned: ["completed", "disputed"],
  disputed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  failed: [],
};

export const STATUT_LABELS: Record<string, { txt: string; cls: string }> = {
  requested: { txt: "Demande envoyée", cls: "bg-amber-100 text-amber-800" },
  accepted: { txt: "Acceptée — en attente de paiement (module non activé)", cls: "bg-emerald-100 text-emerald-800" },
  payment_pending: { txt: "Paiement en attente", cls: "bg-amber-100 text-amber-800" },
  paid: { txt: "Payée", cls: "bg-emerald-100 text-emerald-800" },
  contract_pending: { txt: "Contrat en attente", cls: "bg-amber-100 text-amber-800" },
  signed: { txt: "Contrat signé", cls: "bg-emerald-100 text-emerald-800" },
  active: { txt: "Location en cours", cls: "bg-brand-100 text-brand-700" },
  return_pending: { txt: "Restitution en attente", cls: "bg-amber-100 text-amber-800" },
  returned: { txt: "Restituée", cls: "bg-slate-200 text-slate-700" },
  completed: { txt: "Terminée", cls: "bg-slate-200 text-slate-700" },
  cancelled: { txt: "Annulée / refusée", cls: "bg-red-100 text-red-800" },
  disputed: { txt: "Litige ouvert", cls: "bg-red-100 text-red-800" },
  failed: { txt: "Échec", cls: "bg-red-100 text-red-800" },
};

/** Statuts qui bloquent le calendrier (une demande simple ne bloque pas). */
export const STATUTS_BLOQUANTS = [
  "accepted",
  "payment_pending",
  "paid",
  "contract_pending",
  "signed",
  "active",
  "return_pending",
] as const;

/** Transition contrôlée + journalisée. Refuse toute transition non déclarée. */
export async function transitionBooking(
  bookingId: string,
  vers: (typeof schema.bookingStatus.enumValues)[number],
  acteurId: string
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const db = await getDb();
  const booking = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, bookingId) });
  if (!booking) return { ok: false, erreur: "Réservation introuvable." };
  const autorisees = TRANSITIONS[booking.statut] ?? [];
  if (!autorisees.includes(vers))
    return { ok: false, erreur: `Transition impossible : ${booking.statut} → ${vers}.` };
  await db
    .update(schema.bookings)
    .set({ statut: vers, updatedAt: new Date() })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.statut, booking.statut)));
  await audit(acteurId, "booking.transition", { type: "booking", id: bookingId }, { de: booking.statut, vers });
  return { ok: true };
}

/**
 * Anti-double-réservation : chevauchement avec réservations bloquantes
 * ou périodes d'indisponibilité du calendrier. Vérifié CÔTÉ SERVEUR.
 * (En production PostgreSQL : doublé d'une contrainte d'exclusion GiST.)
 */
export async function periodeDisponible(
  listingId: string,
  vehicleId: string,
  debut: Date,
  fin: Date,
  ignorerBookingId?: string
): Promise<{ libre: boolean; raison?: string }> {
  const db = await getDb();

  const conflits = await db.query.bookings.findMany({
    where: and(
      eq(schema.bookings.listingId, listingId),
      inArray(schema.bookings.statut, [...STATUTS_BLOQUANTS]),
      lt(schema.bookings.dateDebut, fin),
      gt(schema.bookings.dateFin, debut)
    ),
  });
  const reel = conflits.filter((c) => c.id !== ignorerBookingId);
  if (reel.length > 0) return { libre: false, raison: "Le véhicule est déjà réservé sur tout ou partie de cette période." };

  const indispo = await db.query.availability.findMany({
    where: and(
      eq(schema.availability.vehicleId, vehicleId),
      inArray(schema.availability.statut, ["maintenance", "indisponible", "reserve", "location"]),
      lt(schema.availability.dateDebut, fin),
      gt(schema.availability.dateFin, debut)
    ),
  });
  if (indispo.length > 0) return { libre: false, raison: "Le véhicule est indisponible sur cette période (calendrier du loueur)." };

  return { libre: true };
}

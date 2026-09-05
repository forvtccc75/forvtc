/**
 * Villes/départements cibles pour les pages SEO locales.
 * Slugs stables : /location-voiture-vtc-{slug}.
 * Les compteurs d'annonces affichés sont TOUJOURS les compteurs réels.
 */
export type VilleSeo = {
  slug: string;
  nom: string;
  filtre: string; // motif utilisé pour la recherche (ville ou préfixe CP)
  type: "ville" | "departement";
  description: string;
};

export const VILLES_SEO: VilleSeo[] = [
  { slug: "paris", nom: "Paris", filtre: "75", type: "departement", description: "Le premier marché VTC de France : trouvez une voiture conforme aux exigences de l'activité (puissance, dimensions, contrôle technique annuel) auprès de loueurs dont les documents sont vérifiés." },
  { slug: "93", nom: "Seine-Saint-Denis (93)", filtre: "93", type: "departement", description: "Location de véhicules adaptés à l'activité VTC en Seine-Saint-Denis : Saint-Denis, Montreuil, Aubervilliers, Bobigny et toutes les communes du 93." },
  { slug: "94", nom: "Val-de-Marne (94)", filtre: "94", type: "departement", description: "Véhicules pour chauffeurs VTC dans le Val-de-Marne : Créteil, Vitry-sur-Seine, Champigny et toutes les communes du 94." },
  { slug: "92", nom: "Hauts-de-Seine (92)", filtre: "92", type: "departement", description: "Location VTC dans les Hauts-de-Seine : Boulogne-Billancourt, Nanterre, Courbevoie et toutes les communes du 92." },
  { slug: "lyon", nom: "Lyon (69)", filtre: "69", type: "departement", description: "Deuxième agglomération VTC de France : louez un véhicule conforme auprès de loueurs vérifiés à Lyon et dans le Rhône." },
  { slug: "marseille", nom: "Marseille (13)", filtre: "13", type: "departement", description: "Location de voitures pour chauffeurs VTC à Marseille, Aix-en-Provence et dans les Bouches-du-Rhône." },
  { slug: "toulouse", nom: "Toulouse (31)", filtre: "31", type: "departement", description: "Véhicules pour l'activité VTC à Toulouse et en Haute-Garonne." },
  { slug: "bordeaux", nom: "Bordeaux (33)", filtre: "33", type: "departement", description: "Location VTC à Bordeaux et en Gironde : berlines et hybrides adaptées à l'activité." },
  { slug: "lille", nom: "Lille (59)", filtre: "59", type: "departement", description: "Véhicules pour chauffeurs VTC à Lille et dans le Nord." },
  { slug: "nice", nom: "Nice (06)", filtre: "06", type: "departement", description: "Location de véhicules VTC à Nice, Cannes et dans les Alpes-Maritimes." },
  { slug: "nantes", nom: "Nantes (44)", filtre: "44", type: "departement", description: "Véhicules adaptés à l'activité VTC à Nantes et en Loire-Atlantique." },
  { slug: "rennes", nom: "Rennes (35)", filtre: "35", type: "departement", description: "Location de voitures pour chauffeurs VTC à Rennes et en Ille-et-Vilaine." },
  { slug: "strasbourg", nom: "Strasbourg (67)", filtre: "67", type: "departement", description: "Véhicules VTC à Strasbourg et dans le Bas-Rhin." },
  { slug: "montpellier", nom: "Montpellier (34)", filtre: "34", type: "departement", description: "Location VTC à Montpellier et dans l'Hérault." },
];

export function villeParSlug(slug: string): VilleSeo | undefined {
  return VILLES_SEO.find((v) => v.slug === slug);
}

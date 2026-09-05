"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type PointCarte = {
  id: string;
  lat: number;
  lng: number;
  titre: string;
  prix: string; // déjà formaté (ex : "1 150 €/mois")
  url: string;
};

/**
 * Carte MapLibre + OpenStreetMap (tuiles raster OSM, gratuit).
 * Positions au niveau COMMUNE uniquement (géocodage BAN) — jamais l'adresse
 * privée précise d'un particulier.
 */
export function CarteAnnonces({ points }: { points: PointCarte[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: [2.3522, 46.6], // France
      zoom: 4.8,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    if (points.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const p of points) {
        bounds.extend([p.lng, p.lat]);
        const el = document.createElement("div");
        el.style.cssText =
          "background:#123d8e;color:#fff;font:600 11px system-ui;padding:4px 8px;border-radius:999px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap;";
        el.textContent = p.prix;
        new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(
              `<a href="${p.url}" style="font:600 12px system-ui;color:#123d8e;text-decoration:none;">${p.titre
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")}</a>`
            )
          )
          .addTo(map);
      }
      map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 sm:h-96" />;
}

/** Agrégation des données de dimensionnement et génération des livrables. */
import JSZip from "jszip";
import type { DimensioningResult } from "./types";
import { buildXlsx, type XlsxSheet } from "./xlsx";

function quote(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]): string {
  return (
    "\ufeff" + rows.map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n"
  );
}

/** Feuilles de données, identiques dans tous les formats d'export. */
export function buildTables(
  layoutName: string,
  result: DimensioningResult,
): XlsxSheet[] {
  const { racks, devices, cables, totals, summary } = result;
  const synthese: (string | number)[][] = [
    ["Projet", layoutName],
    ["Baies", racks.length],
    ["Équipements", devices.length],
    ["Liaisons", cables.length],
    ["Câbles", summary.totalCables],
    ["Longueur câbles (m)", summary.totalMeters],
    ["Puissance théorique (W)", totals.powerW],
    ["TDP rejeté (W)", totals.tdpW],
    ["Chaleur (BTU/h)", totals.btuH],
    ["Poids total (kg)", totals.weightKg],
    ["Courant nécessaire (A)", totals.requiredAmps],
    ["Capacité PDU utile (W)", totals.pduCapacityW],
  ];
  for (const [kind, info] of Object.entries(summary.byType)) {
    synthese.push([`Câbles ${kind} (x / m)`, `${info.count} / ${info.meters}`]);
  }

  return [
    { name: "Synthese", rows: synthese },
    {
      name: "Baies",
      rows: [
        [
          "Baie",
          "Hauteur U",
          "U utilisés",
          "U libres",
          "Équipements",
          "Serveurs",
          "Switchs",
          "Firewalls",
          "Puissance (W)",
          "TDP (W)",
          "BTU/h",
          "Poids (kg)",
          "PDU",
          "Montage PDU",
          "PDU (A)",
          "Capacité PDU (W)",
          "Courant requis (A)",
          "Charge PDU (%)",
          "État",
        ],
        ...racks.map((r) => [
          r.name,
          r.heightU,
          r.usedU,
          r.freeU,
          r.devices,
          r.servers,
          r.switches,
          r.firewalls,
          r.powerW,
          r.tdpW,
          r.btuH,
          r.weightKg,
          r.pduCount,
          r.pduMounts.join(", "),
          r.pduAmps,
          r.pduCapacityW,
          r.requiredAmps,
          r.pduLoadPct,
          r.status,
        ]),
      ],
    },
    {
      name: "Equipements",
      rows: [
        [
          "ID",
          "Nom",
          "Type",
          "Catégorie",
          "Baie",
          "U début",
          "Hauteur U",
          "Montage",
          "Puissance (W)",
          "TDP (W)",
          "Poids (kg)",
          "PDU (A)",
          "PDU (V)",
        ],
        ...devices.map((d) => [
          d.id,
          d.name,
          d.typeSlug,
          d.category ?? "",
          d.rackName,
          d.uStart,
          d.heightU,
          d.mount,
          d.powerW,
          d.tdpW,
          d.weightKg,
          d.pduAmps,
          d.pduVolts,
        ]),
      ],
    },
    {
      name: "Cables",
      rows: [
        [
          "ID câble",
          "Type",
          "Longueur (m)",
          "Baie A",
          "U A",
          "Équipement A",
          "Port A",
          "Baie B",
          "U B",
          "Équipement B",
          "Port B",
          "Rôle",
          "Détail calcul",
        ],
        ...cables.map((c) => [
          c.id,
          c.cableType,
          c.lengthM,
          c.aRack,
          c.aU,
          c.aDevice,
          c.aPort,
          c.bRack,
          c.bU,
          c.bDevice,
          c.bPort,
          c.role,
          c.detail,
        ]),
      ],
    },
    {
      name: "Etiquettes",
      rows: [
        [
          "Câble",
          "Extrémité",
          "Référence",
          "Équipement",
          "Port",
          "Baie",
          "U",
          "Type câble",
          "Longueur (m)",
          "Rôle",
        ],
        ...cables.flatMap((c) => [
          [
            c.id,
            "A",
            `${c.id}-A`,
            c.aDevice,
            c.aPort,
            c.aRack,
            c.aU,
            c.cableType,
            c.lengthM,
            c.role,
          ],
          [
            c.id,
            "B",
            `${c.id}-B`,
            c.bDevice,
            c.bPort,
            c.bRack,
            c.bU,
            c.cableType,
            c.lengthM,
            c.role,
          ],
        ]),
      ],
    },
    {
      name: "Types",
      rows: [
        [
          "Slug",
          "Catégorie",
          "U",
          "Montage",
          "Poids (kg)",
          "Puissance (W)",
          "TDP (W)",
          "PDU (A)",
          "PDU (V)",
        ],
        ...devices.map((d) => [
          d.typeSlug,
          d.category ?? "",
          d.heightU,
          d.mount,
          d.weightKg,
          d.powerW,
          d.tdpW,
          d.pduAmps,
          d.pduVolts,
        ]),
      ],
    },
  ];
}

export async function exportXlsx(
  layoutName: string,
  result: DimensioningResult,
): Promise<Blob> {
  return buildXlsx(buildTables(layoutName, result));
}

export async function exportCsvZip(
  layoutName: string,
  result: DimensioningResult,
): Promise<Blob> {
  const zip = new JSZip();
  for (const sheet of buildTables(layoutName, result)) {
    zip.file(`${sheet.name}.csv`, toCsv(sheet.rows));
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

export function exportLabelsHtml(result: DimensioningResult): Blob {
  const cards = result.cables.flatMap((c) => [
    `<div class="label"><div class="ref">${c.id}A</div><div class="main">${escapeHtml(
      c.aDevice,
    )}/${escapeHtml(c.aPort)}</div><div class="sub">${escapeHtml(c.aRack)} / U${
      c.aU
    } · ${escapeHtml(c.cableType)} · ${c.lengthM.toFixed(1)} m</div><div class="foot">${escapeHtml(
      c.role || c.id,
    )}</div></div>`,
    `<div class="label"><div class="ref">${c.id}B</div><div class="main">${escapeHtml(
      c.bDevice,
    )}/${escapeHtml(c.bPort)}</div><div class="sub">${escapeHtml(c.bRack)} / U${
      c.bU
    } · ${escapeHtml(c.cableType)} · ${c.lengthM.toFixed(1)} m</div><div class="foot">${escapeHtml(
      c.role || c.id,
    )}</div></div>`,
  ]);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes de câblage</title><style>@page{size:A4;margin:12mm}body{font-family:Consolas,monospace;margin:0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.label{border:1px dashed #333;padding:3mm;min-height:22mm;page-break-inside:avoid}.ref{font-weight:bold;font-size:12pt}.main{font-size:10pt;margin-top:2mm}.sub{font-size:8pt;color:#555;margin-top:1mm}.foot{font-size:7pt;color:#888;margin-top:1mm}</style></head><body><div class="grid">${cards.join(
    "",
  )}</div></body></html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

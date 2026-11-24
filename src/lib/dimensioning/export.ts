/** Agrégation des données de dimensionnement et génération des livrables. */
import JSZip from "jszip";
import QRCode from "qrcode";
import type {
  DimensionedCable,
  DimensioningResult,
  DimensioningSettings,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";
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

/** Remplace les jetons du modèle d'étiquette. */
export function renderLabel(
  cable: DimensionedCable,
  end: "A" | "B",
  format = DEFAULT_SETTINGS.labelFormat,
): string[] {
  const localDevice = end === "A" ? cable.aDevice : cable.bDevice;
  const localPort = end === "A" ? cable.aPort : cable.bPort;
  const localRack = end === "A" ? cable.aRack : cable.bRack;
  const localU = end === "A" ? cable.aU : cable.bU;
  const peerDevice = end === "A" ? cable.bDevice : cable.aDevice;
  const peerPort = end === "A" ? cable.bPort : cable.aPort;
  const values: Record<string, string> = {
    CABLE: cable.id,
    END: end,
    DEVICE: localDevice,
    PORT: localPort,
    PEER_DEVICE: peerDevice,
    PEER_PORT: peerPort,
    RACK: localRack,
    U: String(localU),
    PEER_RACK: end === "A" ? cable.bRack : cable.aRack,
    PEER_U: String(end === "A" ? cable.bU : cable.aU),
    TYPE: cable.cableType,
    LEN: cable.lengthM.toFixed(1),
    ROLE: cable.role || "",
  };
  return format
    .replace(
      /\{(CABLE|END|DEVICE|PORT|PEER_DEVICE|PEER_PORT|RACK|U|PEER_RACK|PEER_U|TYPE|LEN|ROLE)\}/g,
      (_, key) => values[key] ?? "",
    )
    .split(/\r?\n/)
    .filter((line, index, all) => line.trim() !== "" || index < all.length - 1);
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

/** Feuilles de données, identiques dans tous les formats d'export. */
export function buildTables(
  layoutName: string,
  result: DimensioningResult,
  settings: DimensioningSettings = DEFAULT_SETTINGS,
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

  // Matrice équipement -> équipement : une cellule par liaison.
  const names = [...new Set(devices.map((d) => d.name))].sort();
  const matrix: (string | number)[][] = [["De / Vers", ...names]];
  for (const from of names) {
    const row: (string | number)[] = [from];
    for (const to of names) {
      const links = cables.filter(
        (c) =>
          (c.aDevice === from && c.bDevice === to) ||
          (c.bDevice === from && c.aDevice === to),
      );
      row.push(links.map((c) => `${c.id} (${c.lengthM} m)`).join(", "));
    }
    matrix.push(row);
  }

  // Matrice port -> port (uniquement les ports réellement câblés).
  const connectedPorts = [
    ...new Set(
      cables.flatMap((c) => [
        `${c.aDevice}/${c.aPort}`,
        `${c.bDevice}/${c.bPort}`,
      ]),
    ),
  ].sort();
  const portMatrix: (string | number)[][] = [
    ["Port / Port", ...connectedPorts],
  ];
  for (const a of connectedPorts) {
    const row: (string | number)[] = [a];
    for (const b of connectedPorts) {
      const link = cables.find(
        (c) =>
          (`${c.aDevice}/${c.aPort}` === a &&
            `${c.bDevice}/${c.bPort}` === b) ||
          (`${c.bDevice}/${c.bPort}` === a && `${c.aDevice}/${c.aPort}` === b),
      );
      row.push(link ? `${link.id} · ${link.cableType}` : "");
    }
    portMatrix.push(row);
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
      name: "EquipementsPorts",
      rows: [
        ["Équipement", "Baie", "U", "Nom port", "Étiquette port", "Type port"],
        ...devices.flatMap((d) =>
          d.ports.map((p) => [
            d.name,
            d.rackName,
            d.uStart,
            p.name,
            p.label,
            p.kind,
          ]),
        ),
      ],
    },
    { name: "MatriceCablage", rows: matrix },
    { name: "MatricePorts", rows: portMatrix },
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
          "Texte imprimé",
        ],
        ...cables.flatMap((c) =>
          (["A", "B"] as const).map((end) => [
            c.id,
            end,
            `${c.id}-${end}`,
            end === "A" ? c.aDevice : c.bDevice,
            end === "A" ? c.aPort : c.bPort,
            end === "A" ? c.aRack : c.bRack,
            end === "A" ? c.aU : c.bU,
            c.cableType,
            c.lengthM,
            c.role,
            renderLabel(c, end, settings.labelFormat).join(" / "),
          ]),
        ),
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
  settings: DimensioningSettings = DEFAULT_SETTINGS,
): Promise<Blob> {
  return buildXlsx(buildTables(layoutName, result, settings));
}

export async function exportCsvZip(
  layoutName: string,
  result: DimensioningResult,
  settings: DimensioningSettings = DEFAULT_SETTINGS,
): Promise<Blob> {
  const zip = new JSZip();
  for (const sheet of buildTables(layoutName, result, settings)) {
    zip.file(`${sheet.name}.csv`, toCsv(sheet.rows));
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

/** Planche d'étiquettes imprimable, avec QR code par extrémité. */
export async function exportLabelsHtml(
  result: DimensioningResult,
  settings: DimensioningSettings = DEFAULT_SETTINGS,
): Promise<Blob> {
  const cards: string[] = [];
  for (const cable of result.cables) {
    for (const end of ["A", "B"] as const) {
      const lines = renderLabel(cable, end, settings.labelFormat);
      const payload = [
        cable.id,
        end,
        lines[0] ?? "",
        lines[1] ?? "",
        lines[2] ?? "",
        `${cable.lengthM}m`,
      ].join("|");
      const qr = await QRCode.toDataURL(payload, {
        width: 84,
        margin: 0,
        errorCorrectionLevel: "M",
      });
      cards.push(
        `<div class="label"><div class="qr"><img src="${qr}" alt="QR ${cable.id}${end}"></div>` +
          `<div class="lines">${lines
            .map((line, i) => `<div class="l${i}">${escapeHtml(line)}</div>`)
            .join("")}</div></div>`,
      );
    }
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes de câblage</title><style>
@page { size:A4; margin:10mm; }
* { box-sizing:border-box; }
body { font-family:Consolas,"Courier New",monospace; margin:0; }
h1 { font-family:"Segoe UI",Arial,sans-serif; font-size:14pt; margin:0 0 8mm; }
.grid { display:grid; grid-template-columns:repeat(3,1fr); gap:4mm; }
.label { display:flex; gap:3mm; align-items:center; border:1px dashed #333; padding:2mm;
         min-height:24mm; page-break-inside:avoid; }
.qr img { width:20mm; height:20mm; }
.lines { flex:1; min-width:0; }
.l0 { font-weight:bold; font-size:12pt; }
.l1 { font-size:10pt; margin-top:1.5mm; word-break:break-all; }
.l2 { font-size:8pt; color:#444; margin-top:1.5mm; }
.l3 { font-size:8pt; color:#666; margin-top:1mm; }
@media print { h1 { display:none; } }
</style></head><body><h1>Planche d'étiquettes — ${result.cables.length} câbles</h1><div class="grid">${cards.join(
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

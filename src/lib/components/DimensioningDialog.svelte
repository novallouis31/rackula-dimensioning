<!--
  DimensioningDialog — greffe RackPlanner sur Rackula.
  Calcule TDP, poids, puissance, charge PDU, câbles et étiquettes à partir du
  layout ouvert, et propose les exports Excel / CSV / étiquettes.
-->
<script lang="ts">
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { computeDimensioning, getSettings } from "$lib/dimensioning/engine";
  import { DIM_PREFIX } from "$lib/dimensioning/types";
  import {
    downloadBlob,
    exportCsvZip,
    exportLabelsHtml,
    exportXlsx,
  } from "$lib/dimensioning/export";
  import type { DimensioningSettings } from "$lib/dimensioning/types";

  interface Props {
    open: boolean;
    onclose: () => void;
  }
  let { open, onclose }: Props = $props();

  const layoutStore = getLayoutStore();
  let custom = $state<DimensioningSettings>({
    ...getSettings(layoutStore.layout),
  });
  const layout = $derived(layoutStore.layout);
  const result = $derived(computeDimensioning(layout, custom));
  const slugs = $derived(
    [...new Set(result.devices.map((d) => d.typeSlug))].sort(),
  );
  let busy = $state(false);
  let selectedSlug = $state("");
  let metaPower = $state(0);
  let metaTdp = $state(0);
  let metaAmps = $state(0);
  let metaVolts = $state(230);
  let metaMount = $state("horizontal");

  $effect(() => {
    const firstSlug = slugs[0];
    if (!selectedSlug && firstSlug) selectedSlug = firstSlug;
    const type = layout.device_types.find((t) => t.slug === selectedSlug);
    if (!type) return;
    const fields = type.custom_fields ?? {};
    metaPower = Number(fields[DIM_PREFIX + "powerW"] ?? 0);
    metaTdp = Number(fields[DIM_PREFIX + "tdpW"] ?? 0);
    metaAmps = Number(fields[DIM_PREFIX + "pduAmps"] ?? 0);
    metaVolts = Number(fields[DIM_PREFIX + "pduVolts"] ?? 230);
    metaMount = String(fields[DIM_PREFIX + "mount"] ?? "horizontal");
  });

  function resetSettings() {
    custom = { ...getSettings(layout) };
  }

  /** Écrit les métadonnées dans le type Rackula (avec undo/redo natif). */
  function applyMeta() {
    const type = layout.device_types.find((t) => t.slug === selectedSlug);
    if (!type) return;
    layoutStore.updateDeviceType(type.slug, {
      custom_fields: {
        ...(type.custom_fields ?? {}),
        [DIM_PREFIX + "powerW"]: metaPower,
        [DIM_PREFIX + "tdpW"]: metaTdp || metaPower,
        [DIM_PREFIX + "pduAmps"]: metaAmps,
        [DIM_PREFIX + "pduVolts"]: metaVolts,
        [DIM_PREFIX + "mount"]: metaMount,
      },
    });
  }

  async function runExport(kind: "xlsx" | "csv" | "labels") {
    busy = true;
    try {
      if (kind === "xlsx") {
        downloadBlob(
          await exportXlsx(layout.name, result),
          "dimensionnement-rack.xlsx",
        );
      } else if (kind === "csv") {
        downloadBlob(
          await exportCsvZip(layout.name, result),
          "dimensionnement-csv.zip",
        );
      } else {
        downloadBlob(exportLabelsHtml(result), "etiquettes-cablage.html");
      }
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="dim-backdrop" role="presentation" onclick={onclose}>
    <div
      class="dim-dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Dimensionnement de la baie"
      onclick={(event) => event.stopPropagation()}
    >
      <header class="dim-head">
        <div>
          <h2>Dimensionnement — {layout.name}</h2>
          <p class="dim-sub">
            TDP, poids, puissance, PDU, câbles et étiquettes calculés depuis le
            layout Rackula.
          </p>
        </div>
        <button class="dim-close" onclick={onclose} aria-label="Fermer"
          >✕</button
        >
      </header>

      <div class="dim-body">
        <div class="dim-cards">
          <div class="dim-card">
            <span>TDP rejeté</span><strong>{result.totals.tdpW} W</strong><small
              >{result.totals.btuH} BTU/h</small
            >
          </div>
          <div class="dim-card">
            <span>Poids prévu</span><strong>{result.totals.weightKg} kg</strong
            ><small>{result.devices.length} équipements</small>
          </div>
          <div class="dim-card">
            <span>Puissance théorique</span><strong
              >{result.totals.powerW} W</strong
            ><small
              >{result.totals.requiredAmps} A @ {custom.pduVoltage} V</small
            >
          </div>
          <div class="dim-card">
            <span>Capacité PDU utile</span><strong
              >{result.totals.pduCapacityW} W</strong
            ><small>déclassement {Math.round(custom.pduDerating * 100)} %</small
            >
          </div>
          <div class="dim-card">
            <span>Câblage</span><strong>{result.summary.totalCables}</strong
            ><small>{result.summary.totalMeters} m cumulés</small>
          </div>
        </div>

        {#if result.issues.length}
          <section class="dim-section">
            <h3>Contrôles</h3>
            {#each result.issues as issue (issue.code + issue.message)}
              <p class="dim-issue {issue.level}">
                <b>{issue.code}</b> — {issue.message}
              </p>
            {/each}
          </section>
        {/if}

        <section class="dim-section">
          <h3>Baies</h3>
          <div class="dim-scroll">
            <table>
              <thead
                ><tr
                  ><th>Baie</th><th>U</th><th>W</th><th>TDP</th><th>kg</th><th
                    >PDU</th
                  ><th>Charge</th><th>État</th></tr
                ></thead
              >
              <tbody>
                {#each result.racks as rack (rack.id)}
                  <tr>
                    <td>{rack.name}</td>
                    <td>{rack.usedU}/{rack.heightU}</td>
                    <td>{rack.powerW}</td>
                    <td>{rack.tdpW}</td>
                    <td>{rack.weightKg}</td>
                    <td>{rack.pduAmps} A</td>
                    <td>{rack.pduLoadPct} %</td>
                    <td
                      ><span class="dim-tag {rack.status}">{rack.status}</span
                      ></td
                    >
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>

        <section class="dim-section">
          <h3>Câbles ({result.cables.length})</h3>
          <div class="dim-scroll dim-scroll-lg">
            <table>
              <thead
                ><tr
                  ><th>ID</th><th>Type</th><th>m</th><th>A</th><th>B</th><th
                    >Rôle</th
                  ></tr
                ></thead
              >
              <tbody>
                {#each result.cables as cable (cable.id)}
                  <tr>
                    <td class="mono">{cable.id}</td>
                    <td>{cable.cableType}</td>
                    <td>{cable.lengthM}</td>
                    <td>{cable.aDevice}/{cable.aPort}</td>
                    <td>{cable.bDevice}/{cable.bPort}</td>
                    <td>{cable.role}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>

        <section class="dim-section">
          <h3>Métadonnées d'équipement (catalogue Rackula)</h3>
          <div class="dim-settings">
            <label
              >Type
              <select bind:value={selectedSlug}>
                {#each slugs as slug (slug)}<option value={slug}>{slug}</option
                  >{/each}
              </select>
            </label>
            <label
              >Puissance (W)<input
                type="number"
                step="any"
                bind:value={metaPower}
              /></label
            >
            <label
              >TDP (W)<input
                type="number"
                step="any"
                bind:value={metaTdp}
              /></label
            >
            <label
              >PDU (A)<input
                type="number"
                step="any"
                bind:value={metaAmps}
              /></label
            >
            <label
              >PDU (V)<input
                type="number"
                step="any"
                bind:value={metaVolts}
              /></label
            >
            <label
              >Montage
              <select bind:value={metaMount}>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical (0U)</option>
              </select>
            </label>
            <button class="dim-btn" onclick={applyMeta}>
              Appliquer au type
            </button>
          </div>
          <p class="dim-hint">
            Valeurs enregistrées dans <code>custom_fields</code> (clés
            <code>dim.*</code>) du type Rackula : compatibles avec le schéma
            amont et prises en charge par l'undo/redo.
          </p>
        </section>

        <section class="dim-section">
          <h3>Paramètres de calcul</h3>
          <div class="dim-settings">
            <label
              >U (mm)<input
                type="number"
                step="any"
                bind:value={custom.uMm}
              /></label
            >
            <label
              >Boucle (mm)<input
                type="number"
                step="any"
                bind:value={custom.serviceLoopMm}
              /></label
            >
            <label
              >Horizontal (mm)<input
                type="number"
                step="any"
                bind:value={custom.horizontalMm}
              /></label
            >
            <label
              >Inter-baies (m)<input
                type="number"
                step="any"
                bind:value={custom.interRackM}
              /></label
            >
            <label
              >Marge<input
                type="number"
                step="0.05"
                bind:value={custom.slackFactor}
              /></label
            >
            <label
              >Arrondi (m)<input
                type="number"
                step="0.1"
                bind:value={custom.roundToM}
              /></label
            >
            <label
              >Tension PDU (V)<input
                type="number"
                step="any"
                bind:value={custom.pduVoltage}
              /></label
            >
            <label
              >Déclassement<input
                type="number"
                step="0.05"
                bind:value={custom.pduDerating}
              /></label
            >
            <button class="dim-btn ghost" onclick={resetSettings}
              >Réinitialiser</button
            >
          </div>
        </section>
      </div>

      <footer class="dim-foot">
        <button
          class="dim-btn"
          disabled={busy}
          onclick={() => runExport("xlsx")}>⬇ Excel (.xlsx)</button
        >
        <button class="dim-btn" disabled={busy} onclick={() => runExport("csv")}
          >⬇ CSV Google Sheets</button
        >
        <button
          class="dim-btn"
          disabled={busy}
          onclick={() => runExport("labels")}>🖨 Étiquettes</button
        >
      </footer>
    </div>
  </div>
{/if}

<style>
  .dim-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(8, 12, 20, 0.72);
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .dim-dialog {
    width: min(960px, 96vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: #1b1f2a;
    color: #e7e9ee;
    border: 1px solid #363c4d;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    font-family: "Segoe UI", Calibri, Arial, sans-serif;
  }
  .dim-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid #363c4d;
  }
  .dim-head h2 {
    margin: 0;
    font-size: 18px;
  }
  .dim-sub {
    margin: 4px 0 0;
    color: #9aa3b5;
    font-size: 12px;
  }
  .dim-close {
    background: none;
    border: 0;
    color: #e7e9ee;
    font-size: 18px;
    cursor: pointer;
  }
  .dim-body {
    overflow: auto;
    padding: 16px 20px;
  }
  .dim-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .dim-card {
    background: #242a38;
    border: 1px solid #363c4d;
    border-radius: 8px;
    padding: 10px 14px;
    min-width: 150px;
    display: flex;
    flex-direction: column;
  }
  .dim-card span {
    font-size: 11px;
    text-transform: uppercase;
    color: #9aa3b5;
  }
  .dim-card strong {
    font-size: 19px;
    margin: 3px 0;
  }
  .dim-card small {
    color: #b9c0cf;
  }
  .dim-section {
    margin-top: 18px;
  }
  .dim-section h3 {
    font-size: 14px;
    margin: 0 0 8px;
  }
  .dim-scroll {
    max-height: 190px;
    overflow: auto;
    border: 1px solid #363c4d;
    border-radius: 8px;
  }
  .dim-scroll-lg {
    max-height: 260px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    position: sticky;
    top: 0;
    background: #111827;
    color: #fff;
    text-align: left;
    padding: 6px 8px;
  }
  td {
    border-bottom: 1px solid #363c4d;
    padding: 5px 8px;
  }
  .mono {
    font-family: Consolas, monospace;
  }
  .dim-tag {
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    background: #334155;
  }
  .dim-tag.ok {
    background: #065f46;
  }
  .dim-tag.warning {
    background: #92400e;
  }
  .dim-tag.overload {
    background: #991b1b;
  }
  .dim-issue {
    margin: 4px 0;
    padding: 6px 9px;
    border-radius: 6px;
    font-size: 12px;
  }
  .dim-issue.error {
    background: #7f1d1d;
  }
  .dim-issue.warning {
    background: #78350f;
  }
  .dim-settings {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: end;
  }
  .dim-settings label {
    display: flex;
    flex-direction: column;
    font-size: 11px;
    color: #9aa3b5;
    gap: 3px;
  }
  .dim-settings input,
  .dim-settings select {
    background: #111827;
    color: #e7e9ee;
    border: 1px solid #475569;
    border-radius: 5px;
    padding: 5px 7px;
    width: 110px;
  }
  .dim-hint {
    color: #9aa3b5;
    font-size: 11px;
    margin: 8px 0 0;
  }
  .dim-hint code {
    font-family: Consolas, monospace;
    font-size: 10px;
  }
  .dim-foot {
    display: flex;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid #363c4d;
    flex-wrap: wrap;
  }
  .dim-btn {
    background: #2563eb;
    color: #fff;
    border: 0;
    border-radius: 6px;
    padding: 8px 13px;
    cursor: pointer;
    font: inherit;
  }
  .dim-btn.ghost {
    background: #334155;
  }
  .dim-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }
</style>

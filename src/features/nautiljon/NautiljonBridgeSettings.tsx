import { useState } from "react";
import { ToggleSwitch } from "@/components/common/ToggleSwitch";
import { isTauriRuntime } from "@/lib/platform";
import {
  getNautiljonBridgeSettings,
  setNautiljonBridgeSettings,
  testNautiljonBridge,
  type NautiljonBridgeSettings as BridgeSettings,
} from "@/services/nautiljonBridgeService";
import "./NautiljonBridgeSettings.css";

/**
 * @description Réglages du pont Nautiljon (VM Oracle / IP de secours).
 */
export function NautiljonBridgeSettingsCard() {
  const [settings, setSettings] = useState<BridgeSettings>(
    getNautiljonBridgeSettings,
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const canTest = isTauriRuntime();

  const persist = (patch: Partial<BridgeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setNautiljonBridgeSettings(next);
      return next;
    });
  };

  const handleTest = async () => {
    setBusy(true);
    setHint(null);
    try {
      const message = await testNautiljonBridge(settings);
      setHint(message);
    } catch (err) {
      setHint(
        err instanceof Error
          ? err.message
          : "Échec du test du pont Nautiljon.",
      );
    } finally {
      setBusy(false);
      window.setTimeout(() => setHint(null), 8000);
    }
  };

  return (
    <section className="control-panel-card nautiljon-bridge-card">
      <div className="nautiljon-bridge-head">
        <h2>Pont Nautiljon (IP Oracle)</h2>
        <ToggleSwitch
          checked={settings.enabled}
          label="Activer"
          title="Route les téléchargements Nautiljon via votre VM"
          onChange={(enabled) => persist({ enabled })}
        />
      </div>
      <p>
        Si Nautiljon bloque votre IP domicile (« BOT » / 403), lancez le script{" "}
        <code>tools/nautiljon-bridge/server.py</code> sur votre VM Oracle, ouvrez
        le port <code>8787</code>, puis renseignez l&apos;URL publique et le
        même token que <code>NAUTILJON_BRIDGE_TOKEN</code>.
      </p>
      <p className="nautiljon-bridge-note">
        Couvre recherche, fiches et planning. La fenêtre WebView interactive
        utilise encore l&apos;IP locale : préférez la recherche dans l&apos;app
        quand le pont est actif.
      </p>
      <label className="control-panel-field">
        <span>URL du pont</span>
        <input
          type="text"
          value={settings.url}
          placeholder="http://IP_PUBLIQUE_ORACLE:8787"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => persist({ url: event.target.value })}
        />
      </label>
      <label className="control-panel-field">
        <span>Token</span>
        <input
          type="password"
          value={settings.token}
          placeholder="Même valeur que NAUTILJON_BRIDGE_TOKEN"
          autoComplete="off"
          onChange={(event) => persist({ token: event.target.value })}
        />
      </label>
      <div className="control-panel-actions">
        <button
          type="button"
          className="ghost-action-btn"
          disabled={busy || !canTest}
          onClick={() => void handleTest()}
        >
          {busy ? "Test…" : "Tester le pont"}
        </button>
      </div>
      {hint ? (
        <p className="control-panel-job-status" role="status">
          {hint}
        </p>
      ) : null}
    </section>
  );
}

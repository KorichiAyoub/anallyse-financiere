import { useState, useEffect } from "react";
import { SheetType } from "./types";
import type { Company } from "./types";
import { useSheetData } from "./hooks/useFinancialData";
import FinancialTable from "./components/FinancialTable";
import ImportExport from "./components/ImportExport";
import LockScreen from "./components/LockScreen";
import CompanyManager from "./components/CompanyManager";
import Dashboard from "./components/Dashboard";
import RatiosFinanciers from "./components/RatiosFinanciers";
import BilanFonctionnel from "./components/BilanFonctionnel";
import { invokeTauri, isTauriRuntime } from "./lib/tauri";
import "./App.css";

type AppTab = SheetType | "DASHBOARD" | "RATIOS" | "BILAN_FONC";

const TABS: Array<{ id: AppTab; label: string; icon: string; group?: string }> = [
  { id: "DASHBOARD", label: "Tableau de bord", icon: "📊" },
  { id: "RATIOS",    label: "Ratios financiers", icon: "📐" },
  { id: "ACTIF",     label: "Actif",             icon: "🏦", group: "Bilan" },
  { id: "PASSIF",    label: "Passif",             icon: "📋", group: "Bilan" },
  { id: "TR",        label: "Compte de Résultat", icon: "📈", group: "Résultats" },
  { id: "BILAN",     label: "Bilan Financier",    icon: "⚖️",  group: "Résultats" },
  { id: "BILAN_FONC", label: "Bilan Fonctionnel", icon: "🔄", group: "Analyse" },
];

function AddYearModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [year, setYear] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    const y = parseInt(year);
    if (isNaN(y) || y < 2000 || y > 2100) { setErr("Année invalide"); return; }
    await invokeTauri("add_year", { year: y });
    onAdded();
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-72">
        <h3 className="font-bold text-lg mb-4 dark:text-white">Ajouter une année</h3>
        <input
          type="number"
          className="border rounded-lg w-full px-3 py-2 mb-3 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          placeholder="ex: 2025"
          value={year}
          onChange={e => setYear(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          autoFocus
        />
        {err && <p className="text-red-500 text-sm mb-2">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border hover:bg-gray-100 dark:border-slate-600 dark:hover:bg-slate-700 dark:text-white">Annuler</button>
          <button onClick={submit} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500">Ajouter</button>
        </div>
      </div>
    </div>
  );
}

// ── Amortissements & Provisions panel (shown below ACTIF table) ───────────────

interface AmortRow {
  amort_key: string;
  amort: number;
}

const AMORT_LABELS: Record<string, string> = {
  imm_incorp: "Amort. Immo. Incorporelles (Cpte 28)",
  imm_corp:   "Amort. Immo. Corporelles (Cpte 28)",
  stocks:     "Prov. Dépréciation Stocks (Cpte 39)",
  creances:   "Prov. Dépréciation Créances (Cpte 49)",
};
const AMORT_KEYS = ["imm_incorp", "imm_corp", "stocks", "creances"] as const;

function AmortPanel({ years }: { years: number[] }) {
  // map: year -> amort_key -> value
  const [amorts, setAmorts] = useState<Record<number, Record<string, number>>>({});
  const [editing, setEditing] = useState<Record<string, string>>({});
  const tauriMode = isTauriRuntime();

  useEffect(() => {
    if (!tauriMode) return;
    (async () => {
      const next: Record<number, Record<string, number>> = {};
      for (const y of years) {
        const rows = await invokeTauri<AmortRow[]>("get_actif_amorts", { year: y });
        next[y] = Object.fromEntries(rows.map(r => [r.amort_key, r.amort]));
      }
      setAmorts(next);
    })();
  }, [years, tauriMode]);

  const cellKey = (k: string, y: number) => `${k}-${y}`;

  const handleFocus = (k: string, y: number) => {
    const cur = amorts[y]?.[k] ?? 0;
    setEditing(p => ({ ...p, [cellKey(k, y)]: cur === 0 ? "" : String(cur) }));
  };

  const handleChange = (k: string, y: number, val: string) => {
    setEditing(p => ({ ...p, [cellKey(k, y)]: val }));
  };

  const handleBlur = async (k: string, y: number) => {
    const raw = editing[cellKey(k, y)];
    if (raw === undefined) return;
    const parsed = parseFloat(raw.replace(/\s/g, "").replace(",", "."));
    const value = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setEditing(p => { const n = { ...p }; delete n[cellKey(k, y)]; return n; });
    setAmorts(p => ({ ...p, [y]: { ...(p[y] ?? {}), [k]: value } }));
    if (tauriMode) {
      await invokeTauri("set_actif_amort", { year: y, amortKey: k, amort: value });
    }
  };

  const fmt = (v: number) =>
    v === 0 ? "—" : new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(v);

  return (
    <div className="mx-4 mb-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-amber-200 dark:border-amber-700 overflow-hidden">
      <div className="bg-amber-600 px-4 py-2.5 flex items-center gap-2">
        <span className="text-white text-sm">📐</span>
        <h3 className="text-white font-bold text-sm tracking-wide">
          Amortissements &amp; Provisions Cumulés — Colonne Amort/Dép du Bilan
        </h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 px-4 pt-2 pb-1 italic">
        Saisir les montants cumulés de la colonne «&nbsp;Amort./Dép.&nbsp;» de votre bilan comptable.
        Ces données alimentent automatiquement le journal de retraitement du bilan fonctionnel.
      </p>
      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full text-sm border-collapse mt-2">
          <thead>
            <tr className="bg-amber-50 dark:bg-amber-900/20 border-b-2 border-amber-200 dark:border-amber-700">
              <th className="text-left py-2 px-3 font-semibold text-amber-800 dark:text-amber-300">Poste</th>
              {years.map(y => (
                <th key={y} className="text-right py-2 px-3 font-semibold text-amber-800 dark:text-amber-300 w-36">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {AMORT_KEYS.map((k, i) => (
              <tr key={k} className={i % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-amber-50/40 dark:bg-amber-900/10"}>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">{AMORT_LABELS[k]}</td>
                {years.map(y => {
                  const ck = cellKey(k, y);
                  const isEditing = editing[ck] !== undefined;
                  const cur = amorts[y]?.[k] ?? 0;
                  return (
                    <td key={y} className="py-1 px-2">
                      {tauriMode ? (
                        <input
                          type="text"
                          className="w-full text-right font-mono px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-900 dark:text-amber-200"
                          value={isEditing ? editing[ck] : (cur === 0 ? "" : String(cur))}
                          placeholder="0"
                          onFocus={() => handleFocus(k, y)}
                          onChange={e => handleChange(k, y, e.target.value)}
                          onBlur={() => handleBlur(k, y)}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                      ) : (
                        <span className="block text-right font-mono text-slate-600 dark:text-slate-300 px-2">{fmt(cur)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-amber-100 dark:bg-amber-900/30 border-t-2 border-amber-300 dark:border-amber-600 font-bold">
              <td className="py-2 px-3 text-amber-900 dark:text-amber-200">Total Amort. + Provisions</td>
              {years.map(y => {
                const total = AMORT_KEYS.reduce((s, k) => s + (amorts[y]?.[k] ?? 0), 0);
                return (
                  <td key={y} className="py-2 px-3 text-right font-mono text-amber-900 dark:text-amber-200">{fmt(total)}</td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SheetView({ sheet, onCompanySwitch }: { sheet: SheetType; onCompanySwitch: number }) {
  const { data, loading, error, refresh, updateValue } = useSheetData(sheet);
  const [showAddYear, setShowAddYear] = useState(false);
  const tauriMode = isTauriRuntime();

  // Refresh when company changes
  useEffect(() => { refresh(); }, [onCompanySwitch]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-4 text-red-600">Erreur: {error}</div>;
  if (!data) return null;

  const isReadOnly = sheet === "BILAN" || !tauriMode;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-3">
        <ImportExport sheet={sheet} data={data} onImportDone={refresh} />
        {tauriMode && !isReadOnly && (
          <button onClick={() => setShowAddYear(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-600 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
            + Ajouter une année
          </button>
        )}
      </div>
      <div className="px-4 pb-4">
        <FinancialTable data={data} sheet={sheet} onUpdate={updateValue} readOnly={isReadOnly} />
      </div>
      {sheet === "ACTIF" && <AmortPanel years={data.years} />}
      {showAddYear && <AddYearModal onClose={() => setShowAddYear(false)} onAdded={refresh} />}
    </div>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("DASHBOARD");
  const [showCompanyMgr, setShowCompanyMgr] = useState(false);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [companySwitchKey, setCompanySwitchKey] = useState(0);
  const tauriMode = isTauriRuntime();

  useEffect(() => {
    if (!tauriMode) {
      setAuthChecked(true);
      setUnlocked(true);
      return;
    }
    (async () => {
      try {
        const pinExists = await invokeTauri<boolean>("has_pin");
        setHasPin(pinExists);
        if (!pinExists) setUnlocked(true);
        const company = await invokeTauri<Company | null>("get_active_company");
        setActiveCompany(company);
      } catch {
        setUnlocked(true);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const handleCompanySwitch = (c: Company) => {
    setActiveCompany(c);
    setCompanySwitchKey((k) => k + 1);
    setShowCompanyMgr(false);
  };

  if (!authChecked) return null;

  if (!unlocked) {
    return (
      <LockScreen
        hasPin={hasPin}
        onUnlock={() => setUnlocked(true)}
      />
    );
  }

  return (
    <div className="h-screen bg-slate-100 flex overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 flex flex-col shadow-xl">
        {/* Logo / app name */}
        <div className="px-4 py-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📊</span>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">Analyse Financière</p>
              <p className="text-slate-400 text-xs leading-tight truncate">SCF Algérien</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {/* Ungrouped (Dashboard + Ratios) */}
          {TABS.filter((t) => !t.group).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </button>
          ))}

          {/* Grouped sections */}
          {["Bilan", "Résultats", "Analyse"].map((group) => (
            <div key={group} className="pt-4">
              <p className="px-3 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">{group}</p>
              {TABS.filter((t) => t.group === group).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span className="truncate">{tab.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom: company switcher */}
        <div className="border-t border-slate-700/60 p-3 space-y-2">
          {tauriMode ? (
            <button
              onClick={() => setShowCompanyMgr(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left"
            >
              <span className="text-base">🏢</span>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-medium truncate leading-tight">
                  {activeCompany?.name ?? "Mon Entreprise"}
                </p>
                <p className="text-slate-500 text-xs truncate leading-tight">Changer →</p>
              </div>
            </button>
          ) : (
            <div className="px-3 py-2 rounded-lg bg-amber-900/40 border border-amber-700/40">
              <p className="text-amber-400 text-xs font-medium">Mode démo</p>
              <p className="text-amber-500/70 text-xs">Données de démonstration</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3.5 flex items-center gap-3 shadow-sm">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-800 text-base leading-tight truncate">
              {TABS.find((t) => t.id === activeTab)?.label ?? ""}
            </h2>
            {activeCompany && (
              <p className="text-slate-400 text-xs truncate">{activeCompany.name}</p>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-slate-50">
          {(activeTab === "DASHBOARD" || activeTab === "RATIOS") ? (
            <DashboardWrapper activeTab={activeTab} companySwitchKey={companySwitchKey} />
          ) : activeTab === "BILAN_FONC" ? (
            <BilanFonctionnel key={companySwitchKey} companySwitchKey={companySwitchKey} />
          ) : (
            <div className="bg-white shadow-sm m-4 rounded-xl border border-slate-200">
              <SheetView key={`${activeTab}-${companySwitchKey}`} sheet={activeTab as SheetType} onCompanySwitch={companySwitchKey} />
            </div>
          )}
        </main>
      </div>

      {showCompanyMgr && (
        <CompanyManager
          active={activeCompany}
          onSwitch={handleCompanySwitch}
          onClose={() => setShowCompanyMgr(false)}
        />
      )}
    </div>
  );
}

function DashboardWrapper({ activeTab, companySwitchKey }: { activeTab: AppTab; companySwitchKey: number }) {
  const actifHook = useSheetData("ACTIF");
  const passifHook = useSheetData("PASSIF");
  const trHook = useSheetData("TR");

  useEffect(() => {
    actifHook.refresh();
    passifHook.refresh();
    trHook.refresh();
  }, [companySwitchKey]);

  const loading = actifHook.loading || passifHook.loading || trHook.loading;
  const error = actifHook.error || passifHook.error || trHook.error;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Chargement des données…</div>;
  if (error) return <div className="p-4 text-red-600">Erreur: {error}</div>;
  if (!actifHook.data || !passifHook.data || !trHook.data) return null;

  return (
    <div className="p-4">
      {activeTab === "DASHBOARD" && (
        <Dashboard actif={actifHook.data} passif={passifHook.data} tr={trHook.data} />
      )}
      {activeTab === "RATIOS" && (
        <RatiosFinanciers actif={actifHook.data} passif={passifHook.data} tr={trHook.data} />
      )}
    </div>
  );
}

export default App;


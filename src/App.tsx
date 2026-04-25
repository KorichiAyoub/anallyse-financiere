import { useState } from "react";
import { SheetType } from "./types";
import { useSheetData } from "./hooks/useFinancialData";
import FinancialTable from "./components/FinancialTable";
import ImportExport from "./components/ImportExport";
import { invokeTauri, isTauriRuntime } from "./lib/tauri";
import "./App.css";

const TABS: Array<{ id: SheetType; label: string }> = [
  { id: "ACTIF", label: "ACTIF" },
  { id: "PASSIF", label: "PASSIF" },
  { id: "TR", label: "Compte de Résultat" },
  { id: "BILAN", label: "Bilan Financier" },
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
      <div className="bg-white rounded-lg shadow-xl p-6 w-72">
        <h3 className="font-bold text-lg mb-4">Ajouter une année</h3>
        <input
          type="number"
          className="border rounded w-full px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="ex: 2025"
          value={year}
          onChange={e => setYear(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          autoFocus
        />
        {err && <p className="text-red-500 text-sm mb-2">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border hover:bg-gray-100">Annuler</button>
          <button onClick={submit} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Ajouter</button>
        </div>
      </div>
    </div>
  );
}

function SheetView({ sheet }: { sheet: SheetType }) {
  const { data, loading, error, refresh, updateValue } = useSheetData(sheet);
  const [showAddYear, setShowAddYear] = useState(false);
  const tauriMode = isTauriRuntime();

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Chargement…</div>;
  if (error) return <div className="p-4 text-red-600">Erreur: {error}</div>;
  if (!data) return null;

  const isReadOnly = sheet === "BILAN" || !tauriMode;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2 px-4 pt-3">
        <ImportExport sheet={sheet} data={data} onImportDone={refresh} />
        {tauriMode && !isReadOnly && (
          <button
            onClick={() => setShowAddYear(true)}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-100 text-slate-600"
          >
            + Ajouter une année
          </button>
        )}
      </div>
      <div className="px-4 pb-4">
        <FinancialTable data={data} sheet={sheet} onUpdate={updateValue} readOnly={isReadOnly} />
      </div>
      {showAddYear && (
        <AddYearModal onClose={() => setShowAddYear(false)} onAdded={refresh} />
      )}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<SheetType>("ACTIF");
  const tauriMode = isTauriRuntime();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-slate-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <span className="text-xl">📊</span>
        <div>
          <h1 className="font-bold text-base leading-none">Analyse Financière</h1>
          <p className="text-slate-400 text-xs">Format SCF Algérien</p>
        </div>
      </header>
      <nav className="bg-white border-b border-slate-200 flex">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-700 bg-blue-50"
                : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-auto bg-white shadow-sm mx-4 my-4 rounded-lg border border-slate-200">
        {!tauriMode && (
          <div className="mx-4 mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Mode navigateur: donnees de demonstration uniquement. Import/export et sauvegarde locale sont disponibles dans l'app desktop Tauri.
          </div>
        )}
        <SheetView key={activeTab} sheet={activeTab} />
      </main>
    </div>
  );
}

export default App;


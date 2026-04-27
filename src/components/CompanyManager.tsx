import { useState, useEffect } from "react";
import { invokeTauri } from "../lib/tauri";
import type { Company, CompanyInput } from "../types";

interface Props {
  active: Company | null;
  onSwitch: (c: Company) => void;
  onClose: () => void;
}

const empty: CompanyInput = { name: "", nif: "", rc: "", capital: 0, activite: "", wilaya: "" };

export default function CompanyManager({ active, onSwitch, onClose }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyInput>(empty);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const list = await invokeTauri<Company[]>("list_companies");
    setCompanies(list);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Le nom est requis"); return; }
    setError("");
    try {
      if (editing) {
        await invokeTauri("update_company", { id: editing.id, input: form });
      } else {
        await invokeTauri("add_company", { input: form });
      }
      setForm(empty);
      setEditing(null);
      setAdding(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const handleDelete = async (id: number) => {
    if (companies.length <= 1) { setError("Impossible de supprimer la seule entreprise"); return; }
    await invokeTauri("delete_company", { id });
    await load();
  };

  const handleSwitch = async (c: Company) => {
    await invokeTauri("set_active_company", { id: c.id });
    onSwitch(c);
  };

  const wilayas = [
    "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
    "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
    "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
    "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
    "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
    "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
    "Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès",
    "In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Meniaa",
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Gestion des Entreprises</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {companies.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-4 flex items-center gap-3 ${
                active?.id === c.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-white truncate">{c.name}</p>
                {c.nif && <p className="text-xs text-slate-500">NIF: {c.nif}</p>}
                {c.wilaya && <p className="text-xs text-slate-500">{c.wilaya}</p>}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {active?.id !== c.id && (
                  <button
                    onClick={() => handleSwitch(c)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                  >
                    Activer
                  </button>
                )}
                <button
                  onClick={() => { setEditing(c); setForm({ name: c.name, nif: c.nif, rc: c.rc, capital: c.capital, activite: c.activite, wilaya: c.wilaya }); setAdding(true); }}
                  className="px-3 py-1 text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {!adding && (
            <button
              onClick={() => { setAdding(true); setEditing(null); setForm(empty); }}
              className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-500 hover:text-blue-600 hover:border-blue-400 transition-colors"
            >
              + Ajouter une entreprise
            </button>
          )}

          {adding && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-slate-700 dark:text-white">
                {editing ? "Modifier l'entreprise" : "Nouvelle entreprise"}
              </h3>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-500 block mb-1">Raison sociale *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-700 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">NIF</label>
                  <input value={form.nif} onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-700 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">RC</label>
                  <input value={form.rc} onChange={(e) => setForm((f) => ({ ...f, rc: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-700 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Capital social (DA)</label>
                  <input type="number" value={form.capital} onChange={(e) => setForm((f) => ({ ...f, capital: Number(e.target.value) }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-700 dark:text-white" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Wilaya</label>
                  <select value={form.wilaya} onChange={(e) => setForm((f) => ({ ...f, wilaya: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-700 dark:text-white">
                    <option value="">Sélectionner...</option>
                    {wilayas.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-500 block mb-1">Activité</label>
                  <input value={form.activite} onChange={(e) => setForm((f) => ({ ...f, activite: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm dark:bg-slate-700 dark:text-white" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setAdding(false); setEditing(null); setError(""); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Annuler</button>
                <button onClick={handleSave}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500">
                  {editing ? "Enregistrer" : "Créer"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

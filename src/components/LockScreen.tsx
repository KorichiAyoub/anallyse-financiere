import { useState } from "react";
import { invokeTauri } from "../lib/tauri";

interface Props {
  onUnlock: () => void;
  hasPin: boolean;
}

export default function LockScreen({ onUnlock, hasPin }: Props) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length < 6) setPin((p) => p + d);
  };
  const handleDelete = () => setPin((p) => p.slice(0, -1));

  const handleSubmit = async () => {
    if (pin.length < 4) { setError("Le PIN doit contenir au moins 4 chiffres"); return; }
    setLoading(true);
    setError("");
    try {
      if (!hasPin) {
        if (pin !== confirm) { setError("Les PINs ne correspondent pas"); setPin(""); setConfirm(""); return; }
        await invokeTauri<void>("setup_pin", { pin });
        onUnlock();
      } else {
        const ok = await invokeTauri<boolean>("verify_pin", { pin });
        if (ok) { onUnlock(); }
        else { setError("PIN incorrect"); setPin(""); }
      }
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="bg-slate-800 rounded-2xl p-8 w-80 shadow-2xl flex flex-col items-center gap-6">
        <div className="text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-white text-xl font-bold">Analyse Financière</h1>
          <p className="text-slate-400 text-sm mt-1">
            {hasPin ? "Entrez votre PIN pour accéder" : "Créez un PIN de sécurité"}
          </p>
        </div>

        {/* PIN dots */}
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all ${
                i < pin.length ? "bg-blue-500 border-blue-500" : "border-slate-500"
              }`}
            />
          ))}
        </div>

        {!hasPin && (
          <>
            <p className="text-slate-400 text-xs">Confirmer le PIN :</p>
            <div className="flex gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    i < confirm.length ? "bg-emerald-500 border-emerald-500" : "border-slate-500"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {digits.map((d, i) => (
            <button
              key={i}
              onClick={() => {
                if (d === "⌫") {
                  if (!hasPin && pin.length === 6) setConfirm((c) => c.slice(0, -1));
                  else handleDelete();
                } else if (d !== "") {
                  if (!hasPin && pin.length === 6 && confirm.length < 6) setConfirm((c) => c + d);
                  else handleDigit(d);
                }
              }}
              disabled={loading || d === ""}
              className={`h-14 rounded-xl text-white font-semibold text-lg transition-all ${
                d === ""
                  ? "invisible"
                  : "bg-slate-700 hover:bg-slate-600 active:scale-95"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading || pin.length < 4}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl font-semibold transition-all"
        >
          {loading ? "..." : hasPin ? "Déverrouiller" : "Créer le PIN"}
        </button>
      </div>
    </div>
  );
}

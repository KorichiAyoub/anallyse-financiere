import { invoke } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error("Mode navigateur: API Tauri indisponible. Lancez l'app desktop Tauri pour les operations natives.");
  }

  return invoke<T>(command, args);
}

// Stockage du contenu réel des fichiers importés (blob URLs en mémoire +
// base64 localStorage pour les fichiers ≤ 3 Mo).
// Les fichiers plus lourds sont conservés uniquement pour la session courante.

const LS_PREFIX = 'sf_fc_';
const MAX_PERSIST = 3 * 1024 * 1024; // 3 Mo

// Blob URLs in-memory (perdus au rechargement pour les gros fichiers)
const blobUrls = new Map<string, string>();

// Charge le base64 depuis localStorage pour un id donné
function loadFromStorage(id: string): string | null {
  try { return localStorage.getItem(LS_PREFIX + id); } catch { return null; }
}

function saveToStorage(id: string, dataUrl: string): void {
  try { localStorage.setItem(LS_PREFIX + id, dataUrl); } catch { /* quota dépassé */ }
}

function removeFromStorage(id: string): void {
  try { localStorage.removeItem(LS_PREFIX + id); } catch { /* noop */ }
}

/** Enregistre le contenu d'un fichier importé par l'utilisateur. */
export function setFileContent(id: string, file: File): void {
  const url = URL.createObjectURL(file);
  blobUrls.set(id, url);

  // Persiste en base64 si le fichier est assez petit
  if (file.size <= MAX_PERSIST) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') saveToStorage(id, reader.result);
    };
    reader.readAsDataURL(file);
  }
}

/** Retourne une URL utilisable pour l'aperçu, ou null si le contenu est absent. */
export function getFileContent(id: string): string | null {
  if (blobUrls.has(id)) return blobUrls.get(id)!;
  const stored = loadFromStorage(id);
  return stored ?? null;
}

/** Supprime le contenu (lors d'une suppression de fichier). */
export function removeFileContent(id: string): void {
  const url = blobUrls.get(id);
  if (url) { URL.revokeObjectURL(url); blobUrls.delete(id); }
  removeFromStorage(id);
}

/** Retourne true si un contenu est disponible pour cet id. */
export function hasFileContent(id: string): boolean {
  return blobUrls.has(id) || loadFromStorage(id) !== null;
}

import { api } from "./api";

// Envoie un fichier de chantier directement depuis le navigateur vers
// Cloudinary, avec une signature délivrée par le serveur (qui vérifie d'abord
// l'accès au chantier). Le fichier est stocké en accès privé (« authenticated ») :
// il ne se lit ensuite que via /api/documents/:id/fichier.
// Renvoie la réponse de Cloudinary à transmettre telle quelle à api.addDocument.
export async function uploadToCloudinary(file, { chantierId, lotId }) {
  const extension = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
  const { upload } = await api.signDocumentUpload(chantierId, lotId, extension);
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", upload.apiKey);
  form.append("timestamp", String(upload.timestamp));
  form.append("public_id", upload.public_id);
  form.append("type", upload.type);
  form.append("signature", upload.signature);

  const res = await fetch(upload.uploadUrl, { method: "POST", body: form });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // réponse illisible : message générique ci-dessous
  }
  if (!res.ok || !data) {
    throw new Error(data?.error?.message || "Échec de l'envoi du fichier.");
  }
  return {
    public_id: data.public_id,
    version: data.version,
    signature: data.signature,
    resource_type: data.resource_type,
    format: data.format,
    type: data.type,
  };
}

// Envoie un fichier directement depuis le navigateur vers Cloudinary (aucun
// mot de passe secret n'est nécessaire côté client : seul un "upload preset"
// non signé, prévu pour ça, est utilisé). Le serveur ne reçoit que l'URL
// obtenue en retour, jamais le fichier lui-même.
export async function uploadToCloudinary(file) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !preset) {
    throw new Error("Le stockage des fichiers n'est pas configuré (variables VITE_CLOUDINARY_* manquantes).");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", preset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Échec de l'envoi du fichier.");
  }
  return data.secure_url;
}

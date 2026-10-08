// Côté navigateur : détection de la web app installée et abonnement aux
// notifications push. Sur iPhone, les notifications web ne fonctionnent que
// depuis l'app installée sur l'écran d'accueil (iOS 16.4 ou plus récent).
import { api } from "./api";

export function isIos() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function base64UrlToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing || navigator.serviceWorker.register("/sw.js");
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// À appeler depuis un clic (exigence d'iOS pour demander l'autorisation).
export async function enablePush() {
  if (!pushSupported()) throw new Error("Ce navigateur ne gère pas les notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées. Tu peux les réautoriser dans les réglages de l'appareil.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.pushPublicKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey) });
  }
  const { prefs } = await api.pushSubscribe(sub.toJSON());
  return { endpoint: sub.endpoint, prefs };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

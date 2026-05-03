import { api } from "./client";

export async function registerPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register("/sw.js");

    // Check if already subscribed
    const existing = await reg.pushManager.getSubscription();
    if (existing) return; // already registered

    // Get VAPID public key
    const { data } = await api.get("/push/vapid-public");
    if (!data?.publicKey) return;

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    // Subscribe
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });

    // Save to server
    await api.post("/push/subscribe", { subscription });
  } catch {
    // Non-critical — silently fail
  }
}

export async function unregisterPushNotifications() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await api.post("/push/unsubscribe");
  } catch {
    // Non-critical
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

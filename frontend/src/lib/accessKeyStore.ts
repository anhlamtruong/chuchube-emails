/**
 * Centralised access-key storage.
 *
 * Uses `sessionStorage` (cleared on browser close) instead of `localStorage`
 * for improved security.  A `BroadcastChannel` syncs the key across tabs
 * so users don't have to re-enter it when opening a second tab.
 */

const STORAGE_KEY = "access_key";
const CHANNEL_NAME = "access_key_channel";

type Message = { type: "set"; value: string } | { type: "clear" };

// Lazily created BroadcastChannel — safe if the API is unavailable (e.g. SSR)
let _channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (_channel) return _channel;
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    // BroadcastChannel not supported — degrade silently
  }
  return _channel;
}

// ── Public API ──────────────────────────────────────────────────────── //

/** Read the access key from session storage. */
export function getAccessKey(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

/** Store the access key and broadcast to other tabs. */
export function setAccessKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key);
  getChannel()?.postMessage({ type: "set", value: key } satisfies Message);
}

/** Remove the access key and broadcast to other tabs. */
export function clearAccessKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  getChannel()?.postMessage({ type: "clear" } satisfies Message);
}

/**
 * Listen for access-key changes from other tabs.
 *
 * @param onSet  Called when another tab stores a key.
 * @param onClear Called when another tab clears the key.
 * @returns A cleanup function to unsubscribe.
 */
export function listenForAccessKey(
  onSet: (key: string) => void,
  onClear: () => void,
): () => void {
  const channel = getChannel();
  if (!channel) return () => {};

  const handler = (ev: MessageEvent<Message>) => {
    if (ev.data?.type === "set") {
      sessionStorage.setItem(STORAGE_KEY, ev.data.value);
      onSet(ev.data.value);
    } else if (ev.data?.type === "clear") {
      sessionStorage.removeItem(STORAGE_KEY);
      onClear();
    }
  };

  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}

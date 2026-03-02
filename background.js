/*
 * Tab Organiser — Manifest V3 Service Worker
 *
 * Handles background events that occur when the popup is closed:
 *  1. First-install storage initialisation
 *  2. Pending-group cleanup when native groups are renamed to match
 */

// ─── Install / Update ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ comments: {}, pendingGroups: [] });
  }
});

// ─── Pending-group sync ──────────────────────────────────────────────────────
// If the user (or another extension) creates / renames a native tab group whose
// title matches a pending group we stored, that pending entry is now redundant.

chrome.tabGroups.onUpdated.addListener(async (group) => {
  if (!group.title) return;

  const data = await chrome.storage.sync.get('pendingGroups');
  const pending = data.pendingGroups || [];
  if (pending.length === 0) return;

  const cleaned = pending.filter((pg) => pg.title !== group.title);
  if (cleaned.length < pending.length) {
    await chrome.storage.sync.set({ pendingGroups: cleaned });
  }
});

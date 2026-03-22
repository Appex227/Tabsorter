/*
 * Tab Organiser — Manifest V3 Service Worker
 *
 * Handles background events that occur when the popup is closed:
 *  1. First-install storage initialisation
 *  2. Pending-group cleanup when native groups are renamed to match
 *  3. Comment-title sync on browser startup and group restoration
 */

const SEP = ' \u00B7 '; // " · "

// ─── Install / Update ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({ comments: {}, pendingGroups: [] });
  }
});

// ─── Sync comments into Chrome group titles ─────────────────────────────────
// Ensures the tab strip and bookmarks-bar saved groups always display
// "name · comment". Runs on startup and whenever a group is created/restored.

async function syncTitles() {
  const data = await chrome.storage.sync.get('comments');
  const comments = data.comments || {};
  if (Object.keys(comments).length === 0) return;

  const groups = await chrome.tabGroups.query({});
  for (const g of groups) {
    for (const [name, text] of Object.entries(comments)) {
      if (!text) continue;
      const expected = name + SEP + text;
      if (g.title === name || g.title === expected) {
        if (g.title !== expected) {
          try { await chrome.tabGroups.update(g.id, { title: expected }); } catch {}
        }
        break;
      }
    }
  }
}

chrome.runtime.onStartup.addListener(syncTitles);
chrome.tabGroups.onCreated.addListener(() => setTimeout(syncTitles, 500));

// ─── Pending-group cleanup ───────────────────────────────────────────────────

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

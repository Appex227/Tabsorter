(function () {
  'use strict';

  // ─── SVG Icons (stroke 1.5, 16×16 viewBox, Heroicons style) ────────────────

  const ICONS = {
    chevron:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>',
    drag:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="5.5" cy="3" r="1.2"/><circle cx="10.5" cy="3" r="1.2"/><circle cx="5.5" cy="8" r="1.2"/><circle cx="10.5" cy="8" r="1.2"/><circle cx="5.5" cy="13" r="1.2"/><circle cx="10.5" cy="13" r="1.2"/></svg>',
    remove:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    pencil:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5l3.5 3.5L5.5 14H2v-3.5z"/></svg>',
    trash:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4m2.5 0v9a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 012.5 13V4"/></svg>',
  };

  // ─── Chrome ↔ Extension colour mapping ──────────────────────────────────────

  const OUR_TO_CHROME = {
    red: 'red', orange: 'orange', yellow: 'yellow', green: 'green',
    teal: 'cyan', blue: 'blue', purple: 'purple', pink: 'pink', grey: 'grey',
  };
  const CHROME_TO_OURS = Object.fromEntries(
    Object.entries(OUR_TO_CHROME).map(([k, v]) => [v, k]),
  );

  // ─── Colour emoji for bookmark folders ──────────────────────────────────────

  const COLOR_EMOJI = {
    red: '\uD83D\uDD34', orange: '\uD83D\uDFE0', yellow: '\uD83D\uDFE1',
    green: '\uD83D\uDFE2', teal: '\uD83D\uDD35',  blue: '\uD83D\uDD35',
    purple: '\uD83D\uDFE3', pink: '\uD83D\uDD34',  grey: '\u26AA',
  };

  // ─── Comment separator (shown in Chrome's tab strip title) ─────────────────

  const SEP = ' \u00B7 '; // " · "

  function resolveGroup(chromeTitle) {
    // 1. Exact match: "name · comment" matches stored key+value
    for (const [key, val] of Object.entries(comments)) {
      if (val && chromeTitle === key + SEP + val) {
        return { name: key, comment: val };
      }
    }
    // 2. Prefix match: title starts with "key · " (handles changed comments)
    for (const key of Object.keys(comments)) {
      if (chromeTitle.startsWith(key + SEP)) {
        return { name: key, comment: comments[key] };
      }
    }
    // 3. Plain title matches a comment key directly
    if (comments[chromeTitle]) {
      return { name: chromeTitle, comment: comments[chromeTitle] };
    }
    // 4. No match — treat full title as the name
    return { name: chromeTitle, comment: '' };
  }

  // ─── DOM shortcut ───────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  // ─── Persistent state (chrome.storage.sync) ─────────────────────────────────

  let comments = {};
  let pendingGroups = [];

  async function loadStorage() {
    try {
      const data = await chrome.storage.sync.get(['comments', 'pendingGroups']);
      comments = data.comments || {};
      pendingGroups = data.pendingGroups || [];
    } catch (err) {
      console.error('[Tab Organiser] loadStorage failed:', err);
      comments = {};
      pendingGroups = [];
    }
  }

  async function saveComments() {
    try {
      await chrome.storage.sync.set({ comments });
    } catch (err) {
      console.error('[Tab Organiser] saveComments failed:', err);
    }
  }

  async function savePending() {
    try {
      await chrome.storage.sync.set({ pendingGroups });
    } catch (err) {
      console.error('[Tab Organiser] savePending failed:', err);
    }
  }

  // ─── Chrome API helpers ─────────────────────────────────────────────────────

  async function getTabs() {
    try {
      return await chrome.tabs.query({ currentWindow: true });
    } catch (err) {
      console.error('[Tab Organiser] getTabs failed:', err);
      return [];
    }
  }

  async function getTabGroups() {
    try {
      return await chrome.tabGroups.query({ windowId: (await chrome.windows.getCurrent()).id });
    } catch (err) {
      console.error('[Tab Organiser] getTabGroups failed:', err);
      return [];
    }
  }

  async function getCurrentWindowId() {
    return (await chrome.windows.getCurrent()).id;
  }

  async function getGroupById(id) {
    try {
      return await chrome.tabGroups.get(id);
    } catch (err) {
      console.error('[Tab Organiser] getGroupById(%d) failed:', id, err);
      return null;
    }
  }

  // ─── Tiny helpers ───────────────────────────────────────────────────────────

  function esc(str) {
    const el = document.createElement('span');
    el.textContent = str || '';
    return el.innerHTML;
  }

  function escAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '\u2026' : str;
  }

  // ─── HTML template: single tab row ──────────────────────────────────────────

  function tabRowHTML(tab, inGroup) {
    const fav = tab.favIconUrl
      ? `<img class="w-4 h-4 shrink-0 rounded-sm" src="${escAttr(tab.favIconUrl)}" alt="">`
      : '<span class="w-4 h-4 shrink-0 rounded-sm bg-th-border inline-block"></span>';

    const handle = `<span class="w-4 h-4 shrink-0 text-th-text-sec cursor-grab">${ICONS.drag}</span>`;

    const remove = inGroup
      ? `<button class="remove-btn w-4 h-4 shrink-0 text-th-destructive cursor-pointer" data-action="remove-tab" data-tab-id="${tab.id}" title="Remove from group">${ICONS.remove}</button>`
      : '';

    return `
      <div class="tab-row flex items-center gap-2 ${inGroup ? 'py-1' : 'px-4 py-2'} rounded select-none"
           draggable="true" data-tab-id="${tab.id}" data-drag-type="tab"
           data-action="activate-tab">
        ${inGroup ? handle : ''}
        ${fav}
        <span class="text-[13px] truncate flex-1">${esc(tab.title || 'Untitled')}</span>
        ${!inGroup ? handle : ''}
        ${remove}
      </div>`;
  }

  // ─── HTML template: group card ──────────────────────────────────────────────

  function groupCardHTML(g) {
    const dot       = `bg-grp-${g.color}`;
    const collapsed = g.collapsed;
    const comment   = truncate(g.comment, 30);

    let tabsInner = '';
    if (!collapsed) {
      tabsInner = g.tabs.length > 0
        ? g.tabs.map((t) => tabRowHTML(t, true)).join('')
        : '<p class="text-[12px] text-th-text-sec py-2 text-center select-none">Drag tabs here</p>';
    }

    return `
      <div class="group-card bg-th-surface border border-th-border rounded-lg p-3"
           data-group-id="${g.id}" data-group-type="${g.type}"
           draggable="true" data-drag-type="group">

        <div class="group-header flex items-center gap-2 cursor-pointer"
             data-action="toggle-collapse" data-group-id="${g.id}" data-group-type="${g.type}"
             title="${g.comment ? escAttr(g.comment) : ''}">
          <span class="w-2.5 h-2.5 rounded-full ${dot} shrink-0"></span>
          <span class="text-[13px] font-medium truncate">${esc(g.title)}</span>
          ${comment ? `<span class="text-[12px] text-th-text-sec italic truncate" style="max-width:120px">${esc(comment)}</span>` : ''}
          <span class="chevron w-4 h-4 shrink-0 text-th-text-sec ml-auto ${collapsed ? '' : 'expanded'}">${ICONS.chevron}</span>
        </div>

        <div class="group-tabs ${collapsed ? 'hidden' : ''} mt-2 pt-2 border-t border-th-border flex flex-col gap-1"
             data-drop-zone="${g.id}" data-group-type="${g.type}">
          ${tabsInner}
        </div>

        <div class="group-footer mt-2 pt-2 items-center justify-between text-[12px]">
          <button class="flex items-center gap-1 text-th-text-sec cursor-pointer hover:opacity-70"
                  data-action="edit-comment" data-group-id="${g.id}" data-group-type="${g.type}"
                  data-title="${escAttr(g.title)}" data-color="${g.color}">
            <span class="w-4 h-4">${ICONS.pencil}</span> Edit comment
          </button>
          <button class="flex items-center gap-1 text-th-text-sec cursor-pointer hover:opacity-70"
                  data-action="toggle-stack" data-group-id="${g.id}" data-group-type="${g.type}">
            <span class="w-4 h-4">${ICONS.chevron}</span> ${collapsed ? 'Unstack' : 'Stack'}
          </button>
          <button class="flex items-center gap-1 text-th-destructive cursor-pointer hover:opacity-70"
                  data-action="delete-group" data-group-id="${g.id}" data-group-type="${g.type}">
            <span class="w-4 h-4">${ICONS.trash}</span> Delete group
          </button>
        </div>
      </div>`;
  }

  // ─── Main render ────────────────────────────────────────────────────────────

  async function render() {
    const [tabs, nativeGroups] = await Promise.all([getTabs(), getTabGroups()]);

    const ungrouped = tabs.filter((t) => t.groupId === -1);

    const allGroups = [];

    for (const ng of nativeGroups) {
      const resolved = resolveGroup(ng.title);
      const storedComment = comments[resolved.name] || '';

      const expectedTitle = storedComment
        ? resolved.name + SEP + storedComment
        : resolved.name;
      if (ng.title !== expectedTitle) {
        try {
          await chrome.tabGroups.update(ng.id, { title: expectedTitle });
        } catch (err) {
          console.error('[Tab Organiser] title sync failed for group %d:', ng.id, err);
        }
      }

      allGroups.push({
        type: 'native',
        id: String(ng.id),
        numericId: ng.id,
        title: resolved.name,
        color: CHROME_TO_OURS[ng.color] || 'grey',
        collapsed: ng.collapsed,
        tabs: tabs.filter((t) => t.groupId === ng.id),
        comment: storedComment,
      });
    }

    for (const pg of pendingGroups) {
      allGroups.push({
        type: 'pending',
        id: pg.id,
        title: pg.title,
        color: pg.color,
        collapsed: false,
        tabs: [],
        comment: comments[pg.title] || '',
      });
    }

    const section = $('ungrouped-section');
    const list = $('ungrouped-list');
    if (ungrouped.length > 0) {
      section.classList.remove('hidden');
      list.innerHTML = ungrouped.map((t) => tabRowHTML(t, false)).join('');
    } else {
      section.classList.add('hidden');
      list.innerHTML = '';
    }

    $('groups-list').innerHTML = allGroups.map(groupCardHTML).join('');

    const allNativeCollapsed =
      nativeGroups.length > 0 && nativeGroups.every((g) => g.collapsed);
    $('btn-stack-toggle').textContent = allNativeCollapsed
      ? 'Unstack All'
      : 'Stack All';

    const hasContent = ungrouped.length > 0 || allGroups.length > 0;
    $('empty-state').classList.toggle('hidden', hasContent);
    $('empty-state').classList.toggle('flex', !hasContent);

    try {
      syncBookmarks(allGroups).catch((err) =>
        console.error('[Tab Organiser] bookmark sync failed:', err),
      );
    } catch (err) {
      console.error('[Tab Organiser] bookmark sync threw:', err);
    }
  }

  // ─── Bookmarks bar sync ───────────────────────────────────────────────────

  async function syncBookmarks(groups) {
    let barId;
    try {
      const tree = await chrome.bookmarks.getTree();
      barId = tree[0].children[0].id;
    } catch (err) {
      console.error('[Tab Organiser] bookmarks.getTree failed:', err);
      return;
    }

    const stored = await chrome.storage.local.get('bkmkMap');
    const oldMap = stored.bkmkMap || {};

    for (const id of Object.values(oldMap)) {
      try { await chrome.bookmarks.removeTree(id); } catch {}
    }

    const newMap = {};
    let idx = 0;

    for (const g of groups) {
      const emoji = COLOR_EMOJI[g.color] || '\u26AA';
      const label = g.comment
        ? `${emoji} ${g.title} \u00B7 ${g.comment}`
        : `${emoji} ${g.title}`;

      try {
        const folder = await chrome.bookmarks.create({
          parentId: barId,
          title: label,
          index: idx++,
        });
        newMap[g.title] = folder.id;

        for (const tab of g.tabs) {
          if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
          try {
            await chrome.bookmarks.create({
              parentId: folder.id,
              title: tab.title || 'Untitled',
              url: tab.url,
            });
          } catch (err) {
            console.error('[Tab Organiser] bookmark create failed:', err);
          }
        }
      } catch (err) {
        console.error('[Tab Organiser] folder create failed for "%s":', g.title, err);
      }
    }

    await chrome.storage.local.set({ bkmkMap: newMap });
  }

  // ─── Comment Modal ──────────────────────────────────────────────────────────

  let commentTitle = null;
  let commentGroupId = null;
  let commentDone = null;

  function showCommentModal(title, existing, groupId, onDone) {
    commentTitle = title;
    commentGroupId = groupId || null;
    commentDone = onDone || null;
    $('comment-group-name').textContent = title;
    const textarea = $('comment-input');
    textarea.value = existing || '';
    updateCounter();
    $('comment-overlay').classList.remove('hidden');
    setTimeout(() => textarea.focus(), 50);
  }

  function hideCommentModal() {
    $('comment-overlay').classList.add('hidden');
    const cb = commentDone;
    commentTitle = null;
    commentGroupId = null;
    commentDone = null;
    if (cb) cb();
  }

  function updateCounter() {
    $('comment-counter').textContent = `${$('comment-input').value.length} / 200`;
  }

  // ─── New Group form ─────────────────────────────────────────────────────────

  let selectedColor = 'blue';

  function resetForm() {
    $('group-name-input').value = '';
    selectedColor = 'blue';
    $('colour-picker').querySelectorAll('.colour-dot').forEach((d) => {
      d.classList.toggle('selected', d.dataset.color === 'blue');
    });
  }

  async function doCreateGroup() {
    const name = $('group-name-input').value.trim();
    if (!name) {
      $('group-name-input').focus();
      return;
    }

    $('new-group-form').classList.add('hidden');

    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    let createdGroupId = null;

    if (activeTab && activeTab.groupId === -1) {
      const url = activeTab.url || '';
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
        alert('Chrome internal pages cannot be grouped. Please switch to a regular webpage first.');
        $('new-group-form').classList.remove('hidden');
        $('group-name-input').value = name;
        return;
      }
      try {
        createdGroupId = await chrome.tabs.group({
          tabIds: [activeTab.id],
          createProperties: { windowId: activeTab.windowId },
        });
        const chromeColor = OUR_TO_CHROME[selectedColor] || 'blue';
        await chrome.tabGroups.update(createdGroupId, {
          title: name,
          color: chromeColor,
          collapsed: false,
        });
      } catch (err) {
        console.error('[Tab Organiser] doCreateGroup failed:', err);
        createdGroupId = null;
      }
    }

    if (!createdGroupId) {
      pendingGroups.push({
        id: 'p_' + Date.now(),
        title: name,
        color: selectedColor,
      });
      await savePending();
    }

    await render();
    showCommentModal(name, '', createdGroupId, async () => {
      await render();
    });
  }

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  let dragPayload = null;

  function onDragStart(e) {
    const el = e.target.closest('[draggable="true"]');
    if (!el) return;

    const dtype = el.dataset.dragType;
    if (dtype === 'tab') {
      dragPayload = { type: 'tab', tabId: parseInt(el.dataset.tabId, 10) };
    } else if (dtype === 'group') {
      dragPayload = {
        type: 'group',
        groupId: el.dataset.groupId,
        groupType: el.dataset.groupType,
      };
    } else {
      return;
    }

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    el.classList.add('dragging');
  }

  function onDragEnd(e) {
    const el = e.target.closest('[draggable="true"]');
    if (el) el.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach((x) =>
      x.classList.remove('drop-target'),
    );
    dragPayload = null;
  }

  function onDragOver(e) {
    if (!dragPayload) return;

    const card = e.target.closest('.group-card');
    const isOverContent = e.target.closest('#content');

    if (dragPayload.type === 'tab') {
      if (card || isOverContent) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (card) card.classList.add('drop-target');
      }
    } else if (dragPayload.type === 'group') {
      if (card && card.dataset.groupId !== dragPayload.groupId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drop-target');
      }
    }
  }

  function onDragLeave(e) {
    const card = e.target.closest('.group-card');
    if (card && !card.contains(e.relatedTarget)) {
      card.classList.remove('drop-target');
    }
  }

  async function onDrop(e) {
    e.preventDefault();
    document.querySelectorAll('.drop-target').forEach((x) =>
      x.classList.remove('drop-target'),
    );

    if (!dragPayload) return;

    if (dragPayload.type === 'tab') {
      await dropTab(e);
    } else if (dragPayload.type === 'group') {
      await dropGroup(e);
    }

    dragPayload = null;
    await render();
  }

  async function dropTab(e) {
    const tabId = dragPayload.tabId;
    const card = e.target.closest('.group-card');

    if (card) {
      const gid = card.dataset.groupId;
      const gtype = card.dataset.groupType;

      if (gtype === 'pending') {
        const pg = pendingGroups.find((p) => p.id === gid);
        if (!pg) return;
        try {
          const wid = await getCurrentWindowId();
          const newId = await chrome.tabs.group({
            tabIds: [tabId],
            createProperties: { windowId: wid },
          });
          const chromeColor = OUR_TO_CHROME[pg.color] || 'blue';
          await chrome.tabGroups.update(newId, {
            title: pg.title,
            color: chromeColor,
          });
          console.log('[Tab Organiser] materialised pending group %d: title="%s" color="%s"', newId, pg.title, chromeColor);
          pendingGroups = pendingGroups.filter((p) => p.id !== gid);
          await savePending();
        } catch (err) {
          console.error('[Tab Organiser] materialise pending group failed:', err);
        }
      } else {
        try {
          await chrome.tabs.group({
            tabIds: [tabId],
            groupId: parseInt(gid, 10),
          });
        } catch (err) {
          console.error('[Tab Organiser] add tab to group failed:', err);
        }
      }
    } else {
      try {
        await chrome.tabs.ungroup(tabId);
      } catch (err) {
        console.error('[Tab Organiser] ungroup tab failed:', err);
      }
    }
  }

  async function dropGroup(e) {
    const card = e.target.closest('.group-card');
    if (!card) return;

    const srcId = dragPayload.groupId;
    const tgtId = card.dataset.groupId;
    if (srcId === tgtId) return;

    if (dragPayload.groupType !== 'native' || card.dataset.groupType !== 'native') return;

    try {
      const allTabs = await getTabs();
      const tgtTabs = allTabs.filter((t) => t.groupId === parseInt(tgtId, 10));
      if (tgtTabs.length === 0) return;

      const tgtIndex = Math.min(...tgtTabs.map((t) => t.index));
      const srcTabs = allTabs.filter((t) => t.groupId === parseInt(srcId, 10));

      await chrome.tabs.move(
        srcTabs.map((t) => t.id),
        { index: tgtIndex },
      );
    } catch (err) {
      console.error('[Tab Organiser] reorder groups failed:', err);
    }
  }

  // ─── Stack / Unstack ───────────────────────────────────────────────────────

  async function toggleStackAll() {
    try {
      const groups = await getTabGroups();
      if (groups.length === 0) return;

      const allCollapsed = groups.every((g) => g.collapsed);
      await Promise.all(
        groups.map((g) =>
          chrome.tabGroups.update(g.id, { collapsed: !allCollapsed }),
        ),
      );
      await render();
    } catch (err) {
      console.error('[Tab Organiser] toggleStackAll failed:', err);
    }
  }

  // ─── Delete All Groups ──────────────────────────────────────────────────────

  async function deleteAllGroups() {
    const btn = $('btn-delete-all');

    if (btn.dataset.confirm !== 'true') {
      btn.textContent = 'Confirm?';
      btn.dataset.confirm = 'true';
      setTimeout(() => {
        btn.textContent = 'Delete All';
        btn.dataset.confirm = '';
      }, 2000);
      return;
    }

    btn.textContent = 'Delete All';
    btn.dataset.confirm = '';

    const groups = await getTabGroups();
    for (const g of groups) {
      try {
        const groupTabs = await chrome.tabs.query({ groupId: g.id });
        if (groupTabs.length > 0) {
          await chrome.tabs.ungroup(groupTabs.map((t) => t.id));
        }
      } catch (err) {
        console.error('[Tab Organiser] deleteAll ungroup failed for group %d:', g.id, err);
      }
    }

    pendingGroups = [];
    await savePending();
    await render();
  }

  // ─── Delegated click handler ────────────────────────────────────────────────

  async function handleAction(e) {
    const node = e.target.closest('[data-action]');
    if (!node) return;

    const action = node.dataset.action;

    switch (action) {
      case 'activate-tab': {
        if (e.target.closest('[data-action="remove-tab"]')) return;
        const id = parseInt(node.dataset.tabId, 10);
        chrome.tabs.update(id, { active: true });
        break;
      }

      case 'remove-tab': {
        e.stopPropagation();
        try {
          await chrome.tabs.ungroup(parseInt(node.dataset.tabId, 10));
        } catch (err) {
          console.error('[Tab Organiser] remove-tab failed:', err);
        }
        await render();
        break;
      }

      case 'toggle-collapse': {
        const gtype = node.dataset.groupType;
        if (gtype !== 'native') break;
        const gid = parseInt(node.dataset.groupId, 10);
        try {
          const g = await getGroupById(gid);
          if (g) await chrome.tabGroups.update(gid, { collapsed: !g.collapsed });
        } catch (err) {
          console.error('[Tab Organiser] toggle-collapse failed for group %d:', gid, err);
        }
        await render();
        break;
      }

      case 'toggle-stack': {
        e.stopPropagation();
        const gstype = node.dataset.groupType;
        if (gstype !== 'native') break;
        const gsid = parseInt(node.dataset.groupId, 10);
        try {
          const gs = await getGroupById(gsid);
          if (gs) await chrome.tabGroups.update(gsid, { collapsed: !gs.collapsed });
        } catch (err) {
          console.error('[Tab Organiser] toggle-stack failed for group %d:', gsid, err);
        }
        await render();
        break;
      }

      case 'edit-comment': {
        e.stopPropagation();
        const title = node.dataset.title;
        const ecGid = node.dataset.groupType === 'native' ? node.dataset.groupId : null;
        showCommentModal(title, comments[title] || '', ecGid, async () => {
          await render();
        });
        break;
      }

      case 'delete-group': {
        e.stopPropagation();
        const gtype = node.dataset.groupType;
        const gid = node.dataset.groupId;

        if (gtype === 'native') {
          try {
            const groupTabs = await chrome.tabs.query({
              groupId: parseInt(gid, 10),
            });
            if (groupTabs.length > 0) {
              await chrome.tabs.ungroup(groupTabs.map((t) => t.id));
            }
          } catch (err) {
            console.error('[Tab Organiser] delete-group failed for group %s:', gid, err);
          }
        } else {
          pendingGroups = pendingGroups.filter((p) => p.id !== gid);
          await savePending();
        }
        await render();
        break;
      }
    }
  }

  // ─── One-time event wiring ──────────────────────────────────────────────────

  function setupEvents() {
    $('btn-new-group').addEventListener('click', () => {
      resetForm();
      $('new-group-form').classList.remove('hidden');
      $('group-name-input').focus();
    });

    $('btn-cancel-group').addEventListener('click', () => {
      $('new-group-form').classList.add('hidden');
    });

    $('btn-create-group').addEventListener('click', doCreateGroup);

    $('group-name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCreateGroup();
      if (e.key === 'Escape') $('new-group-form').classList.add('hidden');
    });

    $('colour-picker').addEventListener('click', (e) => {
      const dot = e.target.closest('.colour-dot');
      if (!dot) return;
      selectedColor = dot.dataset.color;
      $('colour-picker')
        .querySelectorAll('.colour-dot')
        .forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });

    $('comment-input').addEventListener('input', updateCounter);

    $('btn-save-comment').addEventListener('click', async () => {
      if (commentTitle) {
        const text = $('comment-input').value.trim();
        comments[commentTitle] = text;
        await saveComments();

        if (commentGroupId) {
          const newTitle = text
            ? commentTitle + SEP + text
            : commentTitle;
          try {
            await chrome.tabGroups.update(
              parseInt(commentGroupId, 10),
              { title: newTitle },
            );
          } catch (err) {
            console.error('[Tab Organiser] comment title update failed:', err);
          }
        }
      }
      hideCommentModal();
    });

    $('btn-skip-comment').addEventListener('click', () => hideCommentModal());

    $('comment-overlay').addEventListener('click', (e) => {
      if (e.target === $('comment-overlay')) hideCommentModal();
    });

    document.addEventListener('keydown', (e) => {
      if (
        e.key === 'Escape' &&
        !$('comment-overlay').classList.contains('hidden')
      ) {
        hideCommentModal();
      }
    });

    $('btn-stack-toggle').addEventListener('click', toggleStackAll);
    $('btn-delete-all').addEventListener('click', deleteAllGroups);

    $('content').addEventListener('click', handleAction);

    $('content').addEventListener('error', (e) => {
      if (e.target.tagName === 'IMG') e.target.style.display = 'none';
    }, true);

    document.body.addEventListener('dragstart', onDragStart);
    document.body.addEventListener('dragend', onDragEnd);
    $('content').addEventListener('dragover', onDragOver);
    $('content').addEventListener('dragleave', onDragLeave);
    $('content').addEventListener('drop', onDrop);
  }

  // ─── Initialise ─────────────────────────────────────────────────────────────

  async function init() {
    await loadStorage();
    setupEvents();
    await render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

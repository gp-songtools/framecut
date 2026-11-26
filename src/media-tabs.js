// Media column tabs: Media, Stickers, Animations, Transitions, Effects.
// One tab shows its section; the rest stay in the DOM (hidden) so the panels that fill them keep working.
const MEDIA_TABS = {
  media: 'Media',
  stickers: 'Stickers and overlays',
  effects: 'Effects',
  animations: 'Animations',
  transitions: 'Transitions'
};
const MEDIA_TAB_KEY = 'framecut.mediaTab';

function showMediaTab(name, { focus = false } = {}) {
  if (!MEDIA_TABS[name]) name = 'media';
  for (const tab of document.querySelectorAll('#mediaTabs [role=tab]')) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const pane of document.querySelectorAll('#media .media-pane')) pane.hidden = pane.id !== 'mediaPane-' + name;
  document.getElementById('mediaTitle').textContent = MEDIA_TABS[name];
  document.getElementById('assetCount').hidden = name !== 'media';
  try { localStorage.setItem(MEDIA_TAB_KEY, name); } catch {}
}

(function setupMediaTabs() {
  const list = document.getElementById('mediaTabs');
  const names = Object.keys(MEDIA_TABS);
  list.addEventListener('click', event => {
    const tab = event.target.closest('[role=tab]');
    if (tab) showMediaTab(tab.dataset.tab);
  });
  list.addEventListener('keydown', event => {
    const current = names.indexOf(document.activeElement?.dataset?.tab);
    if (current < 0) return;
    const next = { ArrowRight: current + 1, ArrowDown: current + 1, ArrowLeft: current - 1, ArrowUp: current - 1, Home: 0, End: names.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showMediaTab(names[(next + names.length) % names.length], { focus: true });
  });
  // Files dropped on the column always land in the bin, so show it.
  document.getElementById('media').addEventListener('drop', event => {
    if (event.dataTransfer?.files?.length) showMediaTab('media');
  }, true);
  let saved = 'media';
  try { saved = localStorage.getItem(MEDIA_TAB_KEY) || 'media'; } catch {}
  showMediaTab(saved);
})();

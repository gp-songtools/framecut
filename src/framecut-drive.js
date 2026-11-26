'use strict';

// Google Drive for Framecut: the song's GP Song Tools folder (clips/, exports/, projects/).
// Every Drive action starts with SongDrive.signIn() straight from the click, before any await,
// so Google's sign-in popup is not blocked. Nothing here runs a request until a person clicks.

const exportToDriveKey = 'framecut.exportToDrive';
const driveProjectsLimit = 100;
let lastExport = null; // {blob, name, mime}: the newest finished export, in memory only
let driveBusy = false;

// Pure helpers (no DOM)

function driveError(error) {
  const code = error && error.code;
  if (code === 'auth') return 'Google sign-in expired. Click again to sign in.';
  if (code === 'cancelled') return 'Cancelled.';
  return (error && error.message) || 'Google Drive failed.';
}

// "Song.webm" -> "Song (2).webm" -> "Song (3).webm" ... the first name not in `taken`.
function uniqueDriveName(name, taken) {
  const used = taken instanceof Set ? taken : new Set(taken);
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const next = stem + ' (' + n + ')' + ext;
    if (!used.has(next)) return next;
  }
}

function driveSizeLabel(bytes) {
  const size = Number(bytes);
  if (!(size >= 0)) return '';
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + ' KB';
  if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB';
  return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

// Shared song folder

function driveCancelled() {
  return new SongDrive.SongDriveError('Cancelled.', { code: 'cancelled' });
}

// Finds (or with create, makes) this song's Drive folder, asking for a title first when the spec has none.
// Writes drive_folder into the shared spec when it was empty.
async function framecutSongFolder({ create }) {
  const readSpec = () => SongSpec.parse(SongSpec.store.load() || '');
  let doc = readSpec();
  if (!SongSpec.setting(doc, 'title').trim() && !SongSpec.setting(doc, 'drive_folder')) {
    if (!create) throw Error('This song has no Drive folder yet.');
    const title = (prompt('Song title for the Drive folder', $('project').value) || '').trim();
    if (!title) throw driveCancelled();
    SongSpec.store.update(target => SongSpec.setSetting(target, 'title', title, { by: 'person' }));
    doc = readSpec();
  }
  const folder = await SongDrive.songFolder(doc, {
    create,
    confirm: name => confirm('A Drive folder named "' + name + '" already exists in GP Song Tools. ' +
      'Use it for this song? Cancel makes a new folder instead.')
  });
  if (!folder) throw Error('This song has no Drive folder yet.');
  if (!SongSpec.setting(readSpec(), 'drive_folder')) {
    try {
      SongSpec.store.update(target => SongSpec.setSetting(target, 'drive_folder', folder.id, { by: 'framecut' }));
    } catch { /* the spec changed meanwhile; the folder is still found by title next time */ }
  }
  return folder;
}

// Runs one Drive action. Call it from a click handler: sign-in starts before the first await.
function driveAction(run) {
  if (driveBusy) {
    notify('Another Google Drive action is still running.');
    return Promise.resolve();
  }
  if (typeof SongDrive === 'undefined') {
    notify('Google Drive is not available in this build.');
    return Promise.resolve();
  }
  driveBusy = true;
  const signing = SongDrive.signIn();
  return (async () => {
    try {
      await signing;
      await run();
    } catch (error) {
      notify(driveError(error));
    } finally {
      driveBusy = false;
    }
  })();
}

async function uploadWithProgress(folderId, name, blob, options) {
  notify('Saving to Google Drive: 0%');
  return SongDrive.upload(folderId, name, blob, {
    ...options,
    onProgress: (sent, total) => notify('Saving to Google Drive: ' + (total ? Math.round(sent / total * 100) : 100) + '%')
  });
}

// Place clips from Drive

function placeClipsFromDrive() {
  return driveAction(async () => {
    notify('Looking for clips in Google Drive…');
    const folder = await framecutSongFolder({ create: false });
    const dir = await SongDrive.subfolder(folder.id, 'clips', { create: false });
    if (!dir) {
      notify("No clips folder in this song's Drive folder yet. Save clips to Drive in GP Producer first.");
      return;
    }
    const entries = (await SongDrive.list(dir.id))
      .map(file => ({ name: file.name, size: Number(file.size) || 0, type: file.mimeType, driveId: file.id }));
    if (!entries.length) {
      notify("The clips folder in this song's Drive folder is empty.");
      return;
    }
    notify('Found ' + entries.length + (entries.length === 1 ? ' file' : ' files') + ' in Google Drive.');
    startPlaceClips(entries, { source: 'drive', folderLabel: 'GP Song Tools / ' + folder.name + ' / clips' });
  });
}

// Exports

function rememberLastExport(blob, name, mime) {
  lastExport = { blob, name, mime };
  updateDriveMenu();
}

async function saveExportToDrive(entry) {
  const folder = await framecutSongFolder({ create: true });
  const dir = await SongDrive.subfolder(folder.id, 'exports', { create: true });
  const taken = new Set((await SongDrive.list(dir.id)).map(file => file.name));
  const name = uniqueDriveName(entry.name, taken);
  await uploadWithProgress(dir.id, name, entry.blob, { mimeType: entry.mime });
  notify('Saved ' + name + ' to Google Drive (GP Song Tools / ' + folder.name + ' / exports).');
}

// After an export with "Save to Google Drive too": a failure points at the retry in the Drive menu.
async function saveExportToDriveAfterExport(entry) {
  try {
    await saveExportToDrive(entry);
    return true;
  } catch (error) {
    notify(driveError(error) + ' Use Drive › Save last export to Drive to try again.');
    return false;
  }
}

function saveLastExportToDrive() {
  if (!lastExport) {
    notify('Export a video first.');
    return Promise.resolve();
  }
  return driveAction(() => saveExportToDrive(lastExport));
}

// Projects

function saveProjectToDrive() {
  if (openingProject || exporting) {
    notify('Wait until the current export or project open is done.');
    return Promise.resolve();
  }
  let built;
  let editState;
  try {
    built = buildProjectFileBlob();
    editState = projectEditState();
  } catch (error) {
    notify('Could not save project. ' + error.message);
    return Promise.resolve();
  }
  return driveAction(async () => {
    const folder = await framecutSongFolder({ create: true });
    const dir = await SongDrive.subfolder(folder.id, 'projects', { create: true });
    const existing = (await SongDrive.list(dir.id)).find(file => file.name === built.name);
    await uploadWithProgress(dir.id, built.name, built.blob, { mimeType: 'application/octet-stream', fileId: existing?.id });
    savedProjectState = editState;
    notify((existing ? 'Updated ' : 'Saved ') + built.name + ' in Google Drive (GP Song Tools / ' + folder.name + ' / projects).');
  });
}

function openProjectFromDrive() {
  return driveAction(async () => {
    notify('Looking for projects in Google Drive…');
    const folder = await framecutSongFolder({ create: false });
    const dir = await SongDrive.subfolder(folder.id, 'projects', { create: false });
    const files = dir ? (await SongDrive.list(dir.id)).filter(file => /\.framecut$/i.test(file.name)) : [];
    if (!files.length) {
      notify("No projects saved to this song's Drive folder yet.");
      return;
    }
    files.sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
    showDriveProjects(files.slice(0, driveProjectsLimit), folder.name);
    notify('Choose a project to open.');
  });
}

function showDriveProjects(files, folderName) {
  const list = $('driveProjectsList');
  $('driveProjectsFolder').textContent = 'GP Song Tools / ' + folderName + ' / projects';
  list.replaceChildren(...files.map(file => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    for (const [text, className] of [
      [file.name], [String(file.modifiedTime || '').slice(0, 10), 'drive-meta'], [driveSizeLabel(file.size), 'drive-meta']
    ]) {
      if (!text) continue;
      const part = document.createElement('span');
      part.textContent = text;
      if (className) part.className = className;
      button.append(part);
    }
    button.onclick = () => {
      $('driveProjectsDialog').close();
      driveAction(async () => {
        notify('Downloading ' + file.name + '…');
        const blob = await SongDrive.download(file.id);
        await openProjectFile(new File([blob], file.name));
      });
    };
    item.append(button);
    return item;
  }));
  if (!$('driveProjectsDialog').open) $('driveProjectsDialog').showModal();
}

// Header menu and export checkbox

function updateDriveMenu() {
  const button = $('driveSaveExport');
  button.disabled = !lastExport;
  if (lastExport) button.removeAttribute('aria-describedby');
  else button.setAttribute('aria-describedby', 'driveSaveExportWhy');
  button.title = lastExport ? 'Upload ' + lastExport.name + ' to this song\'s exports folder' : 'Export a video first';
}

function exportToDriveSetting(value) {
  try {
    if (value === undefined) return localStorage.getItem(exportToDriveKey) === '1';
    localStorage.setItem(exportToDriveKey, value ? '1' : '0');
  } catch { /* storage blocked: the box just doesn't persist */ }
  return !!value;
}

function connectFramecutDrive() {
  const menu = $('driveMenu');
  const choose = run => () => {
    menu.open = false;
    run();
  };
  $('driveSaveProject').onclick = choose(saveProjectToDrive);
  $('driveOpenProject').onclick = choose(openProjectFromDrive);
  $('driveSaveExport').onclick = choose(saveLastExportToDrive);
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  $('driveProjectsCancel').onclick = () => $('driveProjectsDialog').close();
  $('exportToDrive').checked = exportToDriveSetting();
  $('exportToDrive').onchange = () => exportToDriveSetting($('exportToDrive').checked);
  updateDriveMenu();
}

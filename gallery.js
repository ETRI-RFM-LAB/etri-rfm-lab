const galleryState = { albums: [], active: 0 };

function drawAlbum() {
  const album = galleryState.albums[galleryState.active];
  const root = document.getElementById('gallery-album');
  root.replaceChildren();
  if (!album) return;

  const intro = document.createElement('div'); intro.className = 'gallery-intro';
  const copy = document.createElement('div');
  const title = document.createElement('h2'); title.textContent = album.name;
  const updated = document.createElement('p'); updated.textContent = album.date ? `${album.date} · Google Drive album` : 'Google Drive album';
  const driveLink = document.createElement('a'); driveLink.className = 'chip'; driveLink.href = album.folderUrl; driveLink.target = '_blank'; driveLink.rel = 'noopener noreferrer'; driveLink.textContent = 'Open in Drive ↗';
  copy.append(title, updated); intro.append(copy, driveLink);

  const frame = document.createElement('iframe');
  frame.className = 'drive-folder-frame'; frame.title = `${album.name} Google Drive gallery`; frame.loading = 'lazy';
  frame.src = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(album.folderId)}#grid`;
  root.append(intro, frame);
}

function drawAlbumTabs() {
  const root = document.getElementById('album-tabs'); root.replaceChildren();
  galleryState.albums.forEach((album, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'album-tab'; button.textContent = album.name;
    button.classList.toggle('active', index === galleryState.active);
    button.addEventListener('click', () => { galleryState.active = index; drawAlbumTabs(); drawAlbum(); });
    root.append(button);
  });
}

async function loadGallery() {
  const status = document.getElementById('gallery-status');
  try {
    const rows = await getTab(SHEET_CONFIG.tabs.gallery);
    galleryState.albums = rows.map(row => ({
      date: row['날짜'],
      name: row['이미지 제목'],
      folderUrl: row['이미지 폴더 링크'],
      folderId: driveFileId(row['이미지 폴더 링크'])
    })).filter(album => album.name && album.folderId).sort((a, b) => dateValue(b.date) - dateValue(a.date));
    if (!galleryState.albums.length) { status.textContent = 'No gallery folders are registered in the Gallery sheet.'; return; }
    status.textContent = `${galleryState.albums.length} album${galleryState.albums.length === 1 ? '' : 's'} · synced from Google Sheets and Drive`;
    drawAlbumTabs(); drawAlbum();
  } catch (error) {
    console.error(error); status.textContent = 'Unable to load the gallery. Check the Gallery sheet and Drive folder sharing settings.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadGallery();
});

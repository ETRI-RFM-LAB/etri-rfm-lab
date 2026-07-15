const galleryState = { albums: [], active: 0 };

function imageLinks(row) {
  const links = [];
  Object.values(row).forEach(value => {
    const matches = String(value || '').match(/https?:\/\/[^\s,;]+/g) || [];
    matches.forEach(link => {
      const cleaned = link.replace(/[\])}>]+$/, '');
      if (!/\/folders\//i.test(cleaned)) links.push(cleaned);
    });
  });
  return [...new Set(links)];
}

function setGalleryImage(image, url, size = 'w1600', onFailure = () => {}) {
  const candidates = driveImageCandidates(url, size);
  let index = 0;
  image.referrerPolicy = 'no-referrer';
  image.onerror = () => {
    index += 1;
    if (index < candidates.length) image.src = candidates[index];
    else onFailure();
  };
  if (candidates.length) image.src = candidates[0];
  else onFailure();
}

function openGalleryImage(album, photo, index) {
  const lightbox = document.getElementById('lightbox');
  const preview = lightbox.querySelector('img');
  preview.alt = `${album.name} photo ${index + 1}`;
  setGalleryImage(preview, photo, 'w2400');
  lightbox.querySelector('.lightbox-meta').textContent = `${album.name} · Photo ${index + 1}`;
  lightbox.classList.add('open');
  lightbox.querySelector('.lightbox-close').focus();
}

function drawAlbum() {
  const album = galleryState.albums[galleryState.active];
  const root = document.getElementById('gallery-album');
  root.replaceChildren();
  if (!album) return;

  const intro = document.createElement('div'); intro.className = 'gallery-intro';
  const copy = document.createElement('div');
  const title = document.createElement('h2'); title.textContent = album.name;
  const updated = document.createElement('p'); updated.textContent = album.date || 'ETRI RFM Lab';
  const count = document.createElement('span'); count.className = 'album-count'; count.textContent = `${album.photos.length} PHOTO${album.photos.length === 1 ? '' : 'S'}`;
  copy.append(title, updated); intro.append(copy, count);

  const grid = document.createElement('div'); grid.className = 'gallery-grid';
  album.photos.forEach((photo, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'gallery-item';
    const image = document.createElement('img'); image.alt = `${album.name} photo ${index + 1}`; image.loading = index ? 'lazy' : 'eager';
    const caption = document.createElement('span'); caption.className = 'gallery-caption'; caption.textContent = `Photo ${String(index + 1).padStart(2, '0')}`;
    setGalleryImage(image, photo, 'w1600', () => button.classList.add('image-error'));
    button.append(image, caption); button.addEventListener('click', () => openGalleryImage(album, photo, index)); grid.append(button);
  });
  root.append(intro, grid);
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
    const albums = new Map();
    rows.forEach(row => {
      const name = row['이미지 제목'] || row['앨범 제목'] || row['앨범'];
      const date = row['날짜'] || '';
      const photos = imageLinks(row);
      if (!name || !photos.length) return;
      const key = `${date}\u0000${name}`;
      const album = albums.get(key) || { date, name, photos: [] };
      album.photos.push(...photos); album.photos = [...new Set(album.photos)]; albums.set(key, album);
    });
    galleryState.albums = [...albums.values()].sort((a, b) => dateValue(b.date) - dateValue(a.date));
    if (!galleryState.albums.length) { status.textContent = 'No image links are registered in the Gallery sheet.'; return; }
    const total = galleryState.albums.reduce((sum, album) => sum + album.photos.length, 0);
    status.textContent = `${galleryState.albums.length} album${galleryState.albums.length === 1 ? '' : 's'} · ${total} linked photo${total === 1 ? '' : 's'}`;
    drawAlbumTabs(); drawAlbum();
  } catch (error) {
    console.error(error); status.textContent = 'Unable to load the gallery. Check the Gallery sheet and Drive folder sharing settings.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const lightbox = document.getElementById('lightbox');
  const preview = lightbox.querySelector('img');
  const close = () => { lightbox.classList.remove('open'); preview.src = ''; };
  lightbox.querySelector('.lightbox-close').addEventListener('click', close);
  lightbox.addEventListener('click', event => { if (event.target === lightbox) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  loadGallery();
});

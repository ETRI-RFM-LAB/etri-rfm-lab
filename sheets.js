const SHEET_CONFIG = {
  id: '1R_IC9N-0nNemXAXpodxzoqkVABEA8s9qL46WLSaO5yM',
  tabs: { publications: '논문', patents: '특허', people: '인물', news: '뉴스', gallery: '갤러리' }
};

const archive = { publications: [], patents: [], members: new Set(), pubFilter: 'top', patentFilter: 'all' };

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

function objects(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map(x => x.trim().toLowerCase());
  return rows.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, (row[i] || '').trim()])));
}

async function getTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.id}/gviz/tq?` +
    `tqx=out:csv&sheet=${encodeURIComponent(name)}&_=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return objects(await response.text());
}

function placeholder(item) {
  return item.id === '예시' || item[''] === '예시' || Object.values(item).some(value =>
    /SAMPLE_FILE_ID|@example\.com/i.test(String(value || ''))
  );
}

function dateValue(value) {
  const date = new Date(String(value || '').replace(/\./g, '-'));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function truthy(value) { return ['true', '1', 'yes', 'y'].includes(String(value || '').toLowerCase()); }
function normalize(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function includesQuery(item, fields, query) { return !query || fields.some(field => normalize(item[field]).includes(query)); }
function status(id, message = '') { const element = document.getElementById(id); if (element) element.textContent = message; }

const LINK_ICONS = {
  github: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.84a9.6 9.6 0 0 1 2.5.34c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/>',
  arxiv: '<path d="M7.4 3h6.2l3.9 6.75L13.6 16.5H7.4L3.5 9.75 7.4 3Zm1.15 2-2.74 4.75 2.74 4.75h3.9l2.74-4.75L12.45 5h-3.9Zm.65 2.1h1.7l3.1 5.8h-1.8l-.62-1.28H8.42L7.8 12.9H6l3.2-5.8Zm.02 3.08h1.56L10 8.57l-.78 1.61Z"/>',
  paper: '<path d="M6 2h8.5L20 7.5V22H6V2Zm1.8 1.8v16.4h10.4V8.3h-4.5V3.8H7.8Zm7.7.6v2.1h2.1l-2.1-2.1ZM9.5 11h7v1.6h-7V11Zm0 3.2h7v1.6h-7v-1.6Zm0 3.2h4.8V19H9.5v-1.6Z"/>',
  media: '<path d="M8 5.7v12.6L18 12 8 5.7Z"/>',
  homepage: '<path d="M12 3 2.8 10.5l1.3 1.6L5.5 11v9h5v-5h3v5h5v-9l1.4 1.1 1.3-1.6L12 3Zm4.5 15h-1v-5h-7v5h-1V9.4l4.5-3.7 4.5 3.7V18Z"/>',
  scholar: '<path d="m12 3-10 5 4 2v5.5C6 17.4 8.7 19 12 19s6-1.6 6-3.5V10l2-1v7h2V8L12 3Zm4 12.5c-.2.5-1.7 1.5-4 1.5s-3.8-1-4-1.5V11l4 2 4-2v4.5ZM12 10.8 6.4 8 12 5.2 17.6 8 12 10.8Z"/>',
  email: '<path d="M3 5h18v14H3V5Zm2 2v.5l7 4.8 7-4.8V7H5Zm14 10V9.9l-7 4.8-7-4.8V17h14Z"/>'
};

function linkIcon(kind) {
  if (!LINK_ICONS[kind]) return null;
  const icon = document.createElement('span'); icon.className = 'chip-icon'; icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${LINK_ICONS[kind]}</svg>`;
  return icon;
}

function chip(label, href) {
  if (!href) return null;
  const anchor = document.createElement('a');
  const kind = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  anchor.className = `chip chip-${kind}`; anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
  const icon = linkIcon(kind);
  if (icon) anchor.append(icon);
  anchor.append(document.createTextNode(label));
  return anchor;
}

function pubLink(label, href, kind) {
  if (!href) return null;
  const anchor = document.createElement('a');
  anchor.className = `pub-link pub-link-${kind}`; anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
  const icon = linkIcon(kind);
  if (icon) anchor.append(icon);
  anchor.append(document.createTextNode(label));
  return anchor;
}

function driveFileId(url) {
  const value = String(url || '').trim();
  return value.match(/\/d\/([^/?#]+)/)?.[1] || value.match(/\/folders\/([^/?#]+)/)?.[1] || value.match(/[?&]id=([^&#]+)/)?.[1] || '';
}

function driveImageCandidates(url, size = 'w1200') {
  const id = driveFileId(url);
  if (!id) return url ? [url] : [];
  return [
    `https://lh3.googleusercontent.com/d/${id}=${size}`,
    `https://drive.google.com/thumbnail?id=${id}&sz=${size}`,
    `https://drive.google.com/uc?export=view&id=${id}`
  ];
}

function loadDriveImage(image, url, size = 'w1200', onFailure = () => {}) {
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

function youtubeId(url) {
  const value = String(url || '');
  return value.match(/[?&]v=([^&#]+)/)?.[1] || value.match(/youtu\.be\/([^?&#/]+)/)?.[1] || value.match(/youtube\.com\/shorts\/([^?&#/]+)/)?.[1] || '';
}

function addThumbnail(root, url, alt, onFailure) {
  if (!url) return false;
  const fail = media => { if (onFailure) media.replaceWith(onFailure()); else media.remove(); };
  const videoId = youtubeId(url);
  const media = document.createElement(videoId ? 'button' : 'div'); media.className = 'card-thumb';
  if (videoId) { media.type = 'button'; media.setAttribute('aria-label', `Play video: ${alt}`); }
  const image = document.createElement('img'); image.alt = alt; image.loading = 'lazy';
  if (videoId) {
    image.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    image.onerror = () => fail(media);
    media.classList.add('is-video');
    media.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
      frame.title = alt; frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; frame.allowFullscreen = true;
      media.classList.add('is-playing'); media.replaceChildren(frame);
    }, { once: true });
  } else {
    loadDriveImage(image, url, 'w1200', () => fail(media));
  }
  media.append(image); root.append(media); return true;
}

function publicationVenueType(item) {
  const type = normalize(item['학회/저널']);
  if (type.includes('저널') || type.includes('journal')) return 'journal';
  return 'conference';
}

function matchesPublicationFilter(item, filter) {
  if (filter === 'all') return true;
  if (filter === 'journal') return publicationVenueType(item) === 'journal';
  if (filter === 'sci') return publicationVenueType(item) === 'journal' && truthy(item['sci저널 여부']);
  if (filter === 'conference') return publicationVenueType(item) === 'conference';
  if (filter === 'top') return publicationVenueType(item) === 'conference' && truthy(item['우수학술대회 여부']);
  return true;
}

function cleanAuthors(value) {
  const text = String(value || '').replace(/[{}]/g, '').trim();
  if (!text.includes(';')) return text;
  return text.split(';').map(name => name.trim()).filter(Boolean)
    .map(name => name.includes(',') ? name.split(',').map(part => part.trim()).reverse().join(' ') : name).join(', ');
}

function nameKey(name) {
  const value = String(name || '');
  if (/[가-힣]/.test(value)) return value.replace(/[^가-힣]/g, '');
  return value.toLowerCase().replace(/[^a-z]/g, '').split('').sort().join('');
}

function authorLine(value) {
  const line = document.createElement('p'); line.className = 'authors';
  cleanAuthors(value).split(',').map(name => name.trim()).filter(Boolean).forEach((name, index) => {
    if (index) line.append(', ');
    if (archive.members.has(nameKey(name))) { const member = document.createElement('strong'); member.textContent = name; line.append(member); }
    else line.append(name);
  });
  return line;
}

function filteredPublications() {
  const query = normalize(document.getElementById('publication-search')?.value);
  return archive.publications.filter(item => {
    const matchesType = matchesPublicationFilter(item, archive.pubFilter);
    return matchesType && includesQuery(item, ['논문 제목', '저자(모두)', '제1저자', '교신저자', '연도', '학회/저널 명', '한줄요약(영문)'], query);
  });
}

function drawPublications() {
  const data = filteredPublications();
  const root = document.getElementById('publication-list');
  root.replaceChildren();
  let previousYear = null;
  data.forEach(item => {
    const article = document.createElement('article'); article.className = 'pub';
    const yearLabel = item['연도'] || '—';
    const year = document.createElement('div'); year.className = 'pub-year';
    if (yearLabel !== previousYear) { year.textContent = yearLabel; article.classList.add('year-start'); }
    previousYear = yearLabel;
    const body = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = item['영문 논문 제목'] || item['논문 제목'];
    const authors = authorLine(item['저자(모두)']);
    const venue = document.createElement('p'); venue.className = 'venue'; venue.textContent = item['학회/저널 명'] || '';
    const summary = document.createElement('p'); summary.textContent = item['한줄요약(영문)'] || '';
    body.append(title, authors, venue, summary);
    const links = document.createElement('div'); links.className = 'pub-links';
    const mediaUrl = item['이미지/동영상 주소'] || item['동영상/이미지'] || '';
    const videoUrl = youtubeId(mediaUrl) ? mediaUrl : '';
    [pubLink('Paper', item['arxiv주소'], 'paper'), pubLink('Code', item['깃허브 주소'], 'github'), pubLink('Video', videoUrl, 'media')].filter(Boolean).forEach(a => links.append(a));
    if (links.childElementCount) body.append(links);
    article.append(year);
    article.classList.add('has-media');
    const placeholder = () => venueTile(item);
    if (!addThumbnail(article, mediaUrl || PAPER_FIGURES[titleKey(item)], item['논문 제목'], placeholder)) article.append(placeholder());
    else {
      const thumb = article.querySelector('.card-thumb:not(.is-video)');
      if (thumb) {
        const caption = item['영문 논문 제목'] || item['논문 제목'];
        thumb.classList.add('is-zoomable'); thumb.tabIndex = 0; thumb.setAttribute('role', 'button'); thumb.setAttribute('aria-label', `Enlarge figure: ${caption}`);
        const open = () => { const image = thumb.querySelector('img'); if (image?.currentSrc) openFigure(image.currentSrc, caption); };
        thumb.addEventListener('click', open);
        thumb.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
      }
    }
    article.append(body); root.append(article);
  });
  if (!data.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No publications match your search.'; root.append(empty); }
  document.getElementById('publication-count').textContent = `${data.length} result${data.length === 1 ? '' : 's'}`;
  status('page-status');
}

// Short venue labels for papers without a figure, so every row keeps the same thumbnail slot.
const VENUE_ACRONYMS = [['대한기계학회', 'KSME'], ['기계저널', 'KSME'], ['대한전자공학회', 'IEIE'], ['한국통신학회', 'KICS'], ['한국로봇학회', 'KROS'], ['제어·로봇·시스템학회', 'ICROS'], ['한국정보기술학회', 'KIIT'], ['한국컴퓨터', 'KCC']];

function venueLabel(venue) {
  const name = String(venue || '').replace(/,\s*v\.\s*\d+.*$/i, '').trim();
  const known = VENUE_ACRONYMS.find(([key]) => name.includes(key));
  let label = known ? known[1] : (name.match(/\(([A-Za-z][A-Za-z0-9&-]{1,11})\)/) || name.match(/\b([A-Z][A-Za-z]*[A-Z][A-Za-z]*)\b/) || [])[1] || name;
  if (/workshop/i.test(name) && !/workshop/i.test(label)) label += ' Workshop';
  return label || 'Paper';
}

function venueTile(item) {
  const tile = document.createElement('div'); tile.className = 'card-thumb is-placeholder'; tile.setAttribute('aria-hidden', 'true');
  const label = venueLabel(item['학회/저널 명']);
  const name = document.createElement('span'); name.className = 'tile-venue' + (label.length > 10 ? ' is-long' : ''); name.textContent = label;
  tile.append(name);
  if (item['연도']) { const year = document.createElement('span'); year.className = 'tile-year'; year.textContent = item['연도']; tile.append(year); }
  return tile;
}

// Representative figures taken from each paper's public version, used when the sheet has no image.
const PAPER_FIGURES = {
  'learningdexterousbimanualcatchskillsthroughadversarialcooperativeheterogeneousagentreinforcementlearning': 'assets/papers/bimanual-catch.jpg',
  'carevladomainspecializedvisionlanguagemodelforearlyasdscreening': 'assets/papers/care-vl.jpg',
  'spaceawareinstructiontuningdatasetandbenchmarkforguidedogrobotsassistingthevisuallyimpaired': 'assets/papers/space-aware-instruction-tuning.jpg',
  'rethinkingdatabiasdatasetcopyrightprotectionviaembeddingclasswisehiddenbias': 'assets/papers/undercover-bias.jpg',
  'learningtorewindviaiterativepredictionofpastweightsforpracticalunlearning': 'assets/papers/learning-to-rewind.jpg',
  'savlmv2usefulcomprehensiveandconciseguidanceforguidedogrobotsassistingthevisuallyimpaired': 'assets/papers/sa-vlm-v2.jpg'
};

function titleKey(item) { return normalize(item['영문 논문 제목'] || item['논문 제목']).replace(/[^a-z0-9가-힣]/g, ''); }

function dedupePublications(items) {
  const byKey = new Map();
  items.forEach(item => {
    const key = `${titleKey(item)}|${item['연도']}`;
    const kept = byKey.get(key);
    if (!kept) { byKey.set(key, { ...item }); return; }
    Object.entries(item).forEach(([field, value]) => { if (value && !kept[field]) kept[field] = value; });
  });
  return [...byKey.values()];
}

function openFigure(src, caption) {
  let box = document.getElementById('figure-lightbox');
  if (!box) {
    box = document.createElement('div'); box.id = 'figure-lightbox'; box.className = 'lightbox';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Figure preview');
    box.innerHTML = '<button class="lightbox-close" type="button" aria-label="Close preview">×</button><img src="" alt=""><div class="lightbox-meta"></div>';
    const close = () => { box.classList.remove('open'); box.querySelector('img').src = ''; };
    box.querySelector('.lightbox-close').addEventListener('click', close);
    box.addEventListener('click', event => { if (event.target === box) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && box.classList.contains('open')) close(); });
    document.body.append(box);
  }
  const preview = box.querySelector('img'); preview.src = src; preview.alt = caption;
  box.querySelector('.lightbox-meta').textContent = caption;
  box.classList.add('open'); box.querySelector('.lightbox-close').focus();
}

function renderPublications(items) {
  archive.publications = dedupePublications(items.filter(item => item['논문 제목'] && !placeholder(item) && item['제출 상태'] === 'Accept'))
    .sort((a, b) => Number(b['연도'] || 0) - Number(a['연도'] || 0));
  drawPublications();
}

function patentStatus(item) {
  const value = normalize(item['세부상태']);
  if (value.includes('등록') || value.includes('registered')) return 'registered';
  if (value.includes('공개') || value.includes('published')) return 'published';
  return 'filed';
}

function filteredPatents() {
  const query = normalize(document.getElementById('patent-search')?.value);
  return archive.patents.filter(item => {
    const matchesStatus = archive.patentFilter === 'all' || patentStatus(item) === archive.patentFilter;
    return matchesStatus && includesQuery(item, ['특허명', '특허명 확인 요령', '특허명(영문)', '영문 특허명', '발명자 (국문)', '발명자 (영문)', '출원번호', '등록번호', '출원국가'], query);
  });
}

function drawPatents() {
  const translations = { '대한민국': 'Republic of Korea', '한국': 'Republic of Korea', '미국': 'United States', '출원': 'Filed', '등록': 'Registered', '공개': 'Published' };
  const data = filteredPatents();
  const root = document.getElementById('patent-list'); root.replaceChildren();
  data.forEach(item => {
    const article = document.createElement('article'); article.className = 'patent-row';
    const meta = document.createElement('p'); meta.className = 'patent-meta';
    const statusLabel = document.createElement('span'); statusLabel.className = 'patent-status'; statusLabel.textContent = translations[item['세부상태']] || item['세부상태'] || 'Filed';
    meta.append(statusLabel, [translations[item['출원국가']] || item['출원국가'], item['출원번호'], item['출원일']].filter(Boolean).join(' · '));
    const title = document.createElement('h3'); title.textContent = readableTitle(item['특허명(영문)'] || item['영문 특허명'] || patentTitle(item));
    const inventors = document.createElement('p'); inventors.className = 'patent-inventors'; inventors.textContent = item['발명자 (영문)'] || item['발명자 (국문)'] || '';
    article.append(meta, title, inventors);
    const detail = pubLink('Details', item['링크'], 'details'); if (detail) { const links = document.createElement('div'); links.className = 'pub-links'; links.append(detail); article.append(links); }
    root.append(article);
  });
  if (!data.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No patents match your search.'; root.append(empty); }
  document.getElementById('patent-count').textContent = `${data.length} result${data.length === 1 ? '' : 's'}`;
  status('page-status');
}

function readableTitle(value) {
  const text = String(value || '').trim();
  if (!/[A-Z]/.test(text) || text !== text.toUpperCase()) return text;
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with']);
  return text.toLowerCase().split(' ').map((word, index) => (index && small.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function patentTitle(item) { return item['특허명'] || item['특허명 확인 요령'] || ''; }

function renderPatents(items) {
  const unique = new Map();
  items.filter(item => patentTitle(item) && !placeholder(item)).forEach(item => {
    const key = `${normalize(patentTitle(item))}|${normalize(item['출원번호'])}`;
    if (!unique.has(key)) unique.set(key, item);
  });
  archive.patents = [...unique.values()].sort((a, b) => dateValue(b['출원일']) - dateValue(a['출원일']));
  drawPatents();
}

const SILHOUETTE = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="44" r="22"/><path d="M18 112c0-24 19-40 42-40s42 16 42 40z"/></svg>';
function setSilhouette(photo) {
  photo.innerHTML = SILHOUETTE; photo.classList.add('is-fallback');
}

function personCard(item) {
    const displayName = item['영문 이름'] || item['이름'];
    const article = document.createElement('article'); article.className = 'person';
    const photo = document.createElement('div'); photo.className = 'photo';
    if (item['사진']) {
      const image = document.createElement('img'); image.alt = `${displayName}, researcher`; image.loading = 'lazy';
      loadDriveImage(image, item['사진'], 'w1200', () => {
        image.remove(); setSilhouette(photo);
      });
      photo.append(image);
    } else {
      setSilhouette(photo);
    }
    const body = document.createElement('div'); body.className = 'person-body';
    const name = document.createElement('h3'); name.textContent = displayName;
    const role = document.createElement('div'); role.className = 'role'; role.textContent = item['역할'] || 'Researcher';
    const email = item['이메일'] ? document.createElement('a') : null;
    if (email) {
      email.className = 'person-email'; email.href = `mailto:${item['이메일']}`;
      email.append(linkIcon('email'), document.createTextNode(item['이메일']));
    }
    const field = document.createElement('div'); field.className = 'field'; field.textContent = item['연구 분야'] || '';
    const links = document.createElement('div'); links.className = 'pub-links';
    [pubLink('Homepage', item['개인 홈페이지'], 'homepage'), pubLink('Scholar', item['google scholar'], 'scholar')].filter(Boolean).forEach(a => links.append(a));
    body.append(name, role); if (email) body.append(email); body.append(field, links); article.append(photo, body);
    return article;
}

function renderPeople(items) {
  const data = items.filter(item => item['이름']);
  const root = document.getElementById('people-list'); root.replaceChildren();
  data.forEach(item => root.append(personCard(item)));
  status('page-status', `${data.length} researchers`);
}

// Lab members who also hold UST faculty appointments, in display order (Korean names as in the people tab).
const UST_PROFESSORS = ['한병옥', '윤우한', '장진혁', '유철환'];

function renderUstProfessors(items) {
  const root = document.getElementById('ust-list'); if (!root) return;
  const byName = new Map(items.map(item => [item['이름'], item]));
  root.replaceChildren(...UST_PROFESSORS.map(name => byName.get(name)).filter(Boolean).map(personCard));
}

function renderNews(items) {
  const data = items.filter(item => item['뉴스 제목']).sort((a, b) => dateValue(b['날짜']) - dateValue(a['날짜'])).slice(0, 5);
  const root = document.getElementById('news-list'); root.replaceChildren();
  data.forEach(item => {
    const article = document.createElement('article'); article.className = 'news-card';
    const mediaUrl = item['동영상/이미지'] || item['이미지/동영상'] || item['이미지'];
    if (addThumbnail(article, mediaUrl, item['뉴스 제목'])) article.classList.add('has-thumb');
    const body = document.createElement('div'); body.className = 'news-card-body';
    const time = document.createElement('time'); time.textContent = item['날짜'] || '';
    const title = document.createElement('h3'); title.textContent = item['뉴스 제목'];
    const description = document.createElement('p'); description.textContent = item['뉴스 내용'] || '';
    body.append(time, title, description);
    const detail = chip('Read more →', item['링크']); if (detail) body.append(detail);
    article.append(body);
    root.append(article);
  });
  if (!data.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No news is available.'; root.append(empty); }
  status('news-status', `${data.length} news item${data.length === 1 ? '' : 's'}`);
}

function bindFilters() {
  document.getElementById('publication-search')?.addEventListener('input', drawPublications);
  document.querySelectorAll('[data-pub-filter]').forEach(button => button.addEventListener('click', () => { archive.pubFilter = button.dataset.pubFilter; document.querySelectorAll('[data-pub-filter]').forEach(b => b.classList.toggle('active', b === button)); drawPublications(); }));
  document.getElementById('patent-search')?.addEventListener('input', drawPatents);
  document.querySelectorAll('[data-patent-filter]').forEach(button => button.addEventListener('click', () => { archive.patentFilter = button.dataset.patentFilter; document.querySelectorAll('[data-patent-filter]').forEach(b => b.classList.toggle('active', b === button)); drawPatents(); }));
}

async function loadMembers() {
  try {
    const people = await getTab(SHEET_CONFIG.tabs.people);
    archive.members = new Set(people.flatMap(person => [nameKey(person['영문 이름']), nameKey(person['이름'])]).filter(Boolean));
  } catch (error) { console.warn('Unable to load lab members', error); }
}

async function loadPage(kind) {
  if (kind === 'publications') await loadMembers();
  try { const rows = await getTab(SHEET_CONFIG.tabs[kind === 'contact' ? 'people' : kind]); ({ publications: renderPublications, patents: renderPatents, people: renderPeople, news: renderNews, contact: renderUstProfessors })[kind](rows); }
  catch (error) { console.error(error); status(kind === 'news' ? 'news-status' : 'page-status', 'Unable to load data. Check the Google Sheets sharing and web publishing settings.'); }
}

document.addEventListener('DOMContentLoaded', () => {
  bindFilters();
  const kind = document.body.dataset.page;
  if (['publications', 'patents', 'people'].includes(kind)) loadPage(kind);
  if (document.getElementById('ust-list')) loadPage('contact');
  if (document.getElementById('news-list')) loadPage('news');
  const menu = document.querySelector('.menu');
  if (menu && !menu.querySelector('a[href="gallery.html"]')) { const gallery = document.createElement('a'); gallery.href = 'gallery.html'; gallery.textContent = 'Gallery'; if (kind === 'gallery') gallery.className = 'active'; menu.append(gallery); }
  document.querySelector('.hamb')?.addEventListener('click', () => document.querySelector('.menu')?.classList.toggle('open'));
});

const SHEET_CONFIG = {
  id: '1R_IC9N-0nNemXAXpodxzoqkVABEA8s9qL46WLSaO5yM',
  tabs: { publications: '논문', patents: '특허', people: '인물', news: '뉴스', gallery: '갤러리' }
};

const archive = { publications: [], patents: [], pubFilter: 'all', patentFilter: 'all' };

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

function chip(label, href) {
  if (!href) return null;
  const anchor = document.createElement('a');
  anchor.className = 'chip'; anchor.href = href; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = label;
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

function addThumbnail(root, url, alt) {
  if (!url) return false;
  const videoId = youtubeId(url);
  const media = document.createElement(videoId ? 'button' : 'div'); media.className = 'card-thumb';
  if (videoId) { media.type = 'button'; media.setAttribute('aria-label', `Play video: ${alt}`); }
  const image = document.createElement('img'); image.alt = alt; image.loading = 'lazy';
  if (videoId) {
    image.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    image.onerror = () => media.remove();
    media.classList.add('is-video');
    media.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
      frame.title = alt; frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; frame.allowFullscreen = true;
      media.classList.add('is-playing'); media.replaceChildren(frame);
    }, { once: true });
  } else {
    loadDriveImage(image, url, 'w1200', () => media.remove());
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
  data.forEach(item => {
    const article = document.createElement('article'); article.className = 'pub';
    const year = document.createElement('div'); year.className = 'pub-year'; year.textContent = item['연도'] || '—';
    const body = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = item['영문 논문 제목'] || item['논문 제목'];
    const authors = document.createElement('p'); authors.textContent = item['저자(모두)'] || '';
    const venue = document.createElement('p'); venue.className = 'venue'; venue.textContent = item['학회/저널 명'] || '';
    const summary = document.createElement('p'); summary.textContent = item['한줄요약(영문)'] || '';
    body.append(title, authors, venue, summary);
    const links = document.createElement('div'); links.className = 'chips';
    [chip('GitHub', item['깃허브 주소']), chip('arXiv', item['arxiv주소']), chip('Media', item['이미지/동영상 주소'])].filter(Boolean).forEach(a => links.append(a));
    article.append(year);
    const mediaUrl = item['이미지/동영상 주소'] || item['동영상/이미지'] || '';
    if (addThumbnail(article, mediaUrl, item['논문 제목'])) article.classList.add('has-media');
    article.append(body, links); root.append(article);
  });
  if (!data.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No publications match your search.'; root.append(empty); }
  document.getElementById('publication-count').textContent = `${data.length} result${data.length === 1 ? '' : 's'}`;
  status('page-status');
}

function renderPublications(items) {
  archive.publications = items.filter(item => item['논문 제목'] && !placeholder(item) && item['제출 상태'] === 'Accept')
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
    return matchesStatus && includesQuery(item, ['특허명', '특허명(영문)', '영문 특허명', '발명자 (국문)', '발명자 (영문)', '출원번호', '등록번호', '출원국가'], query);
  });
}

function drawPatents() {
  const translations = { '대한민국': 'Republic of Korea', '한국': 'Republic of Korea', '미국': 'United States', '출원': 'Filed', '등록': 'Registered', '공개': 'Published' };
  const data = filteredPatents();
  const root = document.getElementById('patent-list'); root.replaceChildren();
  data.forEach(item => {
    const article = document.createElement('article'); article.className = 'patent';
    const top = document.createElement('div'); top.className = 'patent-top';
    const country = document.createElement('span'); country.className = 'country'; country.textContent = translations[item['출원국가']] || item['출원국가'] || '—';
    const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = translations[item['세부상태']] || item['세부상태'] || 'Filed';
    top.append(country, badge);
    const title = document.createElement('h3'); title.textContent = item['특허명(영문)'] || item['영문 특허명'] || item['특허명'];
    const inventors = document.createElement('p'); inventors.textContent = `Inventors · ${item['발명자 (영문)'] || item['발명자 (국문)'] || '—'}`;
    const number = document.createElement('p'); number.textContent = `Application · ${item['출원번호'] || '—'}${item['출원일'] ? ' · ' + item['출원일'] : ''}`;
    article.append(top, title, inventors, number);
    const detail = chip('View details →', item['링크']); if (detail) article.append(detail);
    root.append(article);
  });
  if (!data.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No patents match your search.'; root.append(empty); }
  document.getElementById('patent-count').textContent = `${data.length} result${data.length === 1 ? '' : 's'}`;
  status('page-status');
}

function renderPatents(items) {
  archive.patents = items.filter(item => item['특허명'] && !placeholder(item)).sort((a, b) => dateValue(b['출원일']) - dateValue(a['출원일']));
  drawPatents();
}

function renderPeople(items) {
  const data = items.filter(item => item['이름']);
  const root = document.getElementById('people-list'); root.replaceChildren();
  data.forEach(item => {
    const displayName = item['영문 이름'] || item['이름'];
    const article = document.createElement('article'); article.className = 'person';
    const photo = document.createElement('div'); photo.className = 'photo'; photo.textContent = (displayName || 'R')[0];
    if (item['사진']) { const image = document.createElement('img'); image.alt = `${displayName}, researcher`; image.loading = 'lazy'; loadDriveImage(image, item['사진'], 'w1200', () => { image.remove(); photo.classList.add('is-fallback'); }); photo.append(image); }
    else photo.classList.add('is-fallback');
    const body = document.createElement('div'); body.className = 'person-body';
    const name = document.createElement('h3'); name.textContent = displayName;
    const role = document.createElement('div'); role.className = 'role'; role.textContent = item['역할'] || 'Researcher';
    const email = item['이메일'] ? document.createElement('a') : null;
    if (email) { email.className = 'person-email'; email.href = `mailto:${item['이메일']}`; email.textContent = item['이메일']; }
    const field = document.createElement('div'); field.className = 'field'; field.textContent = item['연구 분야'] || '';
    const links = document.createElement('div'); links.className = 'chips';
    [chip('Homepage', item['개인 홈페이지']), chip('Scholar', item['google scholar'])].filter(Boolean).forEach(a => links.append(a));
    body.append(name, role); if (email) body.append(email); body.append(field, links); article.append(photo, body); root.append(article);
  });
  status('page-status', `${data.length} researchers`);
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

async function loadPage(kind) {
  try { const rows = await getTab(SHEET_CONFIG.tabs[kind]); ({ publications: renderPublications, patents: renderPatents, people: renderPeople, news: renderNews })[kind](rows); }
  catch (error) { console.error(error); status(kind === 'news' ? 'news-status' : 'page-status', 'Unable to load data. Check the Google Sheets sharing and web publishing settings.'); }
}

document.addEventListener('DOMContentLoaded', () => {
  bindFilters();
  const kind = document.body.dataset.page;
  if (['publications', 'patents', 'people'].includes(kind)) loadPage(kind);
  if (document.getElementById('news-list')) loadPage('news');
  const menu = document.querySelector('.menu');
  if (menu && !menu.querySelector('a[href="gallery.html"]')) { const gallery = document.createElement('a'); gallery.href = 'gallery.html'; gallery.textContent = 'Gallery'; if (kind === 'gallery') gallery.className = 'active'; menu.append(gallery); }
  document.querySelector('.hamb')?.addEventListener('click', () => document.querySelector('.menu')?.classList.toggle('open'));
});

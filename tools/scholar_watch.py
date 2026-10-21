#!/usr/bin/env python3
"""Daily check of lab members' Google Scholar profiles for papers missing from the site sheet.

- Reads members (and their Scholar links) and the paper list from the public Google Sheet.
- Finds recent Scholar papers that are not in the paper tab yet (patents are skipped).
- Writes data/scholar-updates.json, which scholar-updates.html renders as sheet-ready rows,
  then commits and pushes that file.
- Appends newly found papers to the lab's Notion page when a Notion token is configured.

Usage: python3 tools/scholar_watch.py [--dry-run | --no-push]
  --dry-run  print the candidates only
  --no-push  write data/scholar-updates.json locally, without git or Notion
"""
import csv
import datetime as dt
import difflib
import html
import io
import json
import os
import random
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET_ID = '1R_IC9N-0nNemXAXpodxzoqkVABEA8s9qL46WLSaO5yM'
PAPERS_GID = '0'
PEOPLE_GID = '571129888'
NOTION_PAGE_ID = '4007b58f-d5ca-81e2-a583-f272a514d144'
SITE_PAGE = 'https://etri-rfm-lab.github.io/scholar-updates.html'
OUTPUT = os.path.join(REPO, 'data', 'scholar-updates.json')
STATE_DIR = os.path.expanduser('~/.local/state/rfm-scholar')
STATE_FILE = os.path.join(STATE_DIR, 'state.json')
NOTION_TOKEN_FILE = os.path.expanduser('~/.config/rfm-scholar/notion_token')
USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
KST = dt.timezone(dt.timedelta(hours=9))
# Only papers from last year onward are considered, so older work missing from the sheet does not flood the list.
MIN_YEAR = dt.datetime.now(KST).year - 1


def log(message):
    print(f'[{dt.datetime.now(KST):%Y-%m-%d %H:%M:%S}] {message}', flush=True)


def fetch(url, data=None, headers=None, method=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': USER_AGENT, **(headers or {})}, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8', 'replace')


def sheet_rows(gid):
    text = fetch(f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}')
    rows = list(csv.reader(io.StringIO(text)))
    return [cell.strip() for cell in rows[0]], rows[1:]


def norm(text):
    return re.sub(r'[^a-z0-9가-힣]', '', html.unescape(text or '').lower())


def clean(text):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', text or ''))).strip()


def scholar_user(url):
    return urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('user', [''])[0]


def polite_pause():
    time.sleep(random.uniform(4, 8))


def scholar_papers(user):
    page = fetch(f'https://scholar.google.com/citations?user={user}&hl=en&sortby=pubdate&cstart=0&pagesize=50')
    if 'gsc_a_tr' not in page:
        raise RuntimeError('no publication rows (possibly blocked by Google Scholar)')
    papers = []
    for row in re.findall(r'<tr class="gsc_a_tr">(.*?)</tr>', page, re.S):
        link = re.search(r'href="([^"]+)" class="gsc_a_at">(.*?)</a>', row, re.S)
        grays = re.findall(r'<div class="gs_gray">(.*?)</div>', row, re.S)
        year = re.search(r'class="gsc_a_h gsc_a_hc gs_ibl">(\d{4})<', row)
        if not link:
            continue
        papers.append({
            'title': clean(link.group(2)),
            'scholar_url': 'https://scholar.google.com' + html.unescape(link.group(1)),
            'authors': clean(grays[0]) if grays else '',
            'venue': clean(re.sub(r'<span class="gs_oph">.*?</span>', '', grays[1])) if len(grays) > 1 else '',
            'year': int(year.group(1)) if year else 0,
        })
    return papers


def scholar_details(url):
    page = fetch(url)
    fields = {clean(k): clean(v) for k, v in re.findall(r'class="gsc_oci_field">(.*?)</div><div class="gsc_oci_value"[^>]*>(.*?)</div>', page, re.S)}
    title_link = re.search(r'class="gsc_oci_title_link" href="([^"]+)"', page)
    return {
        'authors': fields.get('Authors') or fields.get('Inventors', ''),
        'venue': fields.get('Conference') or fields.get('Journal') or fields.get('Book') or fields.get('Source', ''),
        'is_journal': 'Journal' in fields,
        'is_patent': 'Patent office' in fields or 'Inventors' in fields,
        'date': fields.get('Publication date', ''),
        'link': html.unescape(title_link.group(1)) if title_link else '',
    }


def looks_like_patent(paper):
    return bool(re.search(r'patent|특허', paper['venue'], re.I))


def known_in_sheet(title, known_titles):
    key = norm(title)
    if not key:
        return True
    for known in known_titles:
        if key == known or (len(key) > 20 and (key in known or known in key)):
            return True
        if difflib.SequenceMatcher(None, key, known).ratio() > 0.92:
            return True
    return False


def sheet_row(columns, item):
    authors = item['authors']
    preprint = 'arxiv' in item['venue'].lower()
    values = {
        '논문 제목': item['title'],
        '제출 상태': '' if preprint else 'Accept',
        '저자(모두)': authors,
        '제1저자': authors.split(',')[0].strip() if authors else '',
        '연도': str(item['year'] or ''),
        '학회/저널': '' if preprint else ('저널' if item.get('is_journal') else '학회'),
        '학회/저널 명': item['venue'],
        '우수학술대회 여부': 'FALSE',
        'sci저널 여부': 'FALSE',
        'arxiv주소': item.get('link', ''),
    }
    lowered = {key.lower(): value for key, value in values.items()}
    return [lowered.get(column.lower(), '') for column in columns]


def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as file:
            return json.load(file)
    except (OSError, ValueError):
        return default


def git(*args, check=True):
    return subprocess.run(['git', '-C', REPO, *args], check=check, capture_output=True, text=True)


def notion_append(new_items, today):
    try:
        with open(NOTION_TOKEN_FILE, encoding='utf-8') as file:
            token = file.read().strip()
    except OSError:
        log('Notion token not configured; skipping Notion update')
        return False
    text = lambda content, link=None: {'type': 'text', 'text': {'content': content[:1900], **({'link': {'url': link}} if link else {})}}
    children = []
    for item in new_items:
        detail = f" — {item['venue'] or '학회/저널 미상'}, {item['year'] or ''} ({', '.join(item['members'])})"
        children.append({'object': 'block', 'type': 'bulleted_list_item',
                         'bulleted_list_item': {'rich_text': [text(item['title'], item['scholar_url']), text(detail)]}})
    children.append({'object': 'block', 'type': 'paragraph',
                     'paragraph': {'rich_text': [text('시트에 붙여 넣을 행 보기: '), text(SITE_PAGE, SITE_PAGE)]}})
    # One collapsible toggle per day keeps the log short.
    title = {**text(f'{today} · 새 논문 {len(new_items)}편'), 'annotations': {'bold': True}}
    blocks = [{'object': 'block', 'type': 'toggle', 'toggle': {'rich_text': [title], 'children': children}}]
    fetch(f'https://api.notion.com/v1/blocks/{NOTION_PAGE_ID}/children', data=json.dumps({'children': blocks}).encode(), method='PATCH',
          headers={'Authorization': f'Bearer {token}', 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'})
    log(f'Notion: appended {len(new_items)} papers')
    return True


def main():
    dry_run = '--dry-run' in sys.argv
    no_push = '--no-push' in sys.argv
    today = dt.datetime.now(KST).strftime('%Y-%m-%d')
    os.makedirs(STATE_DIR, exist_ok=True)
    state = load_json(STATE_FILE, {'seen': {}, 'details': {}})
    state.setdefault('notified', [])
    seen_before = dict(state['seen'])

    if not dry_run and not no_push:
        pulled = git('pull', '--ff-only', '--quiet', check=False)
        if pulled.returncode:
            log(f'git pull failed, continuing: {pulled.stderr.strip()}')

    people_columns, people = sheet_rows(PEOPLE_GID)
    paper_columns, papers = sheet_rows(PAPERS_GID)
    lower = [c.lower() for c in people_columns]
    name_col, scholar_col = lower.index('영문 이름'), lower.index('google scholar')
    title_cols = [i for i, c in enumerate(paper_columns) if c in ('논문 제목', '영문 논문 제목')]
    known_titles = {norm(row[i]) for row in papers for i in title_cols if i < len(row) and row[i].strip()}

    candidates, failures = {}, []
    for row in people:
        name = row[name_col].strip() if len(row) > name_col else ''
        user = scholar_user(row[scholar_col]) if len(row) > scholar_col else ''
        if not name or not user:
            continue
        try:
            found = scholar_papers(user)
            log(f'{name}: {len(found)} papers on Scholar')
        except Exception as error:  # keep going with the other members
            failures.append(name)
            log(f'{name}: failed ({error})')
            polite_pause()
            continue
        for paper in found:
            if paper['year'] < MIN_YEAR or looks_like_patent(paper) or known_in_sheet(paper['title'], known_titles):
                continue
            entry = candidates.setdefault(norm(paper['title']), {**paper, 'members': []})
            if name not in entry['members']:
                entry['members'].append(name)
        polite_pause()

    items = []
    for key, paper in candidates.items():
        details = state['details'].get(key)
        if details is None:
            try:
                details = scholar_details(paper['scholar_url'])
                polite_pause()
            except Exception as error:
                log(f'details failed for "{paper["title"][:50]}": {error}')
                details = {}
            state['details'][key] = details
        if details.get('is_patent'):
            continue
        item = {**paper, 'authors': details.get('authors') or paper['authors'], 'venue': details.get('venue') or paper['venue'],
                'is_journal': details.get('is_journal', False), 'link': details.get('link', ''),
                'first_seen': state['seen'].setdefault(key, today)}
        item['row'] = sheet_row(paper_columns, item)
        items.append(item)
    items.sort(key=lambda item: (item['first_seen'], item['year'], item['title']), reverse=True)
    new_items = [item for item in items if norm(item['title']) not in state['notified']]
    log(f'{len(items)} papers missing from the sheet, {len(new_items)} not yet sent to Notion')

    output = {'updated': dt.datetime.now(KST).isoformat(timespec='minutes'), 'columns': paper_columns,
              'failed_members': failures, 'items': [{k: v for k, v in item.items() if k != 'is_journal'} for item in items]}
    if dry_run or no_push:
        if no_push:
            os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
            with open(OUTPUT, 'w', encoding='utf-8') as file:
                json.dump(output, file, ensure_ascii=False, indent=2)
            log(f'wrote {OUTPUT} (not committed)')
        for item in items:
            print(f"- {item['year']} | {item['title'][:70]} | {item['venue'][:50]} | {', '.join(item['members'])}")
        state['seen'] = seen_before  # a dry run must not change what counts as new; keep only the details cache
        with open(STATE_FILE, 'w', encoding='utf-8') as file:
            json.dump(state, file, ensure_ascii=False, indent=2)
        return

    def save_state():
        with open(STATE_FILE, 'w', encoding='utf-8') as file:
            json.dump(state, file, ensure_ascii=False, indent=2)
    save_state()

    # Only rewrite and push the file when the list changes, so quiet days add no commits.
    previous = load_json(OUTPUT, {})
    if not previous or previous.get('items') != output['items'] or previous.get('failed_members') != failures:
        os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
        with open(OUTPUT, 'w', encoding='utf-8') as file:
            json.dump(output, file, ensure_ascii=False, indent=2)
        git('add', OUTPUT)
        git('commit', '--quiet', '-m', f'Update Scholar paper candidates ({today})', '--', OUTPUT)
        pushed = git('push', '--quiet', check=False)
        log('pushed data/scholar-updates.json' if pushed.returncode == 0 else f'git push failed: {pushed.stderr.strip()}')

    if new_items:
        try:
            if notion_append(new_items, today):
                state['notified'].extend(norm(item['title']) for item in new_items)
                save_state()
        except Exception as error:
            log(f'Notion update failed: {error}')


if __name__ == '__main__':
    main()

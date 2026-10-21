#!/usr/bin/env python3
"""Daily Google News check for articles about the ETRI Robot Foundation Model Lab.

- Searches Google News (RSS) for the lab's name and finds articles not reported before.
- Resolves each article's original URL, takes its representative image (og:image),
  and summarizes the article in Korean with Claude Code (`claude -p`).
- Appends the new articles to the lab's Notion page as one toggle per day.

Usage: python3 tools/news_watch.py [--dry-run]
  --dry-run  print the new articles with summaries; do not post to Notion or remember them
"""
import datetime as dt
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

QUERIES = ['ETRI 로봇파운데이션모델연구실', 'ETRI 로봇파운데이션모델 연구실']
NOTION_PAGE_ID = '4007b58f-d5ca-81e2-a583-f272a514d144'
STATE_DIR = os.path.expanduser('~/.local/state/rfm-news')
STATE_FILE = os.path.join(STATE_DIR, 'state.json')
NOTION_TOKEN_FILE = os.path.expanduser('~/.config/rfm-scholar/notion_token')
CLAUDE = os.path.expanduser('~/.local/bin/claude')
USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
KST = dt.timezone(dt.timedelta(hours=9))
# On the first run, only articles from the last week count as new, so the backlog does not flood Notion.
FIRST_RUN_DAYS = 7


def log(message):
    print(f'[{dt.datetime.now(KST):%Y-%m-%d %H:%M:%S}] {message}', flush=True)


def fetch(url, data=None, headers=None, method=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': USER_AGENT, **(headers or {})}, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode('utf-8', 'replace')


def search(query):
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q': query, 'hl': 'ko', 'gl': 'KR', 'ceid': 'KR:ko'})
    articles = []
    for item in ET.fromstring(fetch(url)).iter('item'):
        link = item.findtext('link') or ''
        article_id = re.search(r'/articles/([^?]+)', link)
        if not article_id:
            continue
        published = dt.datetime.strptime(item.findtext('pubDate'), '%a, %d %b %Y %H:%M:%S %Z').replace(tzinfo=dt.timezone.utc)
        title = item.findtext('title') or ''
        source = item.findtext('source') or ''
        if source and title.endswith(f' - {source}'):
            title = title[: -len(source) - 3]
        articles.append({'id': article_id.group(1), 'title': html.unescape(title), 'source': source,
                         'published': published.astimezone(KST).isoformat(timespec='minutes'), 'google_url': link})
    return articles


def original_url(article_id):
    """Google News hides the publisher URL; ask its own decoding endpoint for it."""
    page = fetch(f'https://news.google.com/rss/articles/{article_id}')
    signature = re.search(r'data-n-a-sg="([^"]+)"', page).group(1)
    timestamp = re.search(r'data-n-a-ts="([^"]+)"', page).group(1)
    request = ['Fbv4je', f'["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],'
                         f'"X","X",1,[1,1,1],1,1,null,0,0,null,0],"{article_id}",{timestamp},"{signature}"]']
    body = urllib.parse.urlencode({'f.req': json.dumps([[request]])}).encode()
    reply = fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', data=body,
                  headers={'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
    return json.loads(json.loads(reply.split('\n\n')[1])[0][2])[1]


def meta(page, name):
    for pattern in (rf'<meta[^>]+(?:property|name)=["\']{name}["\'][^>]+content=["\']([^"\']+)',
                    rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{name}["\']'):
        found = re.search(pattern, page, re.I)
        if found:
            return html.unescape(found.group(1)).strip()
    return ''


def article_text(page):
    page = re.sub(r'<(script|style|noscript)[^>]*>.*?</\1>', ' ', page, flags=re.S | re.I)
    paragraphs = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', p))).strip() for p in re.findall(r'<p[^>]*>(.*?)</p>', page, re.S | re.I)]
    text = '\n'.join(p for p in paragraphs if len(p) > 30)
    if len(text) < 200:  # some sites keep the body in <div>s; fall back to all visible text
        text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', page)))
    return text[:6000]


def summarize(title, text):
    prompt = ('다음 뉴스 기사를 한국어 2~3문장으로 요약해 주세요. ETRI 로봇파운데이션모델연구실과 관련된 내용을 중심으로, '
              '요약문만 출력하세요.\n\n'
              f'제목: {title}\n\n본문:\n{text}')
    result = subprocess.run([CLAUDE, '-p', '--model', 'haiku', '--tools', '', '--strict-mcp-config', '--no-session-persistence'],
                            input=prompt, capture_output=True, text=True, timeout=180)
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError(result.stderr.strip()[:200] or 'empty summary')
    return result.stdout.strip()


def load_state():
    try:
        with open(STATE_FILE, encoding='utf-8') as file:
            return json.load(file)
    except (OSError, ValueError):
        return {'seen': {}}


def notion_append(articles, today):
    try:
        with open(NOTION_TOKEN_FILE, encoding='utf-8') as file:
            token = file.read().strip()
    except OSError:
        log('Notion token not configured; skipping Notion update')
        return False
    text = lambda content, link=None, bold=False: {'type': 'text', 'text': {'content': content[:1900], **({'link': {'url': link}} if link else {})},
                                                  **({'annotations': {'bold': True}} if bold else {})}
    children = []
    for article in articles:
        children.append({'object': 'block', 'type': 'paragraph', 'paragraph': {
            'rich_text': [text(article['title'], article['url'], bold=True), text(f" — {article['source']}, {article['published'][:10]}")]}})
        if article.get('image'):
            children.append({'object': 'block', 'type': 'image', 'image': {'type': 'external', 'external': {'url': article['image']}}})
        children.append({'object': 'block', 'type': 'paragraph', 'paragraph': {'rich_text': [text(article['summary'])]}})
    blocks = [{'object': 'block', 'type': 'toggle', 'toggle': {
        'rich_text': [text(f'📰 {today} · 새 뉴스 {len(articles)}건', bold=True)], 'children': children}}]
    fetch(f'https://api.notion.com/v1/blocks/{NOTION_PAGE_ID}/children', data=json.dumps({'children': blocks}).encode(), method='PATCH',
          headers={'Authorization': f'Bearer {token}', 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json'})
    log(f'Notion: appended {len(articles)} articles')
    return True


def main():
    dry_run = '--dry-run' in sys.argv
    now = dt.datetime.now(KST)
    os.makedirs(STATE_DIR, exist_ok=True)
    state = load_state()
    first_run = not state['seen']

    found = {}
    for query in QUERIES:
        try:
            for article in search(query):
                found.setdefault(article['id'], article)
        except Exception as error:
            log(f'search failed for "{query}": {error}')
    fresh = [a for a in found.values() if a['id'] not in state['seen']]
    if first_run:
        cutoff = (now - dt.timedelta(days=FIRST_RUN_DAYS)).isoformat()
        fresh = [a for a in fresh if a['published'] >= cutoff]
    # Several outlets often carry the same story; keep the first copy of each title.
    titles, new = set(), []
    for article in sorted(fresh, key=lambda a: a['published'], reverse=True):
        key = re.sub(r'\W', '', article['title'])
        if key not in titles:
            titles.add(key)
            new.append(article)
    log(f'{len(found)} articles found, {len(new)} new')

    for article in new:
        try:
            article['url'] = original_url(article['id'])
            page = fetch(article['url'])
            article['image'] = meta(page, 'og:image')
            article['summary'] = summarize(article['title'], article_text(page))
        except Exception as error:
            log(f'could not process "{article["title"][:40]}": {error}')
            article.setdefault('url', article['google_url'])
            article.setdefault('image', '')
            article['summary'] = article.get('summary') or '(요약을 만들지 못했습니다. 링크에서 원문을 확인해 주세요.)'
        time.sleep(2)

    if dry_run:
        print(json.dumps(new, ensure_ascii=False, indent=2))
        return

    posted = notion_append(new, now.strftime('%Y-%m-%d')) if new else True
    # Remember everything seen (including older backlog on the first run) once the report is delivered.
    if posted:
        for article_id in found:
            state['seen'].setdefault(article_id, now.strftime('%Y-%m-%d'))
        with open(STATE_FILE, 'w', encoding='utf-8') as file:
            json.dump(state, file, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()

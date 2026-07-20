# Google Sheets and Drive gallery

The Gallery page reads the `갤러리` tab from the same Google Sheet used for publications, patents, people, and news. It displays direct image links without embedding a Drive folder.

## Sheet columns

| 날짜 | 이미지 제목 | 이미지 폴더 링크 | 이미지 링크 |
| --- | --- | --- | --- |
| 2026.06 | ICRA 2026 | Optional folder link | One or more Drive image links |

Rows with the same date and image title are merged into one album. Image links can be entered in any of these ways:

- Paste multiple links into one cell using line breaks.
- Put links in several columns on the same row.
- Use several rows with the same date and image title.

Folder links are ignored when building thumbnails. Only direct image file links are displayed.

To add an album:

1. Set each Drive image to **Anyone with the link**.
2. Add one or more rows to the `갤러리` sheet tab.
3. Enter the date, album title, and image file links.
4. Reload the Gallery page.

# Community Map: Quick Guide

## The Three Pages

- **index.html** is the map visitors see.
- **edit.html** is the editor. Everything about the map is changed here.
- **tools.html** has QR signs, icons, marker shapes and the Building Designer.

## Making Changes

1. Open `edit.html`.
2. Make your changes. They're kept in this browser right away ("Saved on This Device"), so closing the tab loses nothing.
3. Press **Preview** to see the real map with your changes. Nobody else sees them yet.
4. Press **Publish**. It checks the data first and refuses anything that would break the map. Then it shows what changed and sends it.

## Publishing

- **GitHub:** fill in Owner, Repository, Branch and an Access Token once. Every publish is one step, and **Restore** can undo the last one.
  - To make a token: on GitHub go to Settings, Developer Settings, Fine-Grained Tokens. Give it this repository, with **Contents: Read and Write**.
  - The token stays on the computer you typed it on.
- **Download as ZIP:** works with any web host. Upload the files through the host's file manager or FTP, keeping the folders. Turn on **The Whole Site** for a brand-new host.

## The Folders

| Folder | What's in it |
| --- | --- |
| `data/` | The 9 data files: settings, items, categories, media, tours, passport, happenings, map layers, icons. The editor writes these. |
| `media/` | Photos (with small copies in `media/thumbs/`), audio and animations. |
| `overlays/` | Old maps. |
| `events/` | Event and interior folders. Each one only holds the files that differ from the main map. |
| `app/` | The code. Nobody needs to open it, and the editor never changes it. |
| `samples/` | A made-up sample town for learning. Not needed on a live site. |

## When Something Looks Wrong

- Add `?debug=1` to the map's address to see a list of problems, naming the file and the item.
- Add `?safe=1` to load the map with the extras switched off.
- Other handy links:
  - `?intro=1` replays the welcome screen.
  - `?pretend=1` gives a dot you can drag to test Near Me.
  - `?resetpassport` clears a phone's passport.
  - `?camdebug=1` outlines a tour's camera frame.

## Embedding

The editor's Look panel, under **Embed on Another Site**, gives you one line of code to paste into another website.

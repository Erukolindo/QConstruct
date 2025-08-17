# QConstruct

QConstruct is a browser-based playlist organizer and shuffler for YouTube videos. It uses a tag-based system to build dynamic playlists and has a bunch of quality of life features.

---

## 📦 How to Run

1. **Obtain a YouTube API Key**  
   - Go to [Google Cloud Console](https://console.cloud.google.com/), create a project, enable the YouTube Data API v3, and generate an API key. You can easily find detailed tutorials on that.
   - Paste the key into the designated field in the interface and press **Save** (it will be remembered via localStorage).

2. **Open the App**  
   - You can use it online at [QConstruct](https://erukolindo.github.io/QConstruct/), or download it and run locally.
   - On desktop: open `index.html` directly in a browser.
   - On Android: due to security restrictions, opening from a file (i.e. `file://`) **won’t work in any browser**. You'll need to serve it over `http://` (e.g. with `python -m http.server`), install it as a PWA, or use a specialized app, [like the one I made for testing](https://github.com/Erukolindo/FileWebViewer/tree/v1.0).
   - The only meaningful difference between these approaches is that Youtube API doesn't seem to serve adds when ran from a file.

3. **PWA Support**  
   - QConstruct supports Progressive Web App installation.
   - When accessed over `http(s)`, browsers like Chrome will offer an "Install App" option.
   - Once installed, it behaves like a native app with persistent storage.

---

## 🛠️ Features

### 📥 Build a Local Database

- Add YouTube **videos** or **playlists** via links.
- Automatically fetches metadata and tags each video with:
  - Its channel (e.g., `by: ArtistName`)
  - The playlist it came from (e.g., `playlist: Favorites`)

---

### 🏷️ Tag-Based Playlist Creation

- You can add custom tags to videos to organize them however you like, for example:
  - Mood (`chill`, `hype`)
  - Genre (`jazz`, `rock`)
  - Context (`study`, `drive`, `party`)
- Playlists consist of two sets of tags: include tags and exclude tags.
- Playlist behavior:
  - A playlist contains all videos that have at least one of the **include** tags and none of the **exclude** tags.
  - Special case: the tag `"All"` can be used to include every video in the database (except for ones filtered out by the **exclude** tags).

![chrome_U1XYTeT91N](https://github.com/user-attachments/assets/16184593-6283-4683-96bf-b86ef09f00b3)

---

### 🧠 Tag & Category Management

- Tags are assigned to **categories** (by default: `normal`, others like `creator`, `playlist`, `special`).
- You can create, rename, and delete custom categories.
- Tag manager interface lets you:
  - Filter by category
  - Edit or reassign categories
  - Rename and merge tags
  - View what videos have the given tag

![chrome_dJN9dw6NiP](https://github.com/user-attachments/assets/48a72f3c-9799-40b0-bc35-4c9ac43ee621)

---

🤖 Automated Tag Conversion

- Create conversion rules to automatically tag videos based on their title, channel name, or existing tags.
- Rules can use "contains" or "matches" logic with optional case sensitivity.
- A new rule is automatically applied to all videos in the database.
- All rules are applied to new videos added to the database.
- Rules are exported and imported alongside other database data

---

### 🛑 Special Tags

- `"Unavailable"`: automatically assigned when a video fails to load (e.g., deleted or region-locked)
- `"null"`: used when a video has no identifiable channel name via API
- `"All"`: special pseudo-tag — see above under playlist rules
  - Cannot be manually added
  - Cannot be used in exclusions or removal tools

---

### 💾 Import & Export

- Export playlists as `.txt` files with all matching video URLs
- Export or import the **entire database** (`.json`)
- Merge databases from different devices

---

### 🔀 Shuffling Behavior

- Playlists are **automatically shuffled** when played.
- You can **Append** playlists to the end of the current shuffled queue
- You can:
  - **Reshuffle**: reshuffle the existing combined list
  - **Regenerate**: rebuild the list from the last selected playlist's tags (restores videos removed from the queue, accounts for changes in tags, removed the appended videos)

---

### 🎞️ Video Details

- Edit video's tags
- Set start/end timestamps for playback
- Permanently delete videos from the database

![chrome_A5psq8llBH](https://github.com/user-attachments/assets/2333e0d5-f617-4864-b5f0-2ce8e51b5b89)

---

### 🧹 Shuffled List Editing

- Remove all videos with a specific tag
- Remove individual videos from the queue
- Skip to a selected video in the list
- “Scroll to current” button to jump to the currently playing item

---

### 🎛️ Playback Options

- Loop the entire playlist
- Skip unavailable videos automatically

---

### 💾 Autosave & Persistence

- The app autosaves your:
  - API Key
  - Playlist and video database
- These are stored using localStorage
- You can also manually export/import/merge databases
- On page reload, you're prompted to restore from autosave

---

### 🌙 Dark Mode

- Dark mode is the default
- Light mode is available via toggle

---

## 💬 Notes

- Data is stored locally in your browser.
- It will persist even if you close the tab.
- Does not upload anything — no backend.

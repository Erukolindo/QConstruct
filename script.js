let videos = [];
let playlists = [];
let tags = {};
let tagCategories = new Set(["normal", "special", "creator", "playlist"]);
let conversionRules = [];
let combinedList = [];
let currentVideoIndex = 0;
let currentPlaylistIndex = 0;
let isTagListExpanded = false;
let player;
let autosaveTimer = null;

document.addEventListener("DOMContentLoaded", () => {
    // Apply dark mode
    const dark = localStorage.getItem('darkMode') === '1';
    document.body.classList.toggle('light', !dark);
    document.getElementById('dark-mode-toggle').checked = dark;

    // Apply API key label
    const saved = getApiKey();
    updateApiKeyStatus(!!saved);

    // Delay autosave restore logic
    setTimeout(() => {
        const autosaved = localStorage.getItem("autosaveDatabase");
        if (autosaved && confirm("Restore from autosave?")) {
            const parsed = JSON.parse(autosaved);

            if (parsed.videos) {
                parsed.videos.forEach(video => {
                    videos.push(video);
                    updateTags(video.tags);
                });
            }

            if (parsed.playlists) {
                parsed.playlists.forEach(newPl => {
                    insertPlaylistSmart(newPl);
                });
            }

            if (parsed.tagCategories) {
                for (const [category, tagList] of Object.entries(parsed.tagCategories)) {
                    tagCategories.add(category);
                    tagList.forEach(tag => {
                        if (!tags[tag]) tags[tag] = { category };
                        else {
                            const existing = tags[tag].category || "normal";
                            if (existing === "normal") {
                                tags[tag].category = category;
                            } else if (existing !== category) {
                                console.warn(`Conflict: keeping existing category "${existing}" for tag "${tag}" (imported as "${category}")`);
                            }
                        }
                    });
                }
            }

            if (parsed.conversionRules) {
                conversionRules = parsed.conversionRules;
            }

            renderPlaylistsUI(document.getElementById('playlists-scroll-container'));
            displayPlaylists();
            if (renderTagManager.updateToggles) {
                renderTagManager.updateToggles();
            }
        }
    }, 0);

    if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("./service-worker.js")
            .then(() => console.log("✅ Service worker registered"))
            .catch((err) => console.error("Service worker failed:", err));
    }

    if (location.protocol === "http:" || location.protocol === "https:") {
        const manifest = document.createElement("link");
        manifest.rel = "manifest";
        manifest.href = "manifest.json";
        document.head.appendChild(manifest);
    }

    tags["All"] = { category: "special" }; 

    updateRuntimeStatus();
});

function updateRuntimeStatus() {
    const el = document.getElementById("runtime-status");
    if (!el) return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    let status = "";
    if (isStandalone) {
        status = "📱 Installed (PWA)";
    } else if (location.protocol === "file:") {
        status = "🗂️ Local File Mode";
    } else {
        status = "🌐 Browser Mode";
    }

    el.textContent = `QConstruct – ${status}`;
}

function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autosaveDatabase, 10000);
}

function getApiKey() {
    return localStorage.getItem("ytApiKey") || "";
}

function saveApiKey() {
    const key = document.getElementById("api-key-input").value.trim();
    if (key) {
        localStorage.setItem("ytApiKey", key);
        updateApiKeyStatus(true);
    }
}

function updateApiKeyStatus(hasKey) {
    const label = document.getElementById("api-key-status");
    label.textContent = hasKey ? "Key loaded" : "";
}

function toggleDarkMode() {
    const enabled = document.getElementById('dark-mode-toggle').checked;
    document.body.classList.toggle('light', !enabled);
    localStorage.setItem('darkMode', enabled ? '1' : '0');
}


function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function updateTags(videoTags) {
    if (!Array.isArray(videoTags)) {
        console.error('videoTags is not an array:', videoTags);
        return;
    }
    videoTags.forEach(tag => {
        if (!tags.hasOwnProperty(tag)) {
            tags[tag] = { category: "normal" };
        } else if (!tags[tag].category) {
            tags[tag].category = "normal";
        }
        tagCategories.add(tags[tag].category);
    });

    scheduleAutosave();
}

async function addFromLink() {
    const input = document.getElementById('playlist-url').value.trim();

    const playlistMatch = input.match(/[?&]list=([^&]+)/);
    const videoMatch = input.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);

    if (playlistMatch) {
        const playlistId = playlistMatch[1];
        const { playlistName, videos: videosData } = await fetchPlaylistData(playlistId);
        if (!videosData || !Array.isArray(videosData)) {
            alert('Failed to fetch playlist data.');
            return;
        }

        videosData.forEach(video => addVideoToDatabase(video, playlistName));
        displayPlaylists();
    } else if (videoMatch) {
        const videoId = videoMatch[1];
        const video = await fetchSingleVideoData(videoId);
        if (video) {
            addVideoToDatabase(video, '');
            displayPlaylists();
        } else {
            alert('Failed to fetch video data.');
        }
    } else {
        alert('Please enter a valid YouTube Playlist or Video URL.');
    }
}

async function fetchSingleVideoData(videoId) {
    const apiKey = getApiKey();
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
        const data = await response.json();

        if (!data.items || data.items.length === 0) return null;

        const item = data.items[0];
        return {
            name: item.snippet.title,
            channel: item.snippet.channelTitle,
            date: new Date(item.snippet.publishedAt).toLocaleDateString(),
            link: `https://www.youtube.com/watch?v=${videoId}`
        };
    } catch (err) {
        console.error('Error fetching video data:', err);
        return null;
    }
}


function addVideoToDatabase(video, playlistTag = "") {
    if (!video.tags) video.tags = [];

    if (playlistTag && playlistTag !== "") {
        const tag = "playlist: " + playlistTag;
        video.tags.push(tag);
        if (!tags[tag]) tags[tag] = { category: "playlist" };
        tagCategories.add("playlist");
    }

    if (video.channel) {
        const tag = "by: " + video.channel;
        video.tags.push(tag);
        if (!tags[tag]) tags[tag] = { category: "creator" };
        tagCategories.add("creator");
    }

    video.tags = [...new Set(video.tags)];

    const existingVideo = videos.find(v => v.link === video.link);
    if (existingVideo) {
        existingVideo.tags = Array.from(new Set([...existingVideo.tags, ...video.tags]));
        // Apply conversion rules to the updated video
        conversionRules.forEach(rule => {
            if (rule.ruleString.trim() && rule.resultingTag.trim()) {
                applyRuleToVideo(existingVideo, rule);
            }
        });
    } else {
        // Apply conversion rules to new video
        conversionRules.forEach(rule => {
            if (rule.ruleString.trim() && rule.resultingTag.trim()) {
                applyRuleToVideo(video, rule);
            }
        });
        videos.push(video);
    }

    updateTags(video.tags); //this also calls scheduleAutosave, so no need to call it again
}

async function fetchPlaylistData(playlistId) {
    const apiKey = getApiKey();
    let nextPageToken = '';
    const videos = [];
    let playlistName = '';

    try {
        // Fetch playlist details to get the name
        const playlistResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`);
        const playlistData = await playlistResponse.json();
        if (playlistData.items && playlistData.items.length > 0) {
            playlistName = playlistData.items[0].snippet.title;
        } else {
            throw new Error('Failed to fetch playlist name.');
        }

        do {
            const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&pageToken=${nextPageToken}&key=${apiKey}`);
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error.message);
            }

            const videoIds = data.items.map(item => item.snippet.resourceId.videoId);
            const videoDetails = await fetchVideoDetails(videoIds, apiKey);

            data.items.forEach((item, index) => {
                const videoId = item.snippet.resourceId.videoId;
                const video = {
                    name: item.snippet.title,
                    channel: item.snippet.videoOwnerChannelTitle,
                    date: videoDetails[videoId] ? new Date(videoDetails[videoId].publishedAt).toLocaleDateString() : 'Unknown',
                    link: `https://www.youtube.com/watch?v=${videoId}`
                };
                videos.push(video);
            });

            nextPageToken = data.nextPageToken || '';
        } while (nextPageToken);
    } catch (error) {
        console.error('Error fetching playlist data:', error);
        return null;
    }

    return { playlistName, videos };
}

async function fetchVideoDetails(videoIds, apiKey) {
    const videoDetailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}&key=${apiKey}`);
    const videoDetailsData = await videoDetailsResponse.json();

    if (videoDetailsData.error) {
        throw new Error(videoDetailsData.error.message);
    }

    const videoDetails = {};
    videoDetailsData.items.forEach(item => {
        videoDetails[item.id] = {
            publishedAt: item.snippet.publishedAt
        };
    });

    return videoDetails;
}

function toggleCategoryManager() {
    const section = document.getElementById('category-manager');
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        renderCategoryManager();
    } else {
        section.classList.add('hidden');
    }
}

function renderCategoryManager() {
    const section = document.getElementById('category-manager');
    section.innerHTML = '';

    const defaultCategories = ["normal", "special", "creator", "playlist"];
    const all = [...tagCategories].sort();

    const addInput = document.createElement('input');
    addInput.type = 'text';
    addInput.placeholder = 'New category name';
    section.appendChild(addInput);

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add Category';
    addBtn.onclick = () => {
        const newCat = addInput.value.trim();
        if (newCat && !tagCategories.has(newCat) && !defaultCategories.includes(newCat)) {
            tagCategories.add(newCat);
            renderCategoryManager();
            if (renderTagManager.updateToggles) {
                renderTagManager.updateToggles();
            }
        }
        addInput.value = '';

        scheduleAutosave();
    };
    section.appendChild(addBtn);

    section.appendChild(document.createElement('hr'));

    all.forEach(cat => {
        if (defaultCategories.includes(cat)) return; // Skip default categories
        const row = document.createElement('div');
        row.classList.add('manager-row');
        row.style.marginBottom = '4px';

        const label = document.createElement('span');
        label.classList.add('fixed-label');
        label.textContent = cat;
        label.style.fontWeight = 'normal';
        label.style.marginRight = '10px';
        row.appendChild(label);

        const renameInput = document.createElement('input');
        renameInput.type = 'text';
        renameInput.placeholder = 'Rename to...';
        renameInput.style.marginRight = '5px';
        row.appendChild(renameInput);

        const renameBtn = document.createElement('button');
        renameBtn.textContent = 'Rename';
        renameBtn.onclick = () => {
            const newName = renameInput.value.trim();
            if (!newName || tagCategories.has(newName) || defaultCategories.includes(newName)) return;

            tagCategories.delete(cat);
            tagCategories.add(newName);

            Object.keys(tags).forEach(tag => {
                if (tags[tag].category === cat) {
                    tags[tag].category = newName;
                }
            });

            if (renderTagManager.updateToggles) {
                renderTagManager.updateToggles();
            }

            renderCategoryManager();
            renderTagManager();

            scheduleAutosave();
        };
        row.appendChild(renameBtn);

        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.style.marginLeft = '5px';
        delBtn.onclick = () => {
            if (!confirm(`Delete category "${cat}"? Tags will become 'normal'.`)) return;

            tagCategories.delete(cat);
            Object.keys(tags).forEach(tag => {
                if (tags[tag].category === cat) {
                    tags[tag].category = "normal";
                }
            });

            if (renderTagManager.updateToggles) {
                renderTagManager.updateToggles();
            }

            renderCategoryManager();
            renderTagManager();

            scheduleAutosave();
        };
        row.appendChild(delBtn);

        section.appendChild(row);
    });

    scheduleAlignLabels();
}

function toggleTagManager() {
    const section = document.getElementById('tag-manager-section');
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        renderTagManager();
    } else {
        section.classList.add('hidden');
    }
}

function renderTagManager(filterText = '') {
    const section = document.getElementById('tag-manager-section');
    let videoListOpenFor = null;
    
    // Only create the layout once
    if (!section.dataset.initialized) {
        section.dataset.initialized = 'true';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search tags...';
        searchInput.style.marginBottom = '10px';
        searchInput.style.display = 'block';
        searchInput.id = 'tag-search-box';
        searchInput.oninput = () => {
            renderTagManager(searchInput.value.toLowerCase());
        };
        section.appendChild(searchInput);

        const tagListContainer = document.createElement('div');
        tagListContainer.id = 'tag-manager-list';
        section.appendChild(tagListContainer);
    }

    // Create filter toggles
    let toggleWrapper = document.getElementById('tag-category-toggles');
    if (!toggleWrapper) {
        toggleWrapper = document.createElement('div');
        toggleWrapper.id = 'tag-category-toggles';
        toggleWrapper.style.marginBottom = '10px';

        section.insertBefore(toggleWrapper, section.querySelector('#tag-manager-list'));

        // Set to include all by default
        renderTagManager.visibleCategories = new Set(tagCategories);

        const updateToggles = () => {
            toggleWrapper.innerHTML = '';
            [...tagCategories].sort().forEach(cat => {
                const label = document.createElement('label');
                label.style.marginRight = '8px';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = renderTagManager.visibleCategories.has(cat);

                checkbox.onchange = () => {
                    if (checkbox.checked) {
                        renderTagManager.visibleCategories.add(cat);
                    } else {
                        renderTagManager.visibleCategories.delete(cat);
                    }

                    const allUnchecked = [...tagCategories].every(c => !renderTagManager.visibleCategories.has(c));
                    if (allUnchecked) {
                        tagCategories.forEach(c => renderTagManager.visibleCategories.add(c));
                    }

                    const searchBox = document.getElementById('tag-search-box');
                    const currentFilter = searchBox?.value?.toLowerCase() || '';
                    renderTagManager(currentFilter);
                };

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${cat}`));
                toggleWrapper.appendChild(label);
            });
        };

        renderTagManager.updateToggles = updateToggles;
    }

    const tagList = document.getElementById('tag-manager-list');
    tagList.innerHTML = '';

    if (renderTagManager.updateToggles) {
        renderTagManager.updateToggles();
    }

    const allTags = Object.keys(tags).sort((a, b) => {
        if (a == null) return 1;
        if (b == null) return -1;
        const catA = tags[a]?.category || "normal";
        const catB = tags[b]?.category || "normal";
        if (catA === "special" && catB !== "special") return -1;
        if (catB === "special" && catA !== "special") return 1;
        if (catA !== catB) return catA.localeCompare(catB, undefined, { sensitivity: 'base' });
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    const visible = renderTagManager.visibleCategories || new Set(tagCategories);

    allTags
        .filter(tag =>
            tag != null &&
            tag.toLowerCase().includes(filterText) &&
            visible.has((tags[tag]?.category) || "normal")
        )
        .forEach(tag => {
            const row = document.createElement('div');
            row.classList.add('manager-row');
            row.style.marginBottom = '5px';

            const tagLabel = document.createElement('span');
            tagLabel.classList.add('fixed-label');
            tagLabel.textContent = tag;
            tagLabel.style.fontWeight = 'bold';
            tagLabel.style.marginRight = '10px';
            row.appendChild(tagLabel);

            const categoryDropdown = document.createElement('select');
            categoryDropdown.style.marginLeft = '6px';

            const currentCat = tags[tag]?.category || "normal";
            [...tagCategories].sort().forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                if (cat === currentCat) opt.selected = true;
                if (cat === "special") opt.disabled = true;
                categoryDropdown.appendChild(opt);
            });

            categoryDropdown.onchange = () => {
                const newCat = categoryDropdown.value;
                if (tags[tag].category !== "special") {
                    tags[tag].category = newCat;
                    tagCategories.add(newCat);
                    renderTagManager.updateToggles?.();
                    scheduleAutosave();
                } else {
                    categoryDropdown.value = "special";
                }
            };

            if (currentCat === "special") {
                categoryDropdown.disabled = true;
            }
            row.appendChild(categoryDropdown);

            const showBtn = document.createElement('button');
            showBtn.textContent = 'Show Videos';
            let videoListDiv = null;

            showBtn.onclick = () => {
                // If already open for this tag, toggle it off
                if (videoListOpenFor === tag && videoListDiv) {
                    videoListDiv.remove();
                    videoListOpenFor = null;
                    videoListDiv = null;
                    return;
                }

                // Close any existing open list
                const existing = document.querySelector('.tag-video-list');
                if (existing) existing.remove();

                videoListOpenFor = tag;

                videoListDiv = document.createElement('div');
                videoListDiv.className = 'tag-video-list';
                videoListDiv.style.marginTop = '6px';
                videoListDiv.style.paddingLeft = '20px';
                videoListDiv.style.borderLeft = '2px solid #888';

                const matching = videos.filter(v => v.tags.includes(tag));
                if (matching.length === 0) {
                    videoListDiv.textContent = '(No videos with this tag)';
                } else {
                    matching.forEach(video => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.justifyContent = 'space-between';
                        row.style.alignItems = 'center';
                        row.style.marginBottom = '2px';

                        const name = document.createElement('span');
                        name.textContent = video.name || video.link;
                        row.appendChild(name);

                        const removeBtn = document.createElement('button');
                        removeBtn.textContent = '❌';
                        removeBtn.onclick = () => {
                            video.tags = video.tags.filter(t => t !== tag);
                            row.style.opacity = '0.5';
                            row.style.pointerEvents = 'none';
                            row.style.textDecoration = 'line-through';
                        };

                        row.appendChild(removeBtn);
                        videoListDiv.appendChild(row);
                    });
                }

                row.appendChild(videoListDiv); // 'row' is the tag's row in the manager
            };
            row.appendChild(showBtn);

            if (currentCat !== "special") {

                const input = document.createElement('input');
                input.type = 'text';
                input.placeholder = 'Rename/Merge into...';
                input.style.marginRight = '5px';
                row.appendChild(input);

                const mergeBtn = document.createElement('button');
                mergeBtn.textContent = 'Rename/Merge';
                mergeBtn.onclick = () => {
                    const newTag = input.value.trim();
                    if (!newTag || newTag === tag) return;

                    videos.forEach(video => {
                        if (video.tags.includes(tag)) {
                            video.tags = [...new Set(video.tags.map(t => t === tag ? newTag : t))];
                        }
                    });

                    playlists.forEach(pl => {
                        pl.includedTags = pl.includedTags.map(t => t === tag ? newTag : t);
                        pl.excludedTags = pl.excludedTags.map(t => t === tag ? newTag : t);
                    });

                    delete tags[tag];
                    updateTags([newTag]); //calls scheduleAutosave
                    renderTagManager(filterText);
                    renderPlaylistsUI(document.getElementById('playlists-scroll-container'));
                };
                row.appendChild(mergeBtn);

                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.style.marginLeft = '10px';
                delBtn.onclick = () => {
                    if (!confirm(`Remove all instances of tag "${tag}"?`)) return;

                    videos.forEach(video => {
                        video.tags = video.tags.filter(t => t !== tag);
                    });

                    playlists.forEach(pl => {
                        pl.includedTags = pl.includedTags.filter(t => t !== tag);
                        pl.excludedTags = pl.excludedTags.filter(t => t !== tag);
                    });

                    delete tags[tag];
                    renderTagManager(filterText);
                    renderPlaylistsUI(document.getElementById('playlists-scroll-container'));
                    scheduleAutosave();
                };
                row.appendChild(delBtn);
            }

            tagList.appendChild(row);
        });
    scheduleAlignLabels();
}

function toggleAutomatedTagConversion() {
    const section = document.getElementById('automated-tag-conversion-section');
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        renderConversionRules();
    } else {
        section.classList.add('hidden');
    }
}

function renderConversionRules() {
    const section = document.getElementById('conversion-rules-list');
    section.innerHTML = '';

    // Always ensure there's an empty template at the end
    const hasEmptyTemplate = conversionRules.length > 0 &&
        conversionRules[conversionRules.length - 1].ruleString === '';

    if (!hasEmptyTemplate) {
        conversionRules.push({
            ruleString: '',
            matchType: 'contains',
            caseSensitive: false,
            targetType: 'tag',
            resultingTag: '',
            edited: false
        });
    }

    // Display rules in reverse order (newest first, template last)
    const displayRules = [...conversionRules].reverse();

    displayRules.forEach((rule, displayIndex) => {
        const actualIndex = conversionRules.length - 1 - displayIndex;
        const isTemplate = actualIndex === conversionRules.length - 1 && rule.ruleString === '';

        const row = document.createElement('div');
        row.classList.add('manager-row');
        row.style.marginBottom = '5px';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.flexWrap = 'wrap';

        // Rule string input
        const ruleInput = document.createElement('input');
        ruleInput.type = 'text';
        ruleInput.placeholder = 'Rule string';
        ruleInput.value = rule.ruleString;
        ruleInput.style.minWidth = '150px';
        ruleInput.oninput = () => {
            rule.ruleString = ruleInput.value;
            rule.edited = true;
            updateApplyButtonState();
        };
        row.appendChild(ruleInput);

        // Match type dropdown
        const matchTypeSelect = document.createElement('select');
        ['contains', 'matches'].forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (rule.matchType === type) option.selected = true;
            matchTypeSelect.appendChild(option);
        });
        matchTypeSelect.onchange = () => {
            rule.matchType = matchTypeSelect.value;
            rule.edited = true;
            updateApplyButtonState();
        };
        row.appendChild(matchTypeSelect);

        // Case sensitive toggle
        const caseLabel = document.createElement('label');
        caseLabel.style.display = 'flex';
        caseLabel.style.alignItems = 'center';
        caseLabel.style.gap = '4px';
        const caseCheckbox = document.createElement('input');
        caseCheckbox.type = 'checkbox';
        caseCheckbox.checked = rule.caseSensitive;
        caseCheckbox.onchange = () => {
            rule.caseSensitive = caseCheckbox.checked;
            rule.edited = true;
            updateApplyButtonState();
        };
        caseLabel.appendChild(caseCheckbox);
        caseLabel.appendChild(document.createTextNode('Case sensitive'));
        row.appendChild(caseLabel);

        // Target type dropdown
        const targetSelect = document.createElement('select');
        ['tag', 'video title', 'channel name'].forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (rule.targetType === type) option.selected = true;
            targetSelect.appendChild(option);
        });
        targetSelect.onchange = () => {
            rule.targetType = targetSelect.value;
            rule.edited = true;
            updateApplyButtonState();
        };
        row.appendChild(targetSelect);

        // Resulting tag input with autofill
        const resultInput = document.createElement('input');
        resultInput.type = 'text';
        resultInput.placeholder = 'Resulting tag';
        resultInput.value = rule.resultingTag;
        resultInput.style.minWidth = '150px';

        // Create datalist for tag suggestions
        const datalistId = `rule-tag-suggestions-${actualIndex}`;
        const datalist = document.createElement('datalist');
        datalist.id = datalistId;
        resultInput.setAttribute('list', datalistId);
        row.appendChild(datalist);

        resultInput.oninput = () => {
            rule.resultingTag = resultInput.value;
            rule.edited = true;
            updateApplyButtonState();

            // Update datalist with tag suggestions
            datalist.innerHTML = '';
            const value = resultInput.value.toLowerCase();
            Object.keys(tags)
                .filter(tag => tag !== "All" && tag.toLowerCase().includes(value))
                .forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag;
                    datalist.appendChild(option);
                });
        };
        row.appendChild(resultInput);

        // Apply button (only shown when edited)
        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply';
        applyBtn.style.display = rule.edited ? 'inline-block' : 'none';
        applyBtn.onclick = () => applyConversionRule(actualIndex);
        row.appendChild(applyBtn);

        // Delete button (not shown for template)
        if (!isTemplate) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.onclick = () => {
                if (confirm('Delete this conversion rule?')) {
                    conversionRules.splice(actualIndex, 1);
                    renderConversionRules();
                    scheduleAutosave();
                }
            };
            row.appendChild(deleteBtn);
        }

        function updateApplyButtonState() {
            applyBtn.style.display = rule.edited ? 'inline-block' : 'none';
        }

        section.appendChild(row);
    });
}

function applyConversionRule(ruleIndex) {
    const rule = conversionRules[ruleIndex];

    if (!rule.ruleString.trim() || !rule.resultingTag.trim()) {
        alert('Please fill in both rule string and resulting tag.');
        return;
    }

    // If this is the template (last rule), create a new empty template
    if (ruleIndex === conversionRules.length - 1 && rule.ruleString !== '') {
        conversionRules.push({
            ruleString: '',
            matchType: 'contains',
            caseSensitive: false,
            targetType: 'tag',
            resultingTag: '',
            edited: false
        });
    }

    // Apply rule to all videos
    applyRuleToAllVideos(rule);

    // Mark as no longer edited
    rule.edited = false;

    // Re-render the rules
    renderConversionRules();

    // Update tag manager if it's visible
    if (!document.getElementById('tag-manager-section').classList.contains('hidden')) {
        renderTagManager();
    }

    scheduleAutosave();
}

function applyRuleToAllVideos(rule) {
    videos.forEach(video => applyRuleToVideo(video, rule));
}

function applyRuleToVideo(video, rule) {
    // Check if video already has the resulting tag
    if (video.tags.includes(rule.resultingTag)) {
        return;
    }

    let searchTargets = [];

    switch (rule.targetType) {
        case 'tag':
            searchTargets = video.tags;
            break;
        case 'video title':
            searchTargets = [video.name];
            break;
        case 'channel name':
            searchTargets = [video.channel];
            break;
    }

    const matches = searchTargets.some(target => {
        if (!target) return false;

        const searchString = rule.caseSensitive ? target : target.toLowerCase();
        const ruleString = rule.caseSensitive ? rule.ruleString : rule.ruleString.toLowerCase();

        if (rule.matchType === 'contains') {
            return searchString.includes(ruleString);
        } else { // matches
            return searchString === ruleString;
        }
    });

    if (matches) {
        video.tags.push(rule.resultingTag);
        updateTags([rule.resultingTag]);
    }
}

function alignFixedLabels() {
    const labels = document.querySelectorAll('.fixed-label');
    if (labels.length === 0) return;

    let maxWidth = 0;

    labels.forEach(label => {
        label.style.width = 'auto'; // Reset before measuring
        const width = label.offsetWidth;
        if (width > maxWidth) maxWidth = width;
    });

    labels.forEach(label => {
        label.style.width = `${maxWidth}px`;
    });
}

let labelAlignTimer;
function scheduleAlignLabels() {
    clearTimeout(labelAlignTimer);
    labelAlignTimer = setTimeout(alignFixedLabels, 100);
}


function autosaveDatabase() {
    try {
        const saveData = JSON.stringify(getAllPlaylistsData());

        if (saveData.length < 4_000_000) { // ~4 MB safety margin
            localStorage.setItem("autosaveDatabase", saveData);
        } else {
            console.warn("Autosave skipped: too large");
        }
    } catch (err) {
        console.error("Autosave failed:", err);
    }
}

function downloadAllPlaylistsData() {
    const allPlaylistsData = getAllPlaylistsData();

    const dataStr = JSON.stringify(allPlaylistsData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = 'QConstruct_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function getAllPlaylistsData()
{
    const tagUsage = new Set(videos.flatMap(v => v.tags));

    const categoryMap = {};
    for (const [tag, { category }] of Object.entries(tags)) {
        if (!tagUsage.has(tag)) continue; // Skip unused
        if (category === "normal") continue;

        if (!categoryMap[category]) {
            categoryMap[category] = [];
        }
        categoryMap[category].push(tag);
    }

    const allPlaylistsData = {
        videos: videos,
        playlists: playlists,
        tagCategories: categoryMap,
        conversionRules: conversionRules
    };

    return allPlaylistsData;
}

function loadPlaylists() {
    const fileInput = document.getElementById('file-input');
    const files = fileInput.files;
    if (files.length === 0) {
        alert("Please select playlist files to load.");
        return;
    }
    let firstFile = true;
    const hasDataAlready = videos.length > 0 || playlists.length > 0;

    const processFile = (file, mode) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const playlistData = JSON.parse(e.target.result);

            if (mode === 'override') {
                videos = [];
                playlists = [];
            }

            if (playlistData.videos) {
                playlistData.videos.forEach(video => {
                    let existingVideo = videos.find(v => v.link === video.link);
                    if (existingVideo) {
                        existingVideo.tags = Array.from(new Set([...existingVideo.tags, ...video.tags]));
                    } else {
                        videos.push(video);
                    }
                    updateTags(video.tags);
                });
            }

            if (playlistData.playlists) {
                playlistData.playlists.forEach(newPl => {
                    insertPlaylistSmart(newPl);
                });
            }

            if (playlistData.tagCategories) {
                for (const [category, tagList] of Object.entries(playlistData.tagCategories)) {
                    tagCategories.add(category);
                    tagList.forEach(tag => {
                        if (!tags[tag]) tags[tag] = { category };
                        else {
                            const existing = tags[tag].category || "normal";
                            if (existing === "normal") {
                                tags[tag].category = category;
                            } else if (existing !== category) {
                                console.warn(`Conflict: keeping existing category "${existing}" for tag "${tag}" (imported as "${category}")`);
                            }
                        }
                    });
                }
            }

            if (playlistData.conversionRules) {
                if (mode === 'override') {
                    conversionRules = playlistData.conversionRules;
                } else {
                    // In merge mode, add rules that don't already exist
                    playlistData.conversionRules.forEach(newRule => {
                        const exists = conversionRules.some(existingRule =>
                            existingRule.ruleString === newRule.ruleString &&
                            existingRule.matchType === newRule.matchType &&
                            existingRule.caseSensitive === newRule.caseSensitive &&
                            existingRule.targetType === newRule.targetType &&
                            existingRule.resultingTag === newRule.resultingTag
                        );
                        if (!exists) {
                            conversionRules.push({ ...newRule, edited: false });
                        }
                    });
                }
            }

            renderPlaylistsUI(document.getElementById('playlists-scroll-container'));
            displayPlaylists();
            if (renderTagManager.updateToggles) {
                renderTagManager.updateToggles();
            }
            renderCategoryManager();
            renderTagManager();
        };
        reader.readAsText(file);
    };

    const proceed = (choice) => {
        for (const file of files) {
            const mode = firstFile ? choice : 'merge';
            firstFile = false;
            processFile(file, mode);
        }
    };

    if (!hasDataAlready) {
        proceed('override');
    } else {
        const defaultChoice = localStorage.getItem('importDefaultMode') || 'merge';
        let response;
        while (true) {
            response = prompt(
                `Importing data.\nType 'm' (merge), 'o' (override), or leave blank to use default: '${defaultChoice}'`
            )?.trim().toLowerCase();

            if (response === null || response === undefined) return;

            if (response === '') {
                proceed(defaultChoice);
                break;
            } else if (response === 'm' || response === 'merge') {
                localStorage.setItem('importDefaultMode', 'merge');
                proceed('merge');
                break;
            } else if (response === 'o' || response === 'override') {
                localStorage.setItem('importDefaultMode', 'override');
                proceed('override');
                break;
            } else {
                alert("Invalid input. Type 'm' or 'merge', 'o' or 'override', or leave empty for default.");
            }
        }
    }
}

function insertPlaylistSmart(newPl) {
    // Ensure tags are sorted
    newPl.includedTags = [...newPl.includedTags].sort();
    newPl.excludedTags = [...newPl.excludedTags].sort();

    // Check for exact match (name + sorted tag lists)
    const isDuplicate = playlists.some(existingPl =>
        existingPl.name === newPl.name &&
        arraysEqual(existingPl.includedTags, newPl.includedTags) &&
        arraysEqual(existingPl.excludedTags, newPl.excludedTags)
    );
    if (isDuplicate) return;

    // Check for name conflict
    const nameConflict = playlists.find(existingPl => existingPl.name === newPl.name &&
        (!arraysEqual(existingPl.includedTags, newPl.includedTags) ||
            !arraysEqual(existingPl.excludedTags, newPl.excludedTags))
    );

    if (nameConflict) {
        let base = newPl.name;
        let suffix = 1;
        while (playlists.some(p => p.name === `${base} (${suffix})`)) {
            suffix++;
        }
        newPl.name = `${base} (${suffix})`;
    }

    // Check for trailing blank playlist
    const last = playlists[playlists.length - 1];
    const isLastBlank = last && !last.name && last.includedTags.length === 0 && last.excludedTags.length === 0;

    if (isLastBlank) {
        playlists.splice(playlists.length - 1, 0, newPl); // insert before blank
    } else {
        playlists.push(newPl);
    }
}

function getVideoCount(tag) {
    return videos.reduce((count, video) => count + (video.tags.includes(tag) ? 1 : 0), 0);
}

function displayPlaylists() {
    const container = document.getElementById('playlists-scroll-container');

    container.style.display = 'flex';
    container.style.overflowX = 'auto';
    container.style.gap = '10px';

    renderPlaylistsUI(container);

    maybeAddBlankPlaylist(); // check again after rendering
}

function renderPlaylistsUI(container) {
    container.innerHTML = ''; // Clear previous content

    playlists.forEach((playlist, index) => {
        const card = document.createElement('div');
        card.classList.add('playlist-card');

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = playlist.name;
        nameInput.placeholder = 'Playlist name';
        nameInput.style.display = 'block';
        nameInput.style.marginBottom = '8px';
        nameInput.onchange = () => {
            playlist.name = nameInput.value;
            maybeAddBlankPlaylist();
            scheduleAutosave();
        };
        card.appendChild(nameInput);

        card.appendChild(createTagEditor(playlist, 'includedTags', 'Include:'));
        card.appendChild(createTagEditor(playlist, 'excludedTags', 'Exclude:'));

        // Row 1: Play + Duplicate
        const row1 = document.createElement('div');
        row1.style.marginTop = '6px';

        const playButton = document.createElement('button');
        playButton.textContent = 'Play';
        playButton.onclick = () => playPlaylist(index);
        row1.appendChild(playButton);

        const duplicateBtn = document.createElement('button');
        duplicateBtn.textContent = 'Duplicate';
        duplicateBtn.style.marginLeft = '6px';
        duplicateBtn.onclick = () => {
            const newPlaylist = JSON.parse(JSON.stringify(playlist));
            let base = playlist.name || 'Copy';
            let suffix = 1;
            while (playlists.some(p => p.name === `${base} (${suffix})`)) suffix++;
            newPlaylist.name = `${base} (${suffix})`;
            playlists.splice(index + 1, 0, newPlaylist);
            renderPlaylistsUI(container);
            scheduleAutosave();
        };
        row1.appendChild(duplicateBtn);
        card.appendChild(row1);

        // Row 2: Delete + Export
        const row2 = document.createElement('div');
        row2.style.marginTop = '4px';

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.onclick = () => {
            if (confirm(`Delete playlist "${playlist.name}"?`)) {
                playlists.splice(index, 1);
                renderPlaylistsUI(container);
                scheduleAutosave();
            }
        };
        row2.appendChild(deleteButton);

        const exportBtn = document.createElement('button');
        exportBtn.textContent = 'Export';
        exportBtn.style.marginLeft = '6px';
        exportBtn.onclick = () => {
            const filtered = videos.filter(video => {
                const included = playlist.includedTags.some(tag => video.tags.includes(tag));
                const excluded = playlist.excludedTags.some(tag => video.tags.includes(tag));
                return included && !excluded;
            });
            const links = filtered.map(v => v.link).join('\n');
            const blob = new Blob([links], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${playlist.name || 'playlist'}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        row2.appendChild(exportBtn);
        card.appendChild(row2);

        // Row 3: Append
        const appendBtn = document.createElement('button');
        appendBtn.textContent = "Append";
        appendBtn.onclick = () => {
            const appended = getShuffledPlaylistVideos(playlist);
            combinedList.push(...appended);
            updateScrollableVideoList();
        };
        card.appendChild(appendBtn);


        // Skip arrow buttons if this is the last (blank) playlist
        const isTemplateCard = index === playlists.length - 1;

        // Arrows: inserted first, at top-left
        if (!isTemplateCard) {
            const arrowContainer = document.createElement('div');
            arrowContainer.style.marginBottom = '5px';


            const leftBtn = document.createElement('button');
            leftBtn.textContent = '◀️';
            leftBtn.style.marginRight = '3px';
            leftBtn.onclick = () => {
                [playlists[index - 1], playlists[index]] = [playlists[index], playlists[index - 1]];
                renderPlaylistsUI(container);
                scheduleAutosave();
            };
            arrowContainer.appendChild(leftBtn);
            if (index <= 0) {
                leftBtn.disabled = true;
            }

            const rightBtn = document.createElement('button');
            rightBtn.textContent = '▶️';
            rightBtn.onclick = () => {
                [playlists[index + 1], playlists[index]] = [playlists[index], playlists[index + 1]];
                renderPlaylistsUI(container);
                scheduleAutosave();
            };
            arrowContainer.appendChild(rightBtn);
            if (index >= playlists.length - 2) {
                rightBtn.disabled = true;
            }

            card.appendChild(arrowContainer);
        }

        container.appendChild(card);
    });
}

function maybeAddBlankPlaylist() {
    var isBlank = false;
    if (playlists.length > 0) {
        const last = playlists[playlists.length - 1];
        isBlank = last && !last.name && last.includedTags.length === 0 && last.excludedTags.length === 0;
    }
    if (!isBlank) {
        playlists.push({
            name: '',
            includedTags: [],
            excludedTags: []
        });
        renderPlaylistsUI(document.getElementById('playlists-scroll-container'));
    }
}

function createTagEditor(playlist, key, labelText) {
    const wrapper = document.createElement('div');
    const toggleButton = document.createElement('button');
    toggleButton.textContent = `${labelText} (▶)`;
    toggleButton.style.display = 'block';

    const section = document.createElement('div');
    section.style.marginTop = '5px';
    section.style.display = 'none'; // collapsed by default

    let expanded = false;
    toggleButton.onclick = () => {
        expanded = !expanded;
        section.style.display = expanded ? 'block' : 'none';
        toggleButton.textContent = `${labelText} (${expanded ? '▼' : '▶'})`;
    };

    wrapper.appendChild(toggleButton);
    wrapper.appendChild(section);

    const tagList = document.createElement('div');
    tagList.style.display = 'flex';
    tagList.style.flexWrap = 'wrap';
    tagList.style.gap = '4px';
    tagList.style.marginBottom = '4px';
    tagList.style.maxWidth = '100%';
    tagList.style.overflowWrap = 'break-word';
    tagList.style.wordWrap = 'break-word';
    section.appendChild(tagList);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add tag...';
    input.style.marginTop = '4px';
    section.appendChild(input);

    const datalist = document.createElement('datalist');
    const datalistId = `tag-suggestions-${key}-${Math.random().toString(36).substr(2, 5)}`;
    datalist.id = datalistId;
    section.appendChild(datalist);
    input.setAttribute('list', datalistId);

    function renderTagList() {
        tagList.innerHTML = '';
        const sortedTags = [...playlist[key]].sort((a, b) => a.localeCompare(b));

        sortedTags.forEach((tag) => {
            const tagItem = document.createElement('div');
            tagItem.className = 'tag-pill';

            const text = document.createElement('span');
            text.textContent = tag;
            tagItem.appendChild(text);

            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.onclick = () => {
                playlist[key] = playlist[key].filter(t => t !== tag);
                renderTagList();
            };

            tagItem.appendChild(removeBtn);
            tagList.appendChild(tagItem);
        });
    }

    input.oninput = () => {
        datalist.innerHTML = '';
        const value = input.value.toLowerCase();
        Object.keys(tags)
            .filter(tag => (tag !== "All" || key === "includedTags") && tag.toLowerCase().includes(value) && !playlist[key].includes(tag))
            .forEach(tag => {
                const option = document.createElement('option');
                option.value = tag;
                datalist.appendChild(option);
            });
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const newTag = input.value.trim();
            input.value = '';
            if (!newTag) 
                return;
            if (newTag === "All" && key === "excludedTags")
            {
                alert(`The "All" tag cannot be used as an exclusion.`);
            }
            else if (!playlist[key].includes(newTag)) {
                playlist[key].push(newTag);
                renderTagList();
                scheduleAutosave();
            }
            e.preventDefault();
        }
    });

    renderTagList();
    return wrapper;
}

function playPlaylist(index) {
    const playlist = playlists[index];

    if (!playlist || !playlist.includedTags || playlist.includedTags.length === 0)
    {
        alert("Playlist is empty.");
        return;
    }

    combinedList = getShuffledPlaylistVideos(playlist);

    if (combinedList.length === 0) {
        alert("No videos matched the playlist tags.");
        return;
    }

    updateRemoveTagSuggestions();

    currentPlaylistIndex = index;
    currentVideoIndex = 0;
    playVideos();
}

function getShuffledPlaylistVideos(playlist)
{
    let shuffledVideos;

    let allowAll = playlist.includedTags.includes("All");
    if (allowAll) {
        // ignore includedTags, only apply excludedTags
        const excluded = playlist.excludedTags || [];
        shuffledVideos = videos.filter(v =>
            !v.tags.some(t => excluded.includes(t))
        );
    } else {
        const includes = playlist.includedTags || [];
        const excludes = playlist.excludedTags || [];

        shuffledVideos = videos.filter(v =>
            includes.some(t => v.tags.includes(t)) &&
            !v.tags.some(t => excludes.includes(t))
        );
    }

    shuffledVideos.sort(() => Math.random() - 0.5);

    return shuffledVideos;
}

function playCurrentPlaylist() {
    playPlaylist(currentPlaylistIndex);
}

function reshuffleAndPlay() {
    if (combinedList.length > 0) {
        combinedList.sort(() => Math.random() - 0.5);
        currentVideoIndex = 0;
        playVideos();
    } else {
        console.log("No videos in the combined list");
    }
}

function updateVideoInfoDisplay(video) {
    const videoInfoContainer = document.getElementById('video-info-container');
    videoInfoContainer.innerHTML = '';

    const titleElement = document.createElement('div');
    titleElement.textContent = `Currently playing: ${currentVideoIndex + 1}. ${video.name}`;
    videoInfoContainer.appendChild(titleElement);

    const tagsElement = document.createElement('div');
    tagsElement.style.fontSize = 'smaller';
    tagsElement.textContent = "Tags:";
    videoInfoContainer.appendChild(tagsElement);

    // Create wrapper
    const tagInputRow = document.createElement('div');
    tagInputRow.style.display = 'flex';
    tagInputRow.style.alignItems = 'center';
    tagInputRow.style.gap = '6px';
    tagInputRow.style.marginBottom = '6px';
    videoInfoContainer.appendChild(tagInputRow);

    // Input field with autofill
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.placeholder = 'Add tag';
    tagInput.setAttribute('list', 'tag-autofill-list');
    tagInputRow.appendChild(tagInput);

    // Datalist for suggestions
    let autofillList = document.getElementById('tag-autofill-list');
    if (!autofillList) {
        autofillList = document.createElement('datalist');
        autofillList.id = 'tag-autofill-list';
        document.body.appendChild(autofillList);
    }

    // Dropdown for category
    const categoryDropdown = document.createElement('select');
    tagInputRow.appendChild(categoryDropdown);

    // Update dropdown options
    function updateCategoryDropdown(selected = "normal", disabled = false) {
        categoryDropdown.innerHTML = '';
        [...tagCategories].sort().forEach(cat => {
            if (cat === "special") return;
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            if (cat === selected) opt.selected = true;
            categoryDropdown.appendChild(opt);
        });
        categoryDropdown.disabled = disabled;
    }
    updateCategoryDropdown("normal", false);

    // Tag input logic
    tagInput.oninput = () => {
        const value = tagInput.value.trim();
        autofillList.innerHTML = '';
        Object.keys(tags)
            .filter(t => t !== "All" && t.toLowerCase().includes(value.toLowerCase()))
            .forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                autofillList.appendChild(opt);
            });

        if (value === "All") {
            updateCategoryDropdown(tags[value].category, true);
            addTagButton.disabled = true;
        } else if (tags[value]) {
            updateCategoryDropdown(tags[value].category, true);
            addTagButton.disabled = false;
        } else {
            updateCategoryDropdown("normal", false);
            addTagButton.disabled = false;
        }
    };

    // Add tag button
    const addTagButton = document.createElement('button');
    addTagButton.textContent = 'Add Tag';
    addTagButton.onclick = () => {
        const newTag = tagInput.value.trim();
        if (!newTag) return;
        if (!video.tags.includes(newTag)) {
            video.tags.push(newTag);
        }

        if (!tags[newTag]) {
            const selectedCategory = categoryDropdown.value;
            tags[newTag] = { category: selectedCategory };
            tagCategories.add(selectedCategory);
        }

        updateVideoInfoDisplay(video);
        scheduleAutosave();
    };
    tagInputRow.appendChild(addTagButton);

    video.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.textContent = tag;

        const removeTagButton = document.createElement('button');
        removeTagButton.textContent = 'x';
        removeTagButton.onclick = () => {
            video.tags = video.tags.filter(t => t !== tag);
            updateVideoInfoDisplay(video);
            scheduleAutosave();
        };

        const tagContainer = document.createElement('div');
        tagContainer.appendChild(tagSpan);
        tagContainer.appendChild(removeTagButton);

        videoInfoContainer.appendChild(tagContainer);
    });

    // Start timestamp input
    const startInput = document.createElement('input');
    startInput.type = 'text';
    startInput.placeholder = 'Start mm:ss';
    startInput.value = video.startTimestamp || '';
    videoInfoContainer.appendChild(startInput);

    // End timestamp input
    const endInput = document.createElement('input');
    endInput.type = 'text';
    endInput.placeholder = 'End mm:ss';
    endInput.value = video.timestamp || '';
    videoInfoContainer.appendChild(endInput);

    const saveTimestampButton = document.createElement('button');
    saveTimestampButton.textContent = 'Save Timestamps';
    saveTimestampButton.onclick = () => {
        const startValid = startInput.value.trim() === '' || /^\d{1,2}:\d{2}$/.test(startInput.value.trim());
        const endValid = endInput.value.trim() === '' || /^\d{1,2}:\d{2}$/.test(endInput.value.trim());

        if (!startValid || !endValid) {
            alert('Invalid time format. Use mm:ss or leave blank.');
            return;
        }

        video.startTimestamp = startInput.value.trim() || undefined;
        video.timestamp = endInput.value.trim() || undefined;
        scheduleAutosave();
    };
    videoInfoContainer.appendChild(saveTimestampButton);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete from Database';
    deleteBtn.style.marginTop = '10px';
    deleteBtn.style.backgroundColor = '#c33';
    deleteBtn.style.color = 'white';
    deleteBtn.onclick = () => {
        if (!confirm(`Delete "${video.name}" from the database?`)) return;

        // Remove from videos
        videos = videos.filter(v => v.link !== video.link);

        // Remove from combined list
        const wasCurrent = combinedList[currentVideoIndex]?.link === video.link;
        combinedList = combinedList.filter(v => v.link !== video.link);

        if (combinedList.length === 0) {
            currentVideoIndex = 0;
            player.stopVideo();
            updateVideoInfoDisplay({ name: 'None', tags: [] });
        } else if (wasCurrent) {
            if (currentVideoIndex >= combinedList.length) {
                currentVideoIndex = combinedList.length - 1;
            }
            combinedList[currentVideoIndex]._startSeeked = false;
            player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
            updateVideoInfoDisplay(combinedList[currentVideoIndex]);
        } else {
            updateVideoInfoDisplay(combinedList[currentVideoIndex]);
        }

        updateScrollableVideoList();
        scheduleAutosave();
    };
    videoInfoContainer.appendChild(deleteBtn);

    updateRemoveTagSuggestions();
    updateScrollableVideoList(); // Re-render the list to update the bolded item
}

function updateRemoveTagSuggestions() {
    const datalist = document.getElementById('remove-tag-suggestions');
    if (!datalist) return;
    datalist.innerHTML = '';

    const playlistTags = new Set(combinedList.flatMap(v => v.tags || []));
    [...playlistTags].filter(tag => tag !== "All").sort((a, b) => a == null ? 1 : b == null ? -1 : a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .forEach(tag => {
            const opt = document.createElement('option');
            opt.value = tag;
            datalist.appendChild(opt);
        });
}

function removeVideosWithTag() {
    var tag = document.getElementById('remove-tag-input').value.trim();

    if (tag === "All") {
        alert(`The "All" tag is not valid for this operation.`);
        return;
    }

    const wasCurrentRemoved = combinedList[currentVideoIndex]?.tags.includes(tag);
    let removedBeforeCurrent = 0;

    for (let i = 0; i < currentVideoIndex; i++) {
        if (combinedList[i].tags.includes(tag)) {
            removedBeforeCurrent++;
        }
    }

    combinedList = combinedList.filter(video => !video.tags.includes(tag));

    if (combinedList.length === 0) {
        currentVideoIndex = 0;
        player.stopVideo();
        updateVideoInfoDisplay({ name: 'None', tags: [] });
        updateScrollableVideoList();
        return;
    }

    if (wasCurrentRemoved) {
        if (currentVideoIndex >= combinedList.length) {
            currentVideoIndex = combinedList.length - 1;
        }
        combinedList[currentVideoIndex]._startSeeked = false;
        player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
        updateVideoInfoDisplay(combinedList[currentVideoIndex]);
    } else if (removedBeforeCurrent > 0) {
        currentVideoIndex -= removedBeforeCurrent;
    }

    updateRemoveTagSuggestions();
    updateScrollableVideoList();
}


function scrollToCurrentVideo() {
    const scrollableVideoList = document.getElementById('scrollable-video-list');
    const listItems = scrollableVideoList.children;
    if (currentVideoIndex < listItems.length) {
        const currentItem = listItems[currentVideoIndex];
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function playVideos() {
    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            const video = combinedList[currentVideoIndex];
            if (video.startTimestamp && !video._startSeeked) {
                const [min, sec] = video.startTimestamp.split(':').map(Number);
                const start = min * 60 + sec;
                player.seekTo(start, true);
                video._startSeeked = true;
            }
        }

        if (event.data === YT.PlayerState.ENDED) {
            playNextVideo();
        }
    }

    function onPlayerReady(event) {
        event.target.playVideo();
        updateVideoInfoDisplay(combinedList[currentVideoIndex]);
    }

    function onPlayerError(event) {
        const video = combinedList[currentVideoIndex];
        if (!video.tags.includes("Unavailable")) {
            video.tags.push("Unavailable");
            tags["Unavailable"] = { category: "special" };
            tagCategories.add("special");
            updateVideoInfoDisplay(combinedList[currentVideoIndex])
        }

        const autoSkip = document.getElementById('auto-skip-unavailable')?.checked;
        if (autoSkip) {
            playNextVideo();
        }

        updateScrollableVideoList();
    }


    if (!window.YT || !window.YT.Player) {
        setTimeout(playVideos, 100);
        return;
    }

    if (!player)
    {
        player = new YT.Player('player', {
            height: '390',
            width: '640',
            videoId: getVideoId(combinedList[currentVideoIndex].link),
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange,
                'onError': onPlayerError
            }
        });
    } else {
        combinedList[currentVideoIndex]._startSeeked = false;
        player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
        updateVideoInfoDisplay(combinedList[currentVideoIndex]);
    }

    setInterval(() => {
        if (player && player.getCurrentTime) {
            const currentTime = player.getCurrentTime();
            const video = combinedList[currentVideoIndex];
            if (video.timestamp) {
                const [minutes, seconds] = video.timestamp.split(':').map(Number);
                const targetTime = minutes * 60 + seconds;
                if (currentTime >= targetTime) {
                    currentVideoIndex++;
                    if (currentVideoIndex < combinedList.length) {
                        combinedList[currentVideoIndex]._startSeeked = false;
                        player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
                        updateVideoInfoDisplay(combinedList[currentVideoIndex]);
                    }
                }
            }
        }
    }, 1000);

    updateScrollableVideoList();
}

function playNextVideo()
{
    currentVideoIndex++;

    if (currentVideoIndex >= combinedList.length && document.getElementById('loop-playlist').checked) {
        currentVideoIndex = 0;
    }

    if (currentVideoIndex < combinedList.length) {
        combinedList[currentVideoIndex]._startSeeked = false;
        player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
        updateVideoInfoDisplay(combinedList[currentVideoIndex]);
    }
}

function getVideoId(url) {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v');
}

function updateScrollableVideoList() {
    const scrollableVideoList = document.getElementById('scrollable-video-list');
    scrollableVideoList.innerHTML = '';

    combinedList.forEach((video, index) => {
        const listItem = document.createElement('div');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${index + 1}. ${video.name}`;
        listItem.appendChild(nameSpan);

        // Remove button
        const removeButton = document.createElement('button');
        removeButton.textContent = 'X';
        removeButton.style.marginLeft = '8px';
        removeButton.style.fontSize = '12px';
        removeButton.style.padding = '0 4px';
        removeButton.style.height = '20px';
        removeButton.style.verticalAlign = 'middle';

        removeButton.onclick = (e) => {
            e.stopPropagation();

            const isCurrent = index === currentVideoIndex;

            combinedList.splice(index, 1);

            if (combinedList.length === 0) {
                currentVideoIndex = 0;
                player.stopVideo();
                updateVideoInfoDisplay({ name: 'None', tags: [] });
                updateScrollableVideoList();
                return;
            }

            if (isCurrent) {
                if (currentVideoIndex >= combinedList.length) {
                    currentVideoIndex = combinedList.length - 1;
                }
                videos[currentVideoIndex]._startSeeked = false;
                player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
                updateVideoInfoDisplay(combinedList[currentVideoIndex]);
            } else if (index < currentVideoIndex) {
                currentVideoIndex--; // shift index back if a video before current was removed
            }

            updateScrollableVideoList();
        };

        listItem.appendChild(removeButton);


        listItem.style.padding = '5px';
        listItem.style.cursor = 'pointer';

        // Check if the current index is the currentVideoIndex
        if (index === currentVideoIndex) {
            listItem.style.fontWeight = 'bold';
        }

        listItem.onclick = () => {
            currentVideoIndex = index;
            videos[currentVideoIndex]._startSeeked = false;
            player.loadVideoById(getVideoId(combinedList[currentVideoIndex].link));
            updateVideoInfoDisplay(video);
        };

        scrollableVideoList.appendChild(listItem);
    });
}

// Adds the Watch Later UI: a remove button on every row, plus a small panel
// with "Remove watched" and "Shuffle".
//
// On every other YouTube page it adds a small clock button to each video
// thumbnail, which saves that video to Watch Later in one click.
//
// YouTube is a single page app, so we never get a fresh page load when you
// navigate. Instead we watch the DOM and re-check whenever it changes.
//
// Note: YouTube blocks innerHTML (Trusted Types), so all elements here are
// built with createElement + textContent.

(() => {
  const ROW_SELECTOR = "ytd-browse:not([hidden]) ytd-playlist-video-renderer";
  const REMOVE_BATCH_SIZE = 50;
  const THRESHOLD_STORAGE_KEY = "watchLaterTools.watchedThreshold";

  let panel = null;
  let statusLine = null;
  let toastTimer = null;

  // ---------- Small helpers ----------

  function isWatchLaterPage() {
    return location.pathname === "/playlist"
      && new URLSearchParams(location.search).get("list") === "WL";
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function videoIdOf(row) {
    const link = row.querySelector("a#thumbnail, a#video-title");
    if (!link?.href) return null;
    return new URL(link.href).searchParams.get("v");
  }

  function titleOf(row) {
    return row.querySelector("#video-title")?.textContent.trim() || "Video";
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------- Toasts ----------

  function showToast(message, action) {
    document.querySelector(".wlt-toast")?.remove();
    clearTimeout(toastTimer);

    const toast = element("div", "wlt-toast", message);
    if (action) {
      const button = element("button", "wlt-toast-action", action.label);
      button.addEventListener("click", () => {
        toast.remove();
        action.run();
      });
      toast.append(button);
    }

    document.body.append(toast);
    toastTimer = setTimeout(() => toast.remove(), 7000);
  }

  // ---------- Removing a single video ----------

  // We hide rows rather than deleting them, because YouTube owns those
  // elements and may reuse them. We remember which video we hid so we can
  // un-hide the row if YouTube recycles it for a different video.
  function hideRow(row, videoId) {
    row.classList.add("wlt-removed");
    row.dataset.wltRemovedId = videoId;
  }

  function unhideRow(row) {
    row.classList.remove("wlt-removed");
    delete row.dataset.wltRemovedId;
  }

  // The row disappears straight away and YouTube is told in the background.
  // YouTube takes a second or two to answer, so waiting for it made every
  // click feel sluggish. If YouTube says no, the row comes back.
  function removeRow(row) {
    const videoId = videoIdOf(row);
    if (!videoId) return showToast("Couldn't work out which video this is.");

    const title = titleOf(row);
    hideRow(row, videoId);

    const removal = WatchLaterApi.removeVideos([videoId]);
    showToast(`Removed "${title}"`, {
      label: "Undo",
      run: () => undoRemove(row, videoId, title, removal),
    });

    removal.catch(error => {
      unhideRow(row);
      showToast(`Couldn't remove "${title}": ${error.message}`);
    });
  }

  async function undoRemove(row, videoId, title, removal) {
    unhideRow(row);

    // If the removal is still on its way, let it land first. Otherwise YouTube
    // could get the "add" before the "remove" and the video would end up gone.
    try {
      await removal;
    } catch {
      return; // The removal failed, so there's nothing to undo.
    }

    try {
      await WatchLaterApi.addVideos([videoId]);
      // YouTube treats this as a fresh add, so after a reload it'll be at the top.
      showToast(`Put "${title}" back`);
    } catch (error) {
      hideRow(row, videoId);
      showToast(`Couldn't undo: ${error.message}`);
    }
  }

  function decorateRow(row) {
    // Row was hidden, but YouTube has since reused it for another video.
    if (row.dataset.wltRemovedId && row.dataset.wltRemovedId !== videoIdOf(row)) {
      unhideRow(row);
    }

    if (row.querySelector(".wlt-remove-button")) return;

    const button = element("button", "wlt-remove-button", "✕");
    button.title = "Remove from Watch Later";
    button.addEventListener("click", event => {
      // Stop the click from reaching YouTube and opening the video.
      event.preventDefault();
      event.stopPropagation();
      removeRow(row);
    });

    const menu = row.querySelector("#menu");
    if (menu) menu.before(button);
    else row.append(button);
  }

  // ---------- Bulk: remove watched videos ----------

  function readThreshold() {
    try {
      const saved = Number(localStorage.getItem(THRESHOLD_STORAGE_KEY));
      return saved > 0 && saved <= 100 ? saved : 90;
    } catch {
      return 90;
    }
  }

  function saveThreshold(value) {
    try {
      localStorage.setItem(THRESHOLD_STORAGE_KEY, String(value));
    } catch {
      // Not important enough to bother the user about.
    }
  }

  // Before a bulk removal we save the list to a file, so nothing is ever
  // truly lost: you can always see what was removed and re-add it.
  function downloadBackup(videos) {
    const lines = videos.map(v => `https://www.youtube.com/watch?v=${v.videoId}\t${v.title}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const link = element("a");
    link.href = URL.createObjectURL(blob);
    link.download = `watch-later-removed-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  }

  async function removeWatched(threshold, button) {
    button.disabled = true;

    try {
      statusLine.textContent = "Scanning your Watch Later…";
      const all = await WatchLaterApi.fetchAllVideos(count => {
        statusLine.textContent = `Scanning… ${count} videos`;
      });

      const watched = all.filter(v => v.percentWatched >= threshold);
      if (watched.length === 0) {
        statusLine.textContent = `Checked ${all.length} videos. None are ${threshold}%+ watched.`;
        return;
      }

      const preview = watched.slice(0, 5).map(v => `  • ${v.title}`).join("\n");
      const more = watched.length > 5 ? `\n  …and ${watched.length - 5} more` : "";
      const confirmed = confirm(
        `Remove ${watched.length} of ${all.length} videos that are at least ${threshold}% watched?\n\n`
        + `${preview}${more}\n\nA backup list will be downloaded first.`
      );
      if (!confirmed) {
        statusLine.textContent = "Cancelled. Nothing removed.";
        return;
      }

      downloadBackup(watched);

      let removed = 0;
      for (let i = 0; i < watched.length; i += REMOVE_BATCH_SIZE) {
        const batch = watched.slice(i, i + REMOVE_BATCH_SIZE);
        await WatchLaterApi.removeVideos(batch.map(v => v.videoId));
        removed += batch.length;
        statusLine.textContent = `Removed ${removed} / ${watched.length}…`;
        await sleep(300); // be polite, YouTube rate-limits bursts
      }

      const removedIds = new Set(watched.map(v => v.videoId));
      for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        const id = videoIdOf(row);
        if (removedIds.has(id)) hideRow(row, id);
      }

      statusLine.textContent = `Done. Removed ${removed} watched videos.`;
    } catch (error) {
      statusLine.textContent = `Stopped: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  // ---------- Shuffle ----------

  // Only shuffles what's loaded on the page. The real order on YouTube is
  // untouched; reload to get it back.
  function shuffleLoadedRows() {
    const rows = [...document.querySelectorAll(ROW_SELECTOR)];
    if (rows.length < 2) return;

    // Fisher-Yates: walk backwards, swapping each item with a random earlier one.
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    // Keep YouTube's "load more" marker at the end so scrolling still works.
    const container = rows[0].parentElement;
    const loadMoreMarker = container.querySelector(":scope > ytd-continuation-item-renderer");
    for (const row of rows) container.insertBefore(row, loadMoreMarker);

    statusLine.textContent = `Shuffled ${rows.length} loaded videos. Reload to undo.`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- The floating panel ----------

  function buildPanel() {
    const root = element("div", "wlt-panel");
    root.append(element("div", "wlt-panel-title", "Better Watch Later"));

    const thresholdRow = element("label", "wlt-threshold");
    thresholdRow.append("Watched means ≥ ");
    const thresholdInput = element("input");
    thresholdInput.type = "number";
    thresholdInput.min = "1";
    thresholdInput.max = "100";
    thresholdInput.value = String(readThreshold());
    thresholdInput.addEventListener("change", () => saveThreshold(Number(thresholdInput.value)));
    thresholdRow.append(thresholdInput, "%");

    const removeWatchedButton = element("button", "wlt-panel-button", "Remove watched…");
    removeWatchedButton.addEventListener("click", () => {
      const threshold = Math.min(100, Math.max(1, Number(thresholdInput.value) || 90));
      removeWatched(threshold, removeWatchedButton);
    });

    const shuffleButton = element("button", "wlt-panel-button", "Shuffle loaded");
    shuffleButton.addEventListener("click", shuffleLoadedRows);

    statusLine = element("div", "wlt-status");

    root.append(thresholdRow, removeWatchedButton, shuffleButton, statusLine);
    return root;
  }

  // ---------- Clock button on every thumbnail ----------
  //
  // YouTube's own "Watch later" hover button only shows up some of the time,
  // so we put our own small clock in the top-right corner of every thumbnail.
  //
  // YouTube serves two kinds of markup and we cover both:
  //   - "lockups" (yt-lockup-view-model), used for most videos since 2025,
  //     and their Shorts version (ytm-shorts-lockup-view-model)
  //   - the older ytd-*-renderer elements, which wrap the image in ytd-thumbnail

  // The box each thumbnail image sits in. The button goes inside it.
  const THUMBNAIL_SELECTOR = [
    "yt-lockup-view-model yt-thumbnail-view-model",
    "ytm-shorts-lockup-view-model .shortsLockupViewModelHostThumbnailContainer",
    "ytm-shorts-lockup-view-model-v2 .shortsLockupViewModelHostThumbnailContainer",
    "ytd-thumbnail",
  ].join(", ");

  // The whole video card around a thumbnail, where its link and title live.
  const CARD_SELECTOR = [
    "yt-lockup-view-model",
    "ytm-shorts-lockup-view-model",
    "ytm-shorts-lockup-view-model-v2",
    "ytd-rich-grid-media",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer",
    "ytd-reel-item-renderer",
    "ytd-rich-item-renderer",
  ].join(", ");

  // Ads, mixes and playlists get no button: there's no single video to save.
  const SKIP_SELECTOR = [
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-promoted-video-renderer",
    "ytd-compact-promoted-video-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-display-ad-renderer",
    "ytd-radio-renderer",
    "ytd-compact-radio-renderer",
    "ytd-playlist-renderer",
    "ytd-compact-playlist-renderer",
    "ytd-grid-playlist-renderer",
  ].join(", ");

  const TITLE_SELECTOR = [
    ".ytLockupMetadataViewModelTitle",
    ".shortsLockupViewModelHostMetadataTitle",
    ".shortsLockupViewModelHostOutsideMetadataTitle",
    "#video-title",
  ].join(", ");

  // While YouTube plays a preview of the video you're hovering, it draws it in
  // a layer of its own that can cover our button. These are that layer.
  const PREVIEW_SELECTOR = [
    "[data-ytd-video-preview-hit-box].ytdVideoPreviewPortalActive",
    "[data-ytd-video-preview-hit-box].ytdVideoPreviewLoaderActive",
  ].join(", ");

  const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Videos saved since this page was opened. YouTube reuses thumbnails for
  // other videos as you scroll, so we keep this list rather than trusting
  // whatever state a button happens to be in.
  const addedIds = new Set();
  const changeQueues = new Map();

  let hoveredThumbnail = null;
  let previewButton = null;

  function videoIdFromLink(link) {
    if (!link?.href) return null;

    const url = new URL(link.href);
    // A mix links to its first video, but it's a playlist, not that video.
    if (url.searchParams.has("start_radio")) return null;

    let id = null;
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2];
    return VIDEO_ID_PATTERN.test(id ?? "") ? id : null;
  }

  function thumbnailVideoId(thumbnail) {
    if (thumbnail.closest(SKIP_SELECTOR)) return null;
    const card = thumbnail.closest(CARD_SELECTOR);
    if (!card) return null;

    // Lockups name what they show in a class: "content-id-<id>". For a mix or
    // playlist that's a playlist id, which is longer than a video id, so the
    // pattern check skips those.
    const tagged = card.querySelector('[class*="content-id-"]');
    if (tagged) {
      const id = tagged.getAttribute("class").match(/(?:^|\s)content-id-(\S+)/)?.[1];
      return VIDEO_ID_PATTERN.test(id ?? "") ? id : null;
    }

    return videoIdFromLink(card.querySelector('a#thumbnail, a[href^="/watch"], a[href^="/shorts/"]'));
  }

  function thumbnailTitle(thumbnail) {
    const card = thumbnail?.closest(CARD_SELECTOR);
    return card?.querySelector(TITLE_SELECTOR)?.textContent.trim() || "Video";
  }

  // Everything on the Watch Later page is already in Watch Later.
  function isOnWatchLaterPage(thumbnail) {
    return isWatchLaterPage() && thumbnail.closest("ytd-playlist-video-renderer") !== null;
  }

  // Watch Later only exists while you're signed in, so signed-out visitors get
  // no clock. YouTube keeps a LOGGED_IN flag in ytcfg; if it's missing we fall
  // back to looking for the avatar button in the top bar.
  function isSignedIn() {
    const flag = window.ytcfg?.get?.("LOGGED_IN") ?? window.ytcfg?.data_?.LOGGED_IN;
    if (typeof flag === "boolean") return flag;
    return document.querySelector("ytd-topbar-menu-button-renderer #avatar-btn, button#avatar-btn") !== null;
  }

  // The thumbnail sits inside the video's link, and YouTube also listens for
  // mousedown and pointerdown on it. Keep all of these on our button.
  function swallowEvent(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function clockVideoId(thumbnail) {
    if (!isSignedIn() || isOnWatchLaterPage(thumbnail)) return null;
    return thumbnailVideoId(thumbnail);
  }

  function svgIcon(className, ...shapes) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const [tag, attributes] of shapes) {
      const shape = document.createElementNS(SVG_NS, tag);
      for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
      svg.append(shape);
    }
    return svg;
  }

  function buildClockButton(extraClass) {
    const button = element("button", extraClass ? `wlt-wl-button ${extraClass}` : "wlt-wl-button");
    button.type = "button";
    button.append(
      svgIcon("wlt-wl-icon wlt-wl-icon-clock",
        ["circle", { cx: "12", cy: "12", r: "8.5" }],
        ["path", { d: "M12 7.5V12l3 2" }]),
      svgIcon("wlt-wl-icon wlt-wl-icon-tick",
        ["path", { d: "M5.5 12.5l4 4 9-9" }]),
    );
    button.addEventListener("mousedown", swallowEvent);
    button.addEventListener("pointerdown", swallowEvent);
    button.addEventListener("click", onClockClick);
    showAddedState(button, false);
    return button;
  }

  function showAddedState(button, added) {
    button.classList.toggle("wlt-wl-added", added);
    button.title = added ? "Saved to Watch Later" : "Save to Watch Later";
    button.setAttribute("aria-label", button.title);
  }

  function syncAddedState(videoId) {
    for (const button of document.querySelectorAll(".wlt-wl-button")) {
      if (button.dataset.videoId === videoId) showAddedState(button, addedIds.has(videoId));
    }
  }

  // Points a button at a video. When YouTube has reused the thumbnail for a
  // different video, this is where the old tick gets cleared.
  function bindButton(button, videoId) {
    if (button.dataset.videoId === videoId) return;
    button.dataset.videoId = videoId;
    showAddedState(button, addedIds.has(videoId));
  }

  function decorateThumbnail(thumbnail) {
    let button = thumbnail.querySelector(":scope > .wlt-wl-button");
    const videoId = clockVideoId(thumbnail);

    if (!videoId) {
      button?.remove();
      return;
    }

    if (!button) {
      button = buildClockButton();
      thumbnail.classList.add("wlt-wl-host");
      thumbnail.append(button);
    }
    bindButton(button, videoId);
  }

  // Adds and undos for one video wait for each other, so they reach YouTube in
  // the order you clicked them.
  function queueChange(videoId, change) {
    const previous = changeQueues.get(videoId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(change);
    changeQueues.set(videoId, next);
    next.catch(() => {}).finally(() => {
      if (changeQueues.get(videoId) === next) changeQueues.delete(videoId);
    });
    return next;
  }

  function onClockClick(event) {
    // Stop the click from reaching YouTube and opening the video.
    swallowEvent(event);

    const button = event.currentTarget;
    const thumbnail = button.wltThumbnail ?? button.parentElement;

    // The thumbnail may have been reused for another video since we last
    // looked, so check again which video it shows right now.
    if (!button.wltThumbnail && thumbnail) decorateThumbnail(thumbnail);
    if (!button.isConnected) return;

    const videoId = button.dataset.videoId;
    if (!videoId || addedIds.has(videoId)) return; // already saved, or a double click
    addToWatchLater(videoId, thumbnailTitle(thumbnail));
  }

  // Like removing, this shows as done straight away and tells YouTube in the
  // background. If YouTube says no, the tick goes away again.
  function addToWatchLater(videoId, title) {
    addedIds.add(videoId);
    syncAddedState(videoId);

    const addition = queueChange(videoId, () => WatchLaterApi.addVideos([videoId]));
    showToast(`Added "${title}" to Watch Later`, {
      label: "Undo",
      run: () => undoAdd(videoId, title, addition),
    });

    addition.catch(error => {
      addedIds.delete(videoId);
      syncAddedState(videoId);
      showToast(`Couldn't add "${title}" to Watch Later: ${error.message}`);
    });
  }

  async function undoAdd(videoId, title, addition) {
    addedIds.delete(videoId);
    syncAddedState(videoId);

    try {
      await addition;
    } catch {
      return; // The add failed, so there's nothing to undo.
    }

    try {
      await queueChange(videoId, () => WatchLaterApi.removeVideos([videoId]));
      showToast(`Took "${title}" back out of Watch Later`);
    } catch (error) {
      addedIds.add(videoId);
      syncAddedState(videoId);
      showToast(`Couldn't undo: ${error.message}`);
    }
  }

  // While a preview is playing we put a second button on the preview itself,
  // in the same spot, for the thumbnail the mouse went over.
  function syncPreviewButton() {
    const preview = document.querySelector(PREVIEW_SELECTOR);
    const thumbnail = preview && hoveredThumbnail?.isConnected ? hoveredThumbnail : null;
    const videoId = thumbnail ? clockVideoId(thumbnail) : null;

    if (!videoId) {
      previewButton?.remove();
      return;
    }

    previewButton ??= buildClockButton("wlt-wl-in-preview");
    previewButton.wltThumbnail = thumbnail;
    if (previewButton.parentElement !== preview) preview.append(previewButton);
    bindButton(previewButton, videoId);
  }

  // Only re-checks a thumbnail when the mouse moves onto a new one, so it
  // stays cheap even on a grid of hundreds.
  function onMouseOver(event) {
    const thumbnail = event.target.closest?.(THUMBNAIL_SELECTOR);
    if (!thumbnail || thumbnail === hoveredThumbnail) return;
    hoveredThumbnail = thumbnail;
    decorateThumbnail(thumbnail);
    queuePreviewSync();
  }

  let previewSyncQueued = false;
  function queuePreviewSync() {
    if (previewSyncQueued) return;
    previewSyncQueued = true;
    requestAnimationFrame(() => {
      previewSyncQueued = false;
      syncPreviewButton();
    });
  }

  // ---------- Keeping up with YouTube's page changes ----------

  function refresh() {
    document.querySelectorAll(THUMBNAIL_SELECTOR).forEach(decorateThumbnail);
    syncPreviewButton();

    if (!isWatchLaterPage()) {
      panel?.remove();
      return;
    }

    if (!panel) panel = buildPanel();
    if (!panel.isConnected) document.body.append(panel);

    document.querySelectorAll(ROW_SELECTOR).forEach(decorateRow);
  }

  // The DOM changes constantly on YouTube. Batch the checks to once per frame.
  let refreshQueued = false;
  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh();
    });
  }

  new MutationObserver(queueRefresh).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("yt-navigate-finish", queueRefresh);
  document.addEventListener("mouseover", onMouseOver, { passive: true });
  queueRefresh();
})();

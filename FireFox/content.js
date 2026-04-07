// 0. Robust Message Sender
async function sendMessageToBackground(message, retries = 3) {
  try {
    return await browser.runtime.sendMessage(message);
  } catch (error) {
    if (retries > 0 && error.message.includes("Receiving end does not exist")) {
      console.log("StreamBuddy: Background asleep. Waking it up and retrying...");
      await new Promise(resolve => setTimeout(resolve, 800));
      return sendMessageToBackground(message, retries - 1);
    }
    console.error("StreamBuddy Messaging Error:", error);
    return null;
  }
}

// 1. URL Extraction
function getMediaDetails(pathname) {
  const tvMatch = pathname.match(/^\/tv\/(\d+)(?:-[^\/]+)?\/season\/(\d+)/);
  if (tvMatch) {
    return { type: 'tv', rawId: tvMatch[1], seasonId: tvMatch[2] };
  }

  const movieMatch = pathname.match(/^\/movie\/(\d+)/);
  if (movieMatch) {
    return { type: 'movie', rawId: movieMatch[1] };
  }
  return null;
}

// Helper: Fetch Custom Servers
async function getServersConfig() {
  const data = await browser.storage.sync.get(['servers', 'defaultServer']);
  return {
    servers: data.servers || [],
    defaultServer: data.defaultServer || ""
  };
}

// 2. The Singleton Modal
let globalModal = null;
let confirmModal = null;
let modalSwitchToken = 0;
const scrollLockState = {
  isLocked: false,
  scrollY: 0,
  bodyOverflow: "",
  bodyPosition: "",
  bodyTop: "",
  bodyWidth: "",
  htmlOverflow: ""
};

function lockPageScroll() {
  if (scrollLockState.isLocked) return;

  scrollLockState.scrollY = window.scrollY || window.pageYOffset || 0;
  scrollLockState.bodyOverflow = document.body.style.overflow;
  scrollLockState.bodyPosition = document.body.style.position;
  scrollLockState.bodyTop = document.body.style.top;
  scrollLockState.bodyWidth = document.body.style.width;
  scrollLockState.htmlOverflow = document.documentElement.style.overflow;

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollLockState.scrollY}px`;
  document.body.style.width = "100%";

  scrollLockState.isLocked = true;
}

function unlockPageScroll() {
  if (!scrollLockState.isLocked) return;

  document.documentElement.style.overflow = scrollLockState.htmlOverflow;
  document.body.style.overflow = scrollLockState.bodyOverflow;
  document.body.style.position = scrollLockState.bodyPosition;
  document.body.style.top = scrollLockState.bodyTop;
  document.body.style.width = scrollLockState.bodyWidth;
  window.scrollTo(0, scrollLockState.scrollY);

  scrollLockState.isLocked = false;
}

function showModalStatus(titleText, messageText, detailText = "") {
  if (!globalModal) return;

  const status = document.createElement('div');
  status.className = "streambuddy-status";

  const heading = document.createElement('h2');
  heading.innerText = titleText;

  const message = document.createElement('p');
  message.innerText = messageText;

  status.appendChild(heading);
  status.appendChild(message);

  if (detailText) {
    const detail = document.createElement('p');
    detail.className = "streambuddy-status-detail";
    detail.innerText = detailText;
    status.appendChild(detail);
  }

  globalModal.playerArea.replaceChildren(status);
}

function mountModalIframe(url) {
  if (!globalModal) return;

  const iframe = document.createElement('iframe');
  iframe.className = "streambuddy-iframe";
  iframe.allowFullscreen = true;
  iframe.src = url;

  globalModal.playerArea.replaceChildren(iframe);
  globalModal.iframe = iframe;
}

function switchModalServer(url, serverName = "") {
  modalSwitchToken += 1;
  const currentToken = modalSwitchToken;

  if (!url) {
    globalModal.iframe = null;
    showModalStatus(
      "Waiting for selection...",
      "Select a server from the dropdown above to begin.",
      "(You can set a Default Server in the StreamBuddy extension menu to autoload automatically.)"
    );
    return;
  }

  globalModal.iframe = null;
  showModalStatus(
    "Switching server...",
    serverName ? `Loading ${serverName}...` : "Loading your selected server..."
  );

  window.setTimeout(() => {
    if (!globalModal || currentToken !== modalSwitchToken) return;
    mountModalIframe(url);
  }, 0);
}

function ensureConfirmModal() {
  if (confirmModal) return confirmModal;

  const overlay = document.createElement('div');
  overlay.id = "streambuddy-confirm-overlay";

  const modal = document.createElement('div');
  modal.className = "streambuddy-confirm-modal";

  const title = document.createElement('h3');
  title.className = "streambuddy-confirm-title";

  const message = document.createElement('p');
  message.className = "streambuddy-confirm-message";

  const detail = document.createElement('p');
  detail.className = "streambuddy-confirm-detail";

  const buttonRow = document.createElement('div');
  buttonRow.className = "streambuddy-confirm-actions";

  const cancelBtn = document.createElement('button');
  cancelBtn.type = "button";
  cancelBtn.className = "streambuddy-confirm-btn secondary";
  cancelBtn.textContent = "Cancel";

  const confirmBtn = document.createElement('button');
  confirmBtn.type = "button";
  confirmBtn.className = "streambuddy-confirm-btn danger";
  confirmBtn.textContent = "Remove";

  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(confirmBtn);

  modal.appendChild(title);
  modal.appendChild(message);
  modal.appendChild(detail);
  modal.appendChild(buttonRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  confirmModal = {
    overlay,
    title,
    message,
    detail,
    confirmBtn,
    cancelBtn
  };

  return confirmModal;
}

function showDecorativeConfirm({
  title,
  message,
  detail,
  confirmText = "Remove"
}) {
  const modal = ensureConfirmModal();

  modal.title.textContent = title;
  modal.message.textContent = message;
  modal.detail.textContent = detail || "";
  modal.detail.style.display = detail ? "block" : "none";
  modal.confirmBtn.textContent = confirmText;
  modal.overlay.classList.add("active");

  return new Promise((resolve) => {
    const close = (confirmed) => {
      modal.overlay.classList.remove("active");
      modal.confirmBtn.removeEventListener("click", handleConfirm);
      modal.cancelBtn.removeEventListener("click", handleCancel);
      resolve(confirmed);
    };

    const handleConfirm = () => close(true);
    const handleCancel = () => close(false);

    modal.confirmBtn.addEventListener("click", handleConfirm, { once: true });
    modal.cancelBtn.addEventListener("click", handleCancel, { once: true });
  });
}

function setWatchedUiState(isWatched, badge, removeBtn) {
  badge.style.display = isWatched ? 'block' : 'none';
  removeBtn.style.display = isWatched ? 'inline-flex' : 'none';
}

function createRemoveWatchedButton() {
  const removeBtn = document.createElement('button');
  removeBtn.type = "button";
  removeBtn.className = "streambuddy-remove-btn";
  removeBtn.title = "Remove watched status";
  removeBtn.setAttribute("aria-label", "Remove watched status");

  const icon = document.createElement('img');
  icon.src = browser.runtime.getURL("icons/remove.png");
  icon.alt = "Remove watched status";
  icon.className = "streambuddy-remove-icon";

  removeBtn.appendChild(icon);
  return removeBtn;
}

function openVideoModal(titleText, servers, defaultServerName) {
  if (!globalModal) {
    const overlay = document.createElement('div');
    overlay.id = "streambuddy-overlay";

    const popupContainer = document.createElement('div');
    popupContainer.className = "streambuddy-popup";

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = "✖ Close";
    closeBtn.className = "streambuddy-close-btn";

    const header = document.createElement('div');
    header.className = "streambuddy-header";

    const title = document.createElement('span');
    title.className = "streambuddy-title";

    const btnContainer = document.createElement('div');
    btnContainer.className = "streambuddy-server-buttons";

    const playerArea = document.createElement('div');
    playerArea.className = "streambuddy-player-area";

    header.appendChild(title);
    header.appendChild(btnContainer);

    closeBtn.onclick = () => {
      overlay.classList.remove("active");
      modalSwitchToken += 1;
      playerArea.replaceChildren();
      if (globalModal) {
        globalModal.iframe = null;
      }
      unlockPageScroll();
    };

    popupContainer.appendChild(closeBtn);
    popupContainer.appendChild(header);
    popupContainer.appendChild(playerArea);
    overlay.appendChild(popupContainer);
    document.body.appendChild(overlay);

    globalModal = { overlay, title, btnContainer, playerArea, iframe: null };
  }

  globalModal.title.innerText = "StreamBuddy: " + titleText;
  globalModal.btnContainer.innerHTML = '';
  modalSwitchToken += 1;
  globalModal.playerArea.replaceChildren();
  globalModal.iframe = null;

  const selectMenu = document.createElement('select');
  selectMenu.className = "streambuddy-server-select";

  if (!defaultServerName) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = "";
    emptyOpt.innerText = "-- Select a Server --";
    selectMenu.appendChild(emptyOpt);
  }

  let autoLoadUrl = "";

  servers.forEach((server) => {
    const option = document.createElement('option');
    option.value = server.url;
    option.innerText = server.name;

    if (server.name === defaultServerName) {
      option.selected = true;
      autoLoadUrl = server.url;
    }

    selectMenu.appendChild(option);
  });

  selectMenu.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    switchModalServer(e.target.value, selectedOption ? selectedOption.innerText : "");
  });

  globalModal.btnContainer.appendChild(selectMenu);
  globalModal.overlay.classList.add("active");
  lockPageScroll();

  if (autoLoadUrl) {
    switchModalServer(autoLoadUrl, defaultServerName);
  } else {
    switchModalServer("");
  }
}

// 3. Movie Logic
function initMovieLogic(media) {
  const dbString = `tmdb-movie-${media.rawId}`;
  const titleContainer = document.querySelector('div.title');

  if (titleContainer && !document.getElementById('streambuddy-movie-action-bar')) {

    const actionBar = document.createElement('div');
    actionBar.id = "streambuddy-movie-action-bar";
    actionBar.style.cssText = "display: flex; align-items: center; gap: 12px; margin-top: 15px; margin-bottom: 10px;";

    const watchBtn = document.createElement('a');
    watchBtn.id = "streambuddy-watch-btn";
    watchBtn.className = "no_click";
    watchBtn.href = "#";
    watchBtn.innerHTML = `<span class="glyphicons_v2 play white"></span> Watch Now!`;

    const badge = document.createElement('img');
    badge.className = 'streambuddy-watched-badge';
    badge.src = browser.runtime.getURL("icons/watched.png");
    badge.alt = "Marked as watched";

    const removeBtn = createRemoveWatchedButton();

    sendMessageToBackground({ action: "checkPlayed", videoId: dbString }).then((res) => {
      setWatchedUiState(!!(res && res.played), badge, removeBtn);
    });

    watchBtn.onclick = async (e) => {
      e.preventDefault();

      const config = await getServersConfig();
      if (config.servers.length === 0) {
        alert("StreamBuddy: No servers configured! Please click the extension icon and add your JSON servers first.");
        return;
      }

      sendMessageToBackground({ action: "markPlayed", videoId: dbString });
      setWatchedUiState(true, badge, removeBtn);

      // Parse template URLs and sort alphabetically
      const processedServers = config.servers.map(s => ({
        name: s.name,
        // Global replace just in case '{{movie-id}}' appears multiple times
        url: s.movie_url.replace(/\{\{movie-id\}\}/g, media.rawId)
      })).sort((a, b) => a.name.localeCompare(b.name));

      openVideoModal("Movie", processedServers, config.defaultServer);
    };

    removeBtn.onclick = async (e) => {
      e.preventDefault();

      const confirmed = await showDecorativeConfirm({
        title: "Remove watched mark?",
        message: "This movie will be removed from your StreamBuddy watched history.",
        detail: "If you continue, the green watched checkmark will disappear and StreamBuddy will treat this movie as unwatched until you mark it again.",
        confirmText: "Remove"
      });

      if (!confirmed) return;

      const response = await sendMessageToBackground({ action: "removePlayed", videoId: dbString });
      if (response && response.success) {
        setWatchedUiState(false, badge, removeBtn);
      }
    };

    actionBar.appendChild(watchBtn);
    actionBar.appendChild(badge);
    actionBar.appendChild(removeBtn);
    titleContainer.appendChild(actionBar);
  }
}

// 4. TV Show Logic
function initTvLogic(media) {
  const episodeTitles = document.querySelectorAll('.episode_title h3');

  episodeTitles.forEach((h3) => {
    if (h3.querySelector('.streambuddy-ep-btn')) return;

    const link = h3.querySelector('a');
    if (!link) return;

    const epId = link.getAttribute('data-episode-number');
    const dbString = `tmdb-tv-${media.rawId}-${media.seasonId}-${epId}`;

    h3.style.display = 'flex';
    h3.style.alignItems = 'center';
    h3.style.flexWrap = 'wrap';
    h3.style.gap = '10px';

    const watchBtn = document.createElement('button');
    watchBtn.className = "streambuddy-ep-btn";
    watchBtn.innerText = "▶ Watch Now!";
    watchBtn.style.marginLeft = "0";

    const badge = document.createElement('img');
    badge.className = 'streambuddy-watched-badge';
    badge.src = browser.runtime.getURL("icons/watched.png");
    badge.alt = "Marked as watched";

    const removeBtn = createRemoveWatchedButton();

    sendMessageToBackground({ action: "checkPlayed", videoId: dbString }).then((res) => {
      setWatchedUiState(!!(res && res.played), badge, removeBtn);
    });

    watchBtn.onclick = async (e) => {
      e.preventDefault();

      const config = await getServersConfig();
      if (config.servers.length === 0) {
        alert("StreamBuddy: No servers configured! Please click the extension icon and add your JSON servers first.");
        return;
      }

      sendMessageToBackground({ action: "markPlayed", videoId: dbString });
      setWatchedUiState(true, badge, removeBtn);

      // Parse template URLs and sort alphabetically
      const processedServers = config.servers.map(s => ({
        name: s.name,
        url: s.tv_url
          .replace(/\{\{tv-id\}\}/g, media.rawId)
          .replace(/\{\{season-id\}\}/g, media.seasonId)
          .replace(/\{\{episode-id\}\}/g, epId)
      })).sort((a, b) => a.name.localeCompare(b.name));

      openVideoModal(`Episode ${epId}`, processedServers, config.defaultServer);
    };

    removeBtn.onclick = async (e) => {
      e.preventDefault();

      const confirmed = await showDecorativeConfirm({
        title: "Remove watched mark?",
        message: `Episode ${epId} will be removed from your StreamBuddy watched history.`,
        detail: "If you continue, the green watched checkmark will disappear and StreamBuddy will treat this episode as unwatched until you mark it again.",
        confirmText: "Remove"
      });

      if (!confirmed) return;

      const response = await sendMessageToBackground({ action: "removePlayed", videoId: dbString });
      if (response && response.success) {
        setWatchedUiState(false, badge, removeBtn);
      }
    };

    h3.appendChild(watchBtn);
    h3.appendChild(badge);
    h3.appendChild(removeBtn);
  });
}

// 5. Main Execution
function initStreamBuddy() {
  const currentPath = window.location.pathname;
  const media = getMediaDetails(currentPath);

  if (media) {
    console.log(`StreamBuddy Active! ID: ${media.rawId}, Type: ${media.type}`);
    if (media.type === 'movie') {
      initMovieLogic(media);
    } else if (media.type === 'tv') {
      initTvLogic(media);
    }
  }
}

function startWithDelay() {
  setTimeout(() => initStreamBuddy(), 150);
}

if (document.readyState === "complete") {
  startWithDelay();
} else {
  window.addEventListener("load", startWithDelay);
}

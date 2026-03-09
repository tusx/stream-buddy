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
    
    header.appendChild(title);
    header.appendChild(btnContainer);

    const iframe = document.createElement('iframe');
    iframe.className = "streambuddy-iframe";
    iframe.allowFullscreen = true;

    closeBtn.onclick = () => {
      overlay.classList.remove("active");
      iframe.src = ""; 
      iframe.removeAttribute("srcdoc");
    };

    popupContainer.appendChild(closeBtn);
    popupContainer.appendChild(header);
    popupContainer.appendChild(iframe);
    overlay.appendChild(popupContainer);
    document.body.appendChild(overlay);

    globalModal = { overlay, title, btnContainer, iframe };
  }

  globalModal.title.innerText = "StreamBuddy: " + titleText;
  globalModal.btnContainer.innerHTML = ''; 
  globalModal.iframe.src = '';
  globalModal.iframe.removeAttribute("srcdoc");

  const selectMenu = document.createElement('select');
  selectMenu.className = "streambuddy-server-select";

  // If no default is set, inject a blank placeholder option
  if (!defaultServerName) {
    const emptyOpt = document.createElement('option');
    emptyOpt.value = "";
    emptyOpt.innerText = "-- Select a Server --";
    selectMenu.appendChild(emptyOpt);
  }

  let autoLoadUrl = "";

  // Populate dropdown and find default URL
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

  // Update iframe when selection changes
  selectMenu.addEventListener('change', (e) => {
    if (e.target.value) {
      globalModal.iframe.removeAttribute("srcdoc");
      globalModal.iframe.src = e.target.value;
    }
  });

  globalModal.btnContainer.appendChild(selectMenu);
  globalModal.overlay.classList.add("active");
  
  // Handle autoloading vs prompting user
  if (autoLoadUrl) {
    globalModal.iframe.src = autoLoadUrl;
  } else {
    // Inject HTML straight into the iframe to instruct the user
    globalModal.iframe.srcdoc = `
      <html style="height: 100%; display: flex; justify-content: center; align-items: center; background: black; color: #cbd5e1; font-family: sans-serif;">
        <body style="text-align: center;">
          <h2 style="color: white; margin-bottom: 10px;">Waiting for selection...</h2>
          <p>Select a server from the dropdown above to begin.</p>
          <p style="font-size: 13px; color: #64748b;">(You can set a Default Server in the StreamBuddy extension menu to autoload automatically.)</p>
        </body>
      </html>
    `;
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

    sendMessageToBackground({ action: "checkPlayed", videoId: dbString }).then((res) => {
      if (res && res.played) {
        badge.style.display = 'block';
      }
    });

    watchBtn.onclick = async (e) => {
      e.preventDefault();
      
      const config = await getServersConfig();
      if (config.servers.length === 0) {
        alert("StreamBuddy: No servers configured! Please click the extension icon and add your JSON servers first.");
        return;
      }

      sendMessageToBackground({ action: "markPlayed", videoId: dbString });
      badge.style.display = 'block'; 
      
      // Parse template URLs and sort alphabetically
      const processedServers = config.servers.map(s => ({
        name: s.name,
        // Global replace just in case '{{movie-id}}' appears multiple times
        url: s.movie_url.replace(/\{\{movie-id\}\}/g, media.rawId) 
      })).sort((a, b) => a.name.localeCompare(b.name));

      openVideoModal("Movie", processedServers, config.defaultServer);
    };

    actionBar.appendChild(watchBtn);
    actionBar.appendChild(badge);
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

    sendMessageToBackground({ action: "checkPlayed", videoId: dbString }).then((res) => {
      if (res && res.played) {
        badge.style.display = 'block';
      }
    });

    watchBtn.onclick = async (e) => {
      e.preventDefault();

      const config = await getServersConfig();
      if (config.servers.length === 0) {
        alert("StreamBuddy: No servers configured! Please click the extension icon and add your JSON servers first.");
        return;
      }

      sendMessageToBackground({ action: "markPlayed", videoId: dbString });
      badge.style.display = 'block'; 
      
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

    h3.appendChild(watchBtn);
    h3.appendChild(badge);
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
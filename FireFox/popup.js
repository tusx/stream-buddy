document.addEventListener("DOMContentLoaded", async () => {
  const statusIndicator = document.getElementById("status-indicator");
  const clearBtn = document.getElementById("clear-history-btn");
  const moviesWatchedValue = document.getElementById("movies-watched-value");
  const episodesWatchedValue = document.getElementById("episodes-watched-value");

  // Server UI Elements
  const toggleServersBtn = document.getElementById("toggle-servers-btn");
  const removeServersBtn = document.getElementById("remove-servers-btn");
  const defaultServerSelect = document.getElementById("default-server-select");
  const jsonInputSection = document.getElementById("json-input-section");
  const serverJsonInput = document.getElementById("server-json-input");
  const saveJsonBtn = document.getElementById("save-json-btn");
  const cancelJsonBtn = document.getElementById("cancel-json-btn");
  const jsonError = document.getElementById("json-error");
  const updateWarning = document.getElementById("update-warning");

  // Custom Modal Elements
  const confirmModal = document.getElementById("custom-confirm-modal");
  const confirmOkBtn = document.getElementById("confirm-ok-btn");
  const confirmCancelBtn = document.getElementById("confirm-cancel-btn");

  async function refreshWatchStats() {
    try {
      const response = await browser.runtime.sendMessage({ action: "getWatchStats" });
      if (response && response.success && response.stats) {
        moviesWatchedValue.textContent = response.stats.movies;
        episodesWatchedValue.textContent = response.stats.episodes;
        return;
      }
    } catch (error) {
      console.error("StreamBuddy: Failed to load watch stats.", error);
    }

    moviesWatchedValue.textContent = "0";
    episodesWatchedValue.textContent = "0";
  }

  // --- 1. Existing Tab Checking Logic ---
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (currentTab && currentTab.url) {
      if (currentTab.url.includes("themoviedb.org")) {
        statusIndicator.textContent = "🟢 Active on this site";
        statusIndicator.className = "status-box status-active";
      } else {
        statusIndicator.textContent = "🔴 Inactive on this site";
        statusIndicator.className = "status-box status-inactive";
      }
    }
  } catch (error) {
    console.error("StreamBuddy: Failed to query tabs.", error);
    statusIndicator.textContent = "⚠️ Error checking status";
  }

  refreshWatchStats();

  // --- 2. History Logic (Now completely inline, no alerts!) ---
  clearBtn.addEventListener("click", async () => {
    const originalText = clearBtn.innerHTML;
    
    try {
      const response = await browser.runtime.sendMessage({ action: "clearHistory" });
      if (response && response.success) {
        clearBtn.innerHTML = "✅ Watch history cleaned!";
        clearBtn.style.backgroundColor = "#22c55e"; 
        clearBtn.style.borderColor = "#16a34a";
        clearBtn.style.color = "white";
        refreshWatchStats();
      } else {
        // Inline Error State
        clearBtn.innerHTML = "❌ Failed to clear history";
        clearBtn.style.backgroundColor = "#ef4444"; 
        clearBtn.style.borderColor = "#b91c1c";
        clearBtn.style.color = "white";
      }
    } catch (error) {
       // Inline Background Script Error State
       clearBtn.innerHTML = "⚠️ Background script error";
       clearBtn.style.backgroundColor = "#ef4444"; 
       clearBtn.style.borderColor = "#b91c1c";
       clearBtn.style.color = "white";
    }

    // Always revert back to the original button state after 2 seconds
    setTimeout(() => {
      clearBtn.innerHTML = originalText;
      clearBtn.style.backgroundColor = "";
      clearBtn.style.borderColor = "";
      clearBtn.style.color = "";
    }, 2000);
  });

  // --- 3. Server Management Logic ---

  // Load servers from storage and populate UI
  async function loadServers() {
    const data = await browser.storage.sync.get(['servers', 'defaultServer']);
    const servers = data.servers || [];
    const defaultServer = data.defaultServer || "";

    // Reset dropdown
    defaultServerSelect.innerHTML = '<option value="">None (Manual Selection)</option>';

    if (servers.length > 0) {
      toggleServersBtn.innerHTML = "🔄 Update Servers";
      removeServersBtn.style.display = "flex";
      updateWarning.style.display = "block";

      // Sort alphabetically and populate dropdown
      const sortedServers = [...servers].sort((a, b) => a.name.localeCompare(b.name));
      sortedServers.forEach(server => {
        const option = document.createElement("option");
        option.value = server.name;
        option.textContent = server.name;
        if (server.name === defaultServer) option.selected = true;
        defaultServerSelect.appendChild(option);
      });
    } else {
      toggleServersBtn.innerHTML = "➕ Add Servers";
      removeServersBtn.style.display = "none";
      updateWarning.style.display = "none";
    }
  }

  // Initialize UI
  loadServers();

  // Save default server selection automatically
  defaultServerSelect.addEventListener("change", async (e) => {
    await browser.storage.sync.set({ defaultServer: e.target.value });
  });

  // Toggle JSON Input Area
  toggleServersBtn.addEventListener("click", () => {
    jsonInputSection.style.display = "block";
    toggleServersBtn.style.display = "none";
  });

  // Cancel JSON Input
  cancelJsonBtn.addEventListener("click", () => {
    jsonInputSection.style.display = "none";
    toggleServersBtn.style.display = "flex";
    serverJsonInput.value = "";
    jsonError.style.display = "none";
  });

  // Validate and Save JSON
  saveJsonBtn.addEventListener("click", async () => {
    const rawJSON = serverJsonInput.value.trim();
    
    if (!rawJSON) {
      showError("Input cannot be empty.");
      return;
    }

    try {
      const parsedData = JSON.parse(rawJSON);

      if (!Array.isArray(parsedData)) throw new Error("JSON must be an array of objects [ { ... } ].");
      if (parsedData.length === 0) throw new Error("Array cannot be empty.");

      // Strict validation per object
      for (let i = 0; i < parsedData.length; i++) {
        const srv = parsedData[i];
        if (!srv.name || typeof srv.name !== "string" || srv.name.trim().length === 0) {
          throw new Error(`Item #${i + 1} is missing a valid 'name' (must be >= 1 character).`);
        }
        if (!srv.movie_url || typeof srv.movie_url !== "string") {
          throw new Error(`Server '${srv.name}' is missing a 'movie_url'.`);
        }
        if (!srv.tv_url || typeof srv.tv_url !== "string") {
          throw new Error(`Server '${srv.name}' is missing a 'tv_url'.`);
        }
      }

      // If we got here, it's valid. Save it!
      await browser.storage.sync.set({ servers: parsedData });

      // Reset UI state
      jsonInputSection.style.display = "none";
      toggleServersBtn.style.display = "flex";
      serverJsonInput.value = "";
      jsonError.style.display = "none";
      
      loadServers(); // Refresh dropdown
      
      // Brief success feedback
      const originalText = saveJsonBtn.innerHTML;
      saveJsonBtn.innerHTML = "Saved!";
      setTimeout(() => saveJsonBtn.innerHTML = originalText, 1500);

    } catch (e) {
      showError(e.message);
    }
  });

  // --- Custom Confirm Modal Logic ---
  
  // Show the modal
  removeServersBtn.addEventListener("click", () => {
    confirmModal.style.display = "flex";
  });

  // Hide the modal on Cancel
  confirmCancelBtn.addEventListener("click", () => {
    confirmModal.style.display = "none";
  });

// Process the deletion on OK
  confirmOkBtn.addEventListener("click", async () => {
    confirmModal.style.display = "none"; // Hide immediately
    await browser.storage.sync.remove(['servers', 'defaultServer']);
    loadServers(); // Refresh UI
  });

  function showError(msg) {
    jsonError.textContent = "❌ " + msg;
    jsonError.style.display = "block";
  }
});

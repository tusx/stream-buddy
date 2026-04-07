// Database Configuration
const DB_NAME = "StreamBuddyDB";
const DB_VERSION = 1;
const STORE_NAME = "videos";

// 1. Helper Function to Open the Database
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // Safe upgrade path: Check if we are on a fresh install
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "videoId" });
          console.log("StreamBuddy: Database initialized.");
        }
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

// 2. Function to Save a Video as Played
async function markAsPlayed(videoId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const videoData = {
      videoId: videoId,
      played: true,
      timestamp: Date.now()
    };

    const request = store.put(videoData);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

// 3. Function to Remove a Video from History
async function removePlayed(videoId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(videoId);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

// 4. Function to Check if a Video was Played
async function checkIfPlayed(videoId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly"); 
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(videoId);

    request.onsuccess = (event) => {
      resolve(!!event.target.result); 
    };
    request.onerror = (event) => reject(event.target.error);
  });
}

// 5. Function to Clear All History (NEW)
async function clearHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    // .clear() deletes all records in the object store instantly
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

// 6. Function to summarize watched items for the popup
async function getWatchStats() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = (event) => {
      const keys = event.target.result || [];
      let movieCount = 0;
      let episodeCount = 0;

      keys.forEach((videoId) => {
        if (typeof videoId !== "string") return;

        if (videoId.startsWith("tmdb-movie-")) {
          movieCount += 1;
          return;
        }

        if (videoId.startsWith("tmdb-tv-")) {
          episodeCount += 1;
        }
      });

      resolve({
        movies: movieCount,
        episodes: episodeCount,
        total: movieCount + episodeCount
      });
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

// 7. Message Listener (The "API" for your Content & Popup Scripts)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Route: Save a video
  if (message.action === "markPlayed") {
    markAsPlayed(message.videoId)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.toString() }));
    return true; 
  }

  // Route: Remove a video from watched history
  if (message.action === "removePlayed") {
    removePlayed(message.videoId)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.toString() }));
    return true;
  }

  // Route: Check a video
  if (message.action === "checkPlayed") {
    checkIfPlayed(message.videoId)
      .then((isPlayed) => sendResponse({ played: isPlayed }))
      .catch((error) => sendResponse({ played: false, error: error.toString() }));
    return true; 
  }

  // Route: Clear history (NEW)
  if (message.action === "clearHistory") {
    clearHistory()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.toString() }));
    return true; 
  }

  // Route: Watch stats for popup
  if (message.action === "getWatchStats") {
    getWatchStats()
      .then((stats) => sendResponse({ success: true, stats }))
      .catch((error) => sendResponse({ success: false, error: error.toString() }));
    return true;
  }
});

// Import configuration
// Note: config.js and notifications.js need to be loaded in manifest.json

/**
 * @typedef {Object} AppState
 * @property {string} apiUrl
 * @property {string} apiKey
 * @property {number} speechSpeed
 * @property {string} voice
 * @property {string} model
 * @property {boolean} streamingMode
 * @property {boolean} downloadMode
 * @property {boolean} isMobile
 */

// Settings state
let apiUrl = "";
let apiKey = "";
let speechSpeed = 1.0;
let voice = "af_bella+af_sky";
let model = "kokoro";
let streamingMode = false;
let downloadMode = false;
let isMobile = false;

// Audio playback state
let currentAudio = null;
let audioContext = null;
let gainNode = null;
let pcmStreamStopped = false;
let pcmPlaybackTime = 0;
let playbackState = "idle"; // idle | playing | paused

// Queue management
let audioQueue = [];
let isPlaying = false;
let stopRequested = false;
let currentAbortController = null;

function setPlaybackState(state) {
  playbackState = state;
}

browser.runtime.getPlatformInfo().then((info) => {
  isMobile = info.os === "android";
  initializeExtension();
});

function initializeExtension() {
  if (isMobile) {
    browser.browserAction.setPopup({ popup: "" });
    browser.browserAction.onClicked.addListener(handleMobileClick);
  } else {
    createContextMenu();
    browser.runtime.onInstalled.addListener(createContextMenu);
  }
}

function handleMobileClick(tab) {
  browser.tabs
    .executeScript({
      code: "window.getSelection().toString();",
    })
    .then((results) => {
      const selectedText = results[0];
      if (selectedText) {
        if (downloadMode && isMobile) {
          processMobileDownload(selectedText);
        } else {
          processText(selectedText);
        }
      }
    });
}

/**
 * Initialize settings from storage
 */
(async function initializeSettings() {
  try {
    const data = await browser.storage.local.get([
      "apiUrl", "apiKey", "speechSpeed", "voice", 
      "model", "streamingMode", "downloadMode", "outputVolume"
    ]);
    
    apiUrl = data.apiUrl || CONFIG.DEFAULT_API_URL;
    apiKey = data.apiKey || CONFIG.DEFAULT_API_KEY;
    speechSpeed = data.speechSpeed || CONFIG.DEFAULT_SPEED;
    voice = data.voice || CONFIG.DEFAULT_VOICE;
    model = data.model || CONFIG.DEFAULT_MODEL;
    streamingMode = data.streamingMode || false;
    downloadMode = data.downloadMode || false;
    if (gainNode) gainNode.gain.value = data.outputVolume ?? CONFIG.DEFAULT_VOLUME;
  } catch (error) {
    console.error('Failed to initialize settings:', error);
  }
})();

browser.storage.onChanged.addListener((changes) => {
  if (changes.apiUrl) apiUrl = changes.apiUrl.newValue;
  if (changes.apiKey) apiKey = changes.apiKey.newValue;
  if (changes.speechSpeed) speechSpeed = changes.speechSpeed.newValue;
  if (changes.voice) voice = changes.voice.newValue;
  if (changes.model) model = changes.model.newValue;
  if (changes.streamingMode) streamingMode = changes.streamingMode.newValue;
  if (changes.downloadMode) downloadMode = changes.downloadMode.newValue;
  if (changes.outputVolume && gainNode) gainNode.gain.value = changes.outputVolume.newValue;
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "stopPlayback") {
    stopRequested = true;
    pcmStreamStopped = true;
    
    audioQueue.forEach(url => URL.revokeObjectURL(url));
    audioQueue = [];
    isPlaying = false;
    setPlaybackState("idle");
    
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }

  if (message.action === "pausePlayback") {
    if (streamingMode && audioContext && playbackState === "playing") {
      audioContext.suspend().catch(() => {});
      setPlaybackState("paused");
    } else if (currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      setPlaybackState("paused");
    }
  }

  if (message.action === "resumePlayback") {
    if (streamingMode && audioContext && playbackState === "paused") {
      audioContext.resume().catch(() => {});
      setPlaybackState("playing");
    } else if (currentAudio && currentAudio.paused) {
      currentAudio.play().catch(() => {});
      setPlaybackState("playing");
    }
  }

  if (message.action === "getPlaybackState") {
    return Promise.resolve({ playbackState });
  }
});

function createContextMenu() {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create(
      {
        id: "readText",
        title: "Read Selected Text",
        contexts: ["selection"],
      },
      () => {},
    );
  });
}

browser.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

browser.contextMenus.onShown.addListener((info) => {
  createContextMenu();
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "readText" && info.selectionText) {
    processText(info.selectionText);
  }
});

/**
 * Split text into sentences for processing
 * Handles English (.), Chinese (。), and line breaks (\n)
 * @param {string} text - Text to split
 * @returns {string[]} Array of sentences
 */
function splitTextIntoSentences(text) {
  const sentences = [];
  let match;
  
  while ((match = CONFIG.SENTENCE_REGEX.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (sentence) {
      sentences.push(sentence);
    }
  }
  
  // Reset regex lastIndex for reuse
  CONFIG.SENTENCE_REGEX.lastIndex = 0;
  
  return sentences;
}

/**
 * Play next audio in queue
 * @returns {Promise<void>}
 */
async function playNextAudio() {
  if (isPlaying || audioQueue.length === 0) {
    return;
  }
  
  isPlaying = true;
  setPlaybackState("playing");
  const audioUrl = audioQueue.shift();
  
  try {
    currentAudio = new Audio(audioUrl);
    const storedVolume = (await browser.storage.local.get("outputVolume")).outputVolume ?? CONFIG.DEFAULT_VOLUME;
    currentAudio.volume = storedVolume;
    
    await currentAudio.play();
    
    currentAudio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      isPlaying = false;
      if (audioQueue.length === 0) {
        setPlaybackState("idle");
      }
      playNextAudio();
    };
    
    currentAudio.onerror = (error) => {
      logError('AUDIO_PLAYBACK', error);
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      isPlaying = false;
      if (audioQueue.length === 0) {
        setPlaybackState("idle");
      }
      playNextAudio();
    };
  } catch (error) {
    logError('AUDIO_PLAYBACK', error);
    URL.revokeObjectURL(audioUrl);
    isPlaying = false;
    if (audioQueue.length === 0) {
      setPlaybackState("idle");
    }
    playNextAudio();
  }
}

/**
 * Fetch audio for a single sentence
 * @param {string} sentence - Text to convert to speech
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @returns {Promise<string>} Object URL for audio blob
 */
async function fetchSentenceAudio(sentence, signal) {
  const payload = {
    model: model,
    input: sentence,
    voice: voice,
    response_format: "mp3",
    speed: speechSpeed,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const endpoint = apiUrl.endsWith("/")
    ? apiUrl + "audio/speech"
    : apiUrl + "/audio/speech";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: signal,
    });

    if (!response.ok) {
      const error = new Error(`API request failed with status: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error; // Don't log aborted requests
    }
    logError('API_REQUEST', error);
    throw error;
  }
}

/**
 * Process selected text and generate speech
 * @param {string} text - Text to convert to speech
 */
function processText(text) {
  if (!apiUrl) return;

  stopRequested = false;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  pcmStreamStopped = false;
  
  audioQueue.forEach(url => URL.revokeObjectURL(url));
  audioQueue = [];
  isPlaying = false;
  
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }

  if (streamingMode) {
    const payload = {
      model: model,
      input: text,
      voice: voice,
      response_format: "pcm",
      speed: speechSpeed,
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };

    const endpoint = apiUrl.endsWith("/")
      ? apiUrl + "audio/speech"
      : apiUrl + "/audio/speech";

    const controller = new AbortController();
    currentAbortController = controller;

    setPlaybackState("playing");
    fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          const error = new Error(`API request failed with status: ${response.status}`);
          error.status = response.status;
          throw error;
        }
        return processPCMStream(response);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          logError('API_REQUEST', error);
        }
      });
  } 
  else if (downloadMode) {
    if (isMobile) {
      processMobileDownload(text);
    } else {
      const payload = {
        model: model,
        input: text,
        voice: voice,
        response_format: "mp3",
        speed: speechSpeed,
      };

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      const endpoint = apiUrl.endsWith("/")
        ? apiUrl + "audio/speech"
        : apiUrl + "/audio/speech";

      const controller = new AbortController();
      currentAbortController = controller;

      fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) {
            const error = new Error(`API request failed with status: ${response.status}`);
            error.status = response.status;
            throw error;
          }
          return response.blob();
        })
        .then(async (blob) => {
          const url = URL.createObjectURL(blob);
          const now = new Date();
          const timestamp = now.getFullYear() + '-' + 
            String(now.getMonth() + 1).padStart(2, '0') + '-' + 
            String(now.getDate()).padStart(2, '0') + '_' + 
            String(now.getHours()).padStart(2, '0') + '-' + 
            String(now.getMinutes()).padStart(2, '0') + '-' + 
            String(now.getSeconds()).padStart(2, '0');
          await browser.downloads.download({
            url: url,
            filename: `tts-audio-${timestamp}.mp3`,
            conflictAction: "overwrite",
            saveAs: true
          });
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            logError('API_REQUEST', error);
          }
        });
    }
  } 
  // split text mode
  else {
    const TEXT_LENGTH_THRESHOLD = CONFIG.TEXT_LENGTH_THRESHOLD;
    
    if (text.length > TEXT_LENGTH_THRESHOLD) {
      const sentences = splitTextIntoSentences(text);
      
      currentAbortController = new AbortController();
      
      const processSentences = async () => {
        for (const sentence of sentences) {
          if (stopRequested) break; 
          
          try {
            const audioUrl = await fetchSentenceAudio(sentence, currentAbortController.signal);
            audioQueue.push(audioUrl);
            playNextAudio(); 
          } catch (error) {
            if (error.name !== 'AbortError') {
              console.error("Error processing sentence:", error);
              // Continue with next sentence instead of stopping completely
            }
          }
        }
        currentAbortController = null;
      };
      
      processSentences();
    } else {
      const payload = {
        model: model,
        input: text,
        voice: voice,
        response_format: "mp3",
        speed: speechSpeed,
      };

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      const endpoint = apiUrl.endsWith("/")
        ? apiUrl + "audio/speech"
        : apiUrl + "/audio/speech";

      const controller = new AbortController();
      currentAbortController = controller;

      fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok)
            throw new Error(`API request failed with status: ${response.status}`);
          return response.blob();
        })
        .then(async (blob) => {
          const url = URL.createObjectURL(blob);
          currentAudio = new Audio(url);
          const storedVolume = (await browser.storage.local.get("outputVolume")).outputVolume ?? CONFIG.DEFAULT_VOLUME;
          currentAudio.volume = storedVolume;
          setPlaybackState("playing");
          await currentAudio.play();
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            logError('API_REQUEST', error);
          }
        });
    }
  }
}

function processMobileDownload(text) {
  if (!apiUrl) return;

  const payload = {
    model: model,
    input: text,
    voice: voice,
    response_format: "mp3",
    speed: speechSpeed,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const endpoint = apiUrl.endsWith("/")
    ? apiUrl + "audio/speech"
    : apiUrl + "/audio/speech";

  browser.tabs.executeScript({
    code: `
      const toast = document.createElement('div');
      toast.textContent = 'Preparing download...';
      toast.id = 'tts-download-toast';
      toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#00bcd4;color:white;padding:12px 24px;border-radius:4px;z-index:10000;font-family:Arial,sans-serif;font-size:14px;pointer-events:none;';
      document.body.appendChild(toast);
    `
  });

  browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
    const currentTab = tabs[0];
    
    browser.tabs.executeScript(currentTab.id, {
      code: `
        (async function() {
          try {
            const payload = ${JSON.stringify(payload)};
            const headers = ${JSON.stringify(headers)};
            const endpoint = '${endpoint}';
            
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
              throw new Error('API request failed: ' + response.status);
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const now = new Date();
            const timestamp = now.getFullYear() + '-' + 
              String(now.getMonth() + 1).padStart(2, '0') + '-' + 
              String(now.getDate()).padStart(2, '0') + '_' + 
              String(now.getHours()).padStart(2, '0') + '-' + 
              String(now.getMinutes()).padStart(2, '0') + '-' + 
              String(now.getSeconds()).padStart(2, '0');
            
            const link = document.createElement('a');
            link.href = url;
            link.download = 'tts-audio-' + timestamp + '.mp3';
            link.style.display = 'none';
            document.body.appendChild(link);
            
            link.click();
            
            setTimeout(() => {
              URL.revokeObjectURL(url);
              link.remove();
            }, 1000);
            
            const toast = document.getElementById('tts-download-toast');
            if (toast) toast.remove();
            
            const successToast = document.createElement('div');
            successToast.textContent = 'Download started';
            successToast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#00bcd4;color:white;padding:12px 24px;border-radius:4px;z-index:10000;font-family:Arial,sans-serif;font-size:14px;pointer-events:none;';
            document.body.appendChild(successToast);
            setTimeout(() => successToast.remove(), 2000);
            
          } catch (error) {
            const toast = document.getElementById('tts-download-toast');
            if (toast) toast.remove();
            
            const errorToast = document.createElement('div');
            errorToast.textContent = 'Download failed: ' + error.message;
            errorToast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#ff5252;color:white;padding:12px 24px;border-radius:4px;z-index:10000;font-family:Arial,sans-serif;font-size:14px;pointer-events:none;';
            document.body.appendChild(errorToast);
            setTimeout(() => errorToast.remove(), 3000);
          }
        })();
      `
    });
  });
}

/**
 * Process PCM audio stream for low-latency playback
 * @param {Response} response - Fetch response with PCM stream
 * @returns {Promise<void>}
 */
async function processPCMStream(response) {
  const sampleRate = CONFIG.PCM_SAMPLE_RATE;
  const numChannels = CONFIG.PCM_NUM_CHANNELS;
  setPlaybackState("playing");

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: sampleRate,
  });

  const storedVolume = (await browser.storage.local.get("outputVolume")).outputVolume ?? CONFIG.DEFAULT_VOLUME;
  gainNode = audioContext.createGain();
  gainNode.gain.value = storedVolume;
  gainNode.connect(audioContext.destination);

  pcmStreamStopped = false;
  pcmPlaybackTime = audioContext.currentTime;

  const reader = response.body.getReader();
  let leftover = new Uint8Array(0);

  async function readAndPlay() {
    while (!pcmStreamStopped) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      if (!audioContext) break;

      let pcmData = new Uint8Array(leftover.length + value.length);
      pcmData.set(leftover, 0);
      pcmData.set(value, leftover.length);

      const bytesPerSample = CONFIG.PCM_BYTES_PER_SAMPLE;
      const totalSamples = Math.floor(
        pcmData.length / bytesPerSample / numChannels,
      );
      const usableBytes = totalSamples * bytesPerSample * numChannels;

      const usablePCM = pcmData.slice(0, usableBytes);
      leftover = pcmData.slice(usableBytes);

      const audioBuffer = audioContext.createBuffer(
        numChannels,
        totalSamples,
        sampleRate,
      );

      for (let channel = 0; channel < numChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < totalSamples; i++) {
          const index = (i * numChannels + channel) * bytesPerSample;
          const sample = (usablePCM[index + 1] << 8) | usablePCM[index];
          channelData[i] =
            (sample & 0x8000 ? sample | ~0xffff : sample) / 32768;
        }
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNode);
      
      const now = audioContext.currentTime;
      if (pcmPlaybackTime < now) {
        pcmPlaybackTime = now;
      }
      source.start(pcmPlaybackTime);
      pcmPlaybackTime += audioBuffer.duration;

      source.onended = () => {
        source.disconnect();
      };
    }
    leftover = new Uint8Array(0);
  }

  try {
    await readAndPlay();
  } catch (error) {
    if (error.name !== 'AbortError') {
      logError('AUDIO_PLAYBACK', error);
    }
  }
}

browser.commands.onCommand.addListener((command) => {
  if (command === "read-selected-text") {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      browser.tabs.executeScript(tabs[0].id, {
        code: "window.getSelection().toString();",
      }).then((results) => {
        const selectedText = results[0];
        if (selectedText) {
          processText(selectedText);
        }
      });
    });
  } else if (command === "stop-playback") {
    stopRequested = true;
    pcmStreamStopped = true;
    audioQueue.forEach(url => URL.revokeObjectURL(url));
    audioQueue = [];
    isPlaying = false;
    setPlaybackState("idle");
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
  }
});

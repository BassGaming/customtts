/**
 * Shared settings management for TTS extension
 * Used by both popup and options pages
 */

/**
 * @typedef {Object} TTSSettings
 * @property {string} apiUrl - The TTS API endpoint URL
 * @property {string} apiKey - API authentication key
 * @property {number} speechSpeed - Speech playback speed (0.1-10.0)
 * @property {string} voice - Voice identifier
 * @property {string} model - TTS model name
 * @property {boolean} streamingMode - Whether to use PCM streaming
 * @property {boolean} downloadMode - Whether to download audio files
 * @property {number} outputVolume - Audio volume (0-1)
 */

const DEFAULT_SETTINGS = {
  apiUrl: 'http://host.docker.internal:8880/v1/',
  apiKey: 'not-needed',
  voice: 'af_bella+bf_emma+af_nicole',
  speechSpeed: 1.0,
  model: 'kokoro',
  streamingMode: false,
  downloadMode: false,
  outputVolume: 1.0
};

const SPEED_LIMITS = {
  min: 0.1,
  max: 10.0
};

const VOLUME_LIMITS = {
  min: 0,
  max: 1
};

const KOKORO_VOICES = [
  { group: 'American Female', voices: ['af_alex', 'af_alva', 'af_bella', 'af_heart', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky'] },
  { group: 'American Male', voices: ['am_adam', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck'] },
  { group: 'British Female', voices: ['bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily'] },
  { group: 'British Male', voices: ['bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'] },
  { group: 'Spanish Female', voices: ['ef_dora'] },
  { group: 'Spanish Male', voices: ['em_alex', 'em_santa'] }
];

/**
 * Load settings from browser storage
 * @returns {Promise<TTSSettings>}
 */
async function loadSettings() {
  try {
    const data = await browser.storage.local.get([
      'apiUrl', 'apiKey', 'speechSpeed', 'voice', 
      'model', 'streamingMode', 'downloadMode', 'outputVolume'
    ]);
    
    return {
      apiUrl: data.apiUrl || DEFAULT_SETTINGS.apiUrl,
      apiKey: data.apiKey || DEFAULT_SETTINGS.apiKey,
      voice: data.voice || DEFAULT_SETTINGS.voice,
      speechSpeed: data.speechSpeed || DEFAULT_SETTINGS.speechSpeed,
      model: data.model || DEFAULT_SETTINGS.model,
      streamingMode: data.streamingMode || DEFAULT_SETTINGS.streamingMode,
      downloadMode: data.downloadMode || DEFAULT_SETTINGS.downloadMode,
      outputVolume: data.outputVolume ?? DEFAULT_SETTINGS.outputVolume
    };
  } catch (error) {
    console.error('Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings to browser storage
 * @param {TTSSettings} settings - Settings to save
 * @returns {Promise<void>}
 */
async function saveSettings(settings) {
  try {
    await browser.storage.local.set(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    throw new Error('Failed to save settings. Please try again.');
  }
}

/**
 * Read the current settings from the form elements
 * @param {Object} elements - DOM elements
 * @returns {TTSSettings}
 */
function collectSettings(elements) {
  return {
    apiUrl: elements.apiUrlInput.value.trim(),
    apiKey: elements.apiKeyInput.value.trim(),
    speechSpeed: parseFloat(elements.speedInput.value),
    voice: elements.voiceInput.value.trim(),
    model: elements.modelInput.value.trim(),
    streamingMode: elements.streamingModeInput.checked,
    downloadMode: elements.downloadModeInput.checked,
    outputVolume: parseFloat(elements.volumeInput.value)
  };
}

/**
 * Briefly highlight an invalid input
 * @param {HTMLElement} element - Input to highlight
 */
function flashInvalid(element) {
  element.classList.add('invalid');
  setTimeout(() => element.classList.remove('invalid'), 1200);
}

/**
 * Save the current form state. Invalid fields are reverted to their
 * last saved values and highlighted instead of raising an alert.
 * @param {Object} elements - DOM elements
 * @returns {Promise<void>}
 */
async function saveCurrentSettings(elements) {
  const settings = collectSettings(elements);
  const saved = await loadSettings();
  let reverted = false;

  const revert = (element, value) => {
    element.value = value;
    flashInvalid(element);
    reverted = true;
  };

  if (settings.apiUrl === '') {
    revert(elements.apiUrlInput, saved.apiUrl);
  }
  if (isNaN(settings.speechSpeed) ||
      settings.speechSpeed < SPEED_LIMITS.min ||
      settings.speechSpeed > SPEED_LIMITS.max) {
    revert(elements.speedInput, saved.speechSpeed);
  }
  if (isNaN(settings.outputVolume) ||
      settings.outputVolume < VOLUME_LIMITS.min ||
      settings.outputVolume > VOLUME_LIMITS.max) {
    revert(elements.volumeInput, saved.outputVolume);
  }

  if (reverted) return;

  try {
    await saveSettings(settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Save settings automatically: on commit (blur/Enter/dropdown pick/toggle)
 * of any field, and shortly after typing stops (covers closing the popup
 * without a blur).
 * @param {Object} elements - DOM elements
 */
function setupAutoSave(elements) {
  const inputs = [
    elements.apiUrlInput,
    elements.apiKeyInput,
    elements.speedInput,
    elements.voiceInput,
    elements.modelInput,
    elements.streamingModeInput,
    elements.downloadModeInput,
    elements.volumeInput
  ];

  let debounceTimer = null;
  const scheduleSave = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => saveCurrentSettings(elements), 600);
  };

  inputs.forEach((input) => {
    input.addEventListener('change', () => saveCurrentSettings(elements));
    if (input.type === 'text' || input.type === 'number' || input.type === 'range') {
      input.addEventListener('input', scheduleSave);
    }
  });
}

/**
 * Initialize settings UI elements
 * @param {Object} elements - DOM elements
 */
async function initializeUI(elements) {
  const settings = await loadSettings();
  
  elements.apiUrlInput.value = settings.apiUrl;
  elements.apiKeyInput.value = settings.apiKey;
  elements.voiceInput.value = settings.voice;
  elements.speedInput.value = settings.speechSpeed;
  elements.modelInput.value = settings.model;
  elements.streamingModeInput.checked = settings.streamingMode;
  elements.downloadModeInput.checked = settings.downloadMode;
  elements.volumeInput.value = settings.outputVolume;
}

/**
 * Setup mutual exclusivity between streaming and download modes
 * @param {Object} elements - DOM elements
 */
function setupModeExclusivity(elements) {
  elements.streamingModeInput.addEventListener('change', () => {
    if (elements.streamingModeInput.checked && elements.downloadModeInput.checked) {
      elements.downloadModeInput.checked = false;
      if (elements.streamingWarning) elements.streamingWarning.style.display = 'none';
      if (elements.downloadWarning) elements.downloadWarning.style.display = 'none';
    }
  });

  elements.downloadModeInput.addEventListener('change', () => {
    if (elements.downloadModeInput.checked && elements.streamingModeInput.checked) {
      elements.streamingModeInput.checked = false;
      if (elements.streamingWarning) elements.streamingWarning.style.display = 'none';
      if (elements.downloadWarning) elements.downloadWarning.style.display = 'none';
    }
  });
}

/**
 * Rebuild the voice datalist, keeping only groups/voices matching the queries.
 * An empty query list shows everything.
 * @param {HTMLDataListElement} datalist - The datalist to populate
 * @param {string[]} queries - Lowercase search terms (empty string = no filter)
 */
function buildVoiceOptions(datalist, queries) {
  const matchVoice = (query, text) => query === '' || text.toLowerCase().includes(query);
  const matchGroup = (query, text) =>
    query === '' || new RegExp(`\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text.toLowerCase());

  datalist.replaceChildren();
  for (const entry of KOKORO_VOICES) {
    const groupLower = entry.group.toLowerCase();
    const matchingVoices = entry.voices.filter((voice) =>
      queries.some((q) => matchVoice(q, voice) || matchGroup(q, groupLower))
    );
    if (matchingVoices.length === 0) continue;

    const optgroup = document.createElement('optgroup');
    optgroup.label = entry.group;
    for (const voice of matchingVoices) {
      const option = document.createElement('option');
      option.value = voice;
      option.label = `${voice} (${entry.group})`;
      optgroup.appendChild(option);
    }
    datalist.appendChild(optgroup);
  }
}

/**
 * Attach a dropdown of known Kokoro voices to the voice input.
 * The list filters while typing, matching voice names and group names
 * (e.g. "spanish" shows the Spanish groups). Free typing of
 * "voice1+voice2" mixes still works.
 * @param {Object} elements - DOM elements
 */
function setupVoiceSuggestions(elements) {
  const datalist = document.createElement('datalist');
  datalist.id = 'voiceList';

  buildVoiceOptions(datalist, ['']);
  document.body.appendChild(datalist);
  elements.voiceInput.setAttribute('list', 'voiceList');

  const knownVoices = new Set(KOKORO_VOICES.flatMap((entry) => entry.voices));
  let pickedSuggestion = false;

  elements.voiceInput.addEventListener('change', () => {
    pickedSuggestion = knownVoices.has(elements.voiceInput.value.trim());
  });

  elements.voiceInput.addEventListener('input', () => {
    // Defer the rebuild out of the event task: mutating the datalist
    // synchronously right after a selection makes Firefox reopen the
    // suggestion popup. When a suggestion was just picked, restore the
    // full list so the next time the popup opens it shows all voices.
    setTimeout(() => {
      const wasPicked = pickedSuggestion;
      pickedSuggestion = false;
      if (wasPicked) {
        buildVoiceOptions(datalist, ['']);
        return;
      }
      const query = elements.voiceInput.value.trim().toLowerCase();
      const queries = query === '' ? [''] : query.split('+');
      buildVoiceOptions(datalist, queries);
    }, 0);
  });
}

/**
 * Handle stop playback button click
 */
function handleStopPlayback() {
  browser.runtime.sendMessage({ action: 'stopPlayback' });
}

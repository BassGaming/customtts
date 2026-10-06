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
 * @property {string} instructions - Voice style instructions (OpenAI gpt-4o-mini-tts)
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
  instructions: '',
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
  { group: 'American Female', voices: ['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky'] },
  { group: 'American Male', voices: ['am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa'] },
  { group: 'British Female', voices: ['bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily'] },
  { group: 'British Male', voices: ['bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'] },
  { group: 'Japanese Female', voices: ['jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro'] },
  { group: 'Japanese Male', voices: ['jm_kumo'] },
  { group: 'Mandarin Chinese Female', voices: ['zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi'] },
  { group: 'Mandarin Chinese Male', voices: ['zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'] },
  { group: 'Spanish Female', voices: ['ef_dora'] },
  { group: 'Spanish Male', voices: ['em_alex', 'em_santa'] },
  { group: 'French Female', voices: ['ff_siwis'] },
  { group: 'Hindi Female', voices: ['hf_alpha', 'hf_beta'] },
  { group: 'Hindi Male', voices: ['hm_omega', 'hm_psi'] },
  { group: 'Italian Female', voices: ['if_sara'] },
  { group: 'Italian Male', voices: ['im_nicola'] },
  { group: 'Brazilian Portuguese Female', voices: ['pf_dora'] },
  { group: 'Brazilian Portuguese Male', voices: ['pm_alex', 'pm_santa'] }
];

const OPENAI_TTS_VOICES = [
  { group: 'OpenAI gpt-4o-mini-tts', voices: ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] }
];

const OPENAI_TTS1_VOICES = [
  { group: 'OpenAI tts-1', voices: ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'] }
];

/**
 * Pick the voice list for a model. Only models whose voices we know about
 * return a source; anything else (any other OpenAI-compatible service) gets
 * no suggestions. Kokoro supports "+"-joined voice mixes, OpenAI voices don't.
 * @param {string} model - Model name from the settings field
 * @returns {{groups: Array, multi: boolean}|null}
 */
function getVoiceSource(model) {
  const name = (model || '').trim().toLowerCase();
  if (name === 'kokoro') {
    return { groups: KOKORO_VOICES, multi: true };
  }
  if (name.startsWith('gpt-4o-mini-tts')) {
    return { groups: OPENAI_TTS_VOICES, multi: false };
  }
  if (name === 'tts-1' || name === 'tts-1-hd') {
    return { groups: OPENAI_TTS1_VOICES, multi: false };
  }
  return null;
}

/**
 * Load settings from browser storage
 * @returns {Promise<TTSSettings>}
 */
async function loadSettings() {
  try {
    const data = await browser.storage.local.get([
      'apiUrl', 'apiKey', 'speechSpeed', 'voice', 
      'model', 'instructions', 'streamingMode', 'downloadMode', 'outputVolume'
    ]);
    
    return {
      apiUrl: data.apiUrl || DEFAULT_SETTINGS.apiUrl,
      apiKey: data.apiKey || DEFAULT_SETTINGS.apiKey,
      voice: data.voice || DEFAULT_SETTINGS.voice,
      speechSpeed: data.speechSpeed || DEFAULT_SETTINGS.speechSpeed,
      model: data.model || DEFAULT_SETTINGS.model,
      instructions: data.instructions || DEFAULT_SETTINGS.instructions,
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
    instructions: elements.instructionsInput.value.trim(),
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
    elements.instructionsInput,
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
    if (input.type === 'text' || input.type === 'number' ||
        input.type === 'range' || input.type === 'textarea') {
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
  elements.instructionsInput.value = settings.instructions;
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
 * Rebuild the voice datalist for the token currently being typed.
 *
 * The voice field can hold several voices joined by "+". The part after the
 * last "+" is the token being searched and the prefix (everything up to and
 * including that "+") is re-added to every option. This lets a fresh
 * suggestion list appear after a "+" and makes picking an option keep the
 * voices already entered.
 *
 * Firefox filters datalist suggestions using an option's label only, so the
 * label has to contain the current input for a combined value to be listed.
 *
 * @param {HTMLDataListElement} datalist - The datalist to populate
 * @param {Array<{group: string, voices: string[]}>} groups - Voice groups to list
 * @param {string} prefix - Text to prepend to every option (e.g. "af_bella+")
 * @param {string} token - Lowercase search term for the current voice
 * @param {string} fullInput - Current voice input, kept in labels for Firefox
 * @returns {Set<string>} Full option values that were offered
 */
function buildVoiceOptions(datalist, groups, prefix, token, fullInput) {
  const matchVoice = (text) => token === '' || text.toLowerCase().includes(token);
  const matchGroup = (text) =>
    token === '' ||
    new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text.toLowerCase());

  const offered = new Set();
  datalist.replaceChildren();

  for (const entry of groups) {
    const matchingVoices = entry.voices.filter(
      (voice) => matchVoice(voice) || matchGroup(entry.group)
    );
    if (matchingVoices.length === 0) continue;

    const optgroup = document.createElement('optgroup');
    optgroup.label = entry.group;
    for (const voice of matchingVoices) {
      const option = document.createElement('option');
      option.value = prefix + voice;
      option.label = prefix === ''
        ? `${voice} (${entry.group})`
        : `${voice} (${entry.group}) ${fullInput}`;
      optgroup.appendChild(option);
      offered.add(prefix + voice);
    }
    datalist.appendChild(optgroup);
  }

  return offered;
}

/**
 * Attach a dropdown of known voices to the voice input. The list depends on
 * the model: Kokoro voices (mixable with "+") for "kokoro", the OpenAI voice
 * set for OpenAI TTS models, and nothing for any other service. While typing,
 * the list filters by voice name and group name (e.g. "spanish", "british").
 * @param {Object} elements - DOM elements
 */
function setupVoiceSuggestions(elements) {
  const datalist = document.createElement('datalist');
  datalist.id = 'voiceList';
  document.body.appendChild(datalist);
  elements.voiceInput.setAttribute('list', 'voiceList');

  let offeredValues = new Set();
  let pickedSuggestion = false;

  const refresh = () => {
    const source = getVoiceSource(elements.modelInput.value);
    if (!source) {
      offeredValues = new Set();
      datalist.replaceChildren();
      return;
    }

    const fullInput = elements.voiceInput.value;
    let prefix = '';
    let token = fullInput.trim().toLowerCase();

    // Kokoro mixes voices with "+": search only the token after the last "+"
    // and re-attach the prefix to every suggestion. OpenAI voices are single.
    if (source.multi) {
      const plus = fullInput.lastIndexOf('+');
      if (plus >= 0) {
        prefix = fullInput.slice(0, plus + 1);
        token = fullInput.slice(plus + 1).trim().toLowerCase();
      }
    }

    offeredValues = buildVoiceOptions(datalist, source.groups, prefix, token, fullInput);
  };

  elements.modelInput.addEventListener('input', refresh);
  elements.modelInput.addEventListener('change', refresh);

  elements.voiceInput.addEventListener('change', () => {
    pickedSuggestion = offeredValues.has(elements.voiceInput.value);
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
        const source = getVoiceSource(elements.modelInput.value);
        offeredValues = source
          ? buildVoiceOptions(datalist, source.groups, '', '', '')
          : new Set();
        return;
      }
      refresh();
    }, 0);
  });

  refresh();
}

/**
 * Handle stop playback button click
 */
function handleStopPlayback() {
  browser.runtime.sendMessage({ action: 'stopPlayback' });
}

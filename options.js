document.addEventListener("DOMContentLoaded", async () => {
  const elements = {
    apiUrlInput: document.getElementById("apiUrl"),
    apiKeyInput: document.getElementById("apiKey"),
    speedInput: document.getElementById("speed"),
    voiceInput: document.getElementById("voice"),
    modelInput: document.getElementById("model"),
    streamingModeInput: document.getElementById("streamingMode"),
    downloadModeInput: document.getElementById("downloadMode"),
    volumeInput: document.getElementById("volume"),
    streamingWarning: document.getElementById("streamingWarning"),
    downloadWarning: document.getElementById("downloadWarning"),
    stopButton: document.getElementById("stopButton")
  };

  // Initialize UI with saved settings
  await initializeUI(elements);

  // Setup mode exclusivity
  setupModeExclusivity(elements);

  // Setup voice dropdown suggestions
  setupVoiceSuggestions(elements);

  // Auto-save settings on change
  setupAutoSave(elements);

  // Stop playback
  elements.stopButton.addEventListener("click", handleStopPlayback);
});
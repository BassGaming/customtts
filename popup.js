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
    stopButton: document.getElementById("stopButton"),
    playButton: document.getElementById("playButton"),
    pauseButton: document.getElementById("pauseButton"),
    speedValue: document.getElementById("speedValue")
  };

  // Initialize UI with saved settings
  await initializeUI(elements);

  // Setup mode exclusivity
  setupModeExclusivity(elements);

  // Setup voice dropdown suggestions
  setupVoiceSuggestions(elements);

  // Auto-save settings on change
  setupAutoSave(elements);

  // Keep the speed readout in sync with the slider
  elements.speedValue.textContent = elements.speedInput.value;
  elements.speedInput.addEventListener("input", () => {
    elements.speedValue.textContent = elements.speedInput.value;
  });

  // Stop playback
  elements.stopButton.addEventListener("click", handleStopPlayback);

  async function updateTransportState() {
    try {
      const { playbackState } = (await browser.runtime.sendMessage({ action: "getPlaybackState" })) || { playbackState: "idle" };
      setTransportButtons(playbackState);
    } catch (e) {
      setTransportButtons("idle");
    }
  }

  function setTransportButtons(state) {
    const playDisabled = state !== "paused";
    const pauseDisabled = state !== "playing";
    const stopDisabled = state === "idle";
    elements.playButton.disabled = playDisabled;
    elements.pauseButton.disabled = pauseDisabled;
    elements.stopButton.disabled = stopDisabled;
  }

  // Stop playback
  elements.stopButton.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ action: "stopPlayback" });
    setTransportButtons("idle");
  });

  // Play (resume)
  elements.playButton.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ action: "resumePlayback" });
    await updateTransportState();
  });

  // Pause
  elements.pauseButton.addEventListener("click", async () => {
    await browser.runtime.sendMessage({ action: "pausePlayback" });
    await updateTransportState();
  });

  // Initial transport state
  updateTransportState();
});

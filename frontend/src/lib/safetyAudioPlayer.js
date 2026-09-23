// One reusable media element; playback never depends on speechSynthesis voices.
export function createSafetyAudioPlayer({ createAudio = () => new Audio(), onError = () => {} } = {}) {
  let audio;
  let generation = 0;

  function stop() {
    generation++;
    if (audio) {
      audio.onerror = null;
      audio.pause();
    }
  }

  async function play(url) {
    stop();
    const current = generation;
    try {
      audio ||= createAudio();
      audio.preload = 'auto';
      audio.src = url;
      audio.onerror = () => {
        if (current === generation) onError('The audio clip could not be loaded. Check your connection and try again.');
      };
      await audio.play();
      return current === generation ? 'started' : 'cancelled';
    } catch (error) {
      if (current !== generation) return 'cancelled';
      onError(error.name === 'NotAllowedError'
        ? 'Chrome blocked playback. Allow sound for this site and tap Enable audio again.'
        : 'The audio clip could not play. Check your connection and try again.');
      return 'failed';
    }
  }

  return { play, stop };
}

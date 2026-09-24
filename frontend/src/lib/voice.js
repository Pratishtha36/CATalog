let audio;
export function stopVoice() { window.speechSynthesis?.cancel(); audio?.pause(); audio = null; }
export async function speakHindi(text, fallback) {
  stopVoice();
  const voice = window.speechSynthesis?.getVoices().find(item => item.lang.toLowerCase().startsWith('hi'));
  if (voice) {
    const speech = new SpeechSynthesisUtterance(text); speech.lang = 'hi-IN'; speech.voice = voice;
    window.speechSynthesis.speak(speech);
    return 'Playing Hindi using this device. Read the transcript if speech stops.';
  }
  if (fallback) {
    audio = new Audio(fallback);
    await audio.play();
    return 'Playing the bundled Hindi topic lesson. Personalised numbers and quiz remain on screen.';
  }
  throw new Error('No Hindi device voice is available. Use the visible transcript.');
}

export default class SpeechHelper {
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[];
  private isMuted: boolean;
  public lang: string;

  constructor(lang: string = "en", isMuted: boolean = false) {
    this.synth = window.speechSynthesis;

    if (this.synth) {
      this.voices = this.synth.getVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => {
          this.voices = this.synth.getVoices();
        };
      }
    } else {
      this.voices = [];
    }

    this.lang = lang;
    this.isMuted = isMuted;
  }

  public get muted() {
    return this.isMuted;
  }

  public set muted(value: boolean) {
    this.isMuted = value;
    if (this.isMuted && this.synth && (this.synth.speaking || this.synth.pending)) {
      this.synth.cancel();
    }
  }

  speak(text: string) {
    if (!this.synth || text.length === 0 || this.isMuted) {
      return;
    }
    const voices = this.voices.filter((voice) => voice.lang.startsWith(this.lang));
    if (voices.length === 0) {
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = voices[Math.floor(Math.random() * voices.length)];
    this.synth.speak(utter);
  }
}

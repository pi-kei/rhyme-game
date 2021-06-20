export default class SpeechHelper {
    private synth: SpeechSynthesis;
    private voices: SpeechSynthesisVoice[];
    public lang: string;
    public mute: boolean;

    constructor(lang: string = 'en', mute: boolean = false) {
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
        this.mute = mute;
    }

    speak(text: string) {
        if (!this.synth || text.length === 0 || this.mute) {
            return;
        }
        /*if (this.synth.speaking) {
            this.synth.cancel();
            setTimeout(this.speak, 300);
            return;
        }*/
        const voices = this.voices.filter(voice => voice.lang.startsWith(this.lang));
        if (voices.length === 0) {
            return;
        }
        const utter = new SpeechSynthesisUtterance(text);
        utter.voice = voices[Math.floor(Math.random() * voices.length)];
        this.synth.speak(utter);
    }
}
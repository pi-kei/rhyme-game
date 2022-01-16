import { Howl, Howler, HowlOptions } from "howler";

class SoundsHelper {
  private soundsLib: { [key: string]: Howl };
  private isMuted: boolean;

  constructor(isMuted: boolean = false) {
    this.soundsLib = {};
    this.isMuted = isMuted;
    Howler.mute(this.isMuted);
  }

  public addSound(key: string, options: HowlOptions) {
    this.soundsLib[key] = new Howl(options);
  }

  public getSound(key: string): Howl {
    return this.soundsLib[key];
  }

  public get muted(): boolean {
    return this.isMuted;
  }

  public set muted(value: boolean) {
    this.isMuted = value;
    Howler.mute(this.isMuted);
  }
}

export default SoundsHelper;

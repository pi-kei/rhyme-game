import { Howl, Howler, HowlOptions } from "howler";
import { useRef, useState } from "react";

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

export function useSoundsHelper(soundsHelper: SoundsHelper) {
  const soundsHelperRef = useRef(soundsHelper);
  const [isMuted, setIsMuted] = useState<boolean>(soundsHelperRef.current.muted);

  const toggleMuted = () => {
    setIsMuted((prevIsMuted) => {
      const newIsMuted = !prevIsMuted;
      soundsHelperRef.current.muted = newIsMuted;
      return newIsMuted;
    });
  };

  const playSound = (key: string) => {
    soundsHelperRef.current.getSound(key).play();
  };

  return {
    isMuted,
    toggleMuted,
    playSound,
  };
}

export default SoundsHelper;

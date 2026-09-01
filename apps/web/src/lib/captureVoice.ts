/**
 * Guidance you can hear, for the part of the scan you cannot watch.
 *
 * The two profile steps ask the user to turn 48-85 degrees away from the screen and hold. From
 * the moment they start turning, every channel this app used to have is behind their cheek: the
 * written instruction, the hold meter, the preview. They were being asked to follow directions
 * they could no longer read, and to hold a pose for over a second with no way of knowing whether
 * it was the right one. That is the reason the profiles were hard, more than the angle itself.
 *
 * So the guidance is spoken, and the two moments that matter most -- "you are in the window now"
 * and "that one is taken" -- also get a tone and a buzz, because they need to land even if the
 * phone is at arm's length or the room is loud.
 *
 * Everything here is optional at runtime. Safari on iOS has no `navigator.vibrate`, a locked-down
 * browser may have no `speechSynthesis`, and an `AudioContext` cannot be built outside a user
 * gesture. Each is feature-detected and each degrades to silence rather than to an exception --
 * losing the beep must never be able to stop a scan.
 */

/**
 * Whether this guidance is worth interrupting the last one for.
 *
 * Two rules, both learned from what reads badly out loud. Repeating the same instruction over and
 * over is worse than saying nothing -- the user already knows they are not straight yet, and the
 * repetition talks over their own attempt to fix it. And a message that changes every few frames
 * (the pose crossing a boundary back and forth) turns into stutter, so a floor on the gap between
 * utterances keeps it to a pace someone can actually act on.
 *
 * Pure, and separated from the speaking, so the pacing can be tested without a speech engine.
 */
export function shouldAnnounce(
  code: string,
  lastCode: string | null,
  lastAt: number,
  now: number,
  minGapMs = 1200,
) {
  if (code === lastCode) return false;
  // Nothing has been said yet -- at the start of a scan, or after `reset` at a step boundary --
  // so there is no previous utterance to leave room for. Stated rather than left to arithmetic:
  // `lastAt` is 0 in that state, and `now - 0 >= minGapMs` only happens to be true because
  // `Date.now()` is large. That is an accident, not a guarantee.
  if (lastCode === null) return true;
  return now - lastAt >= minGapMs;
}

export type CaptureVoice = {
  /** Speak `text` if `code` is new and the last utterance has had its turn. */
  say: (code: string, text: string) => void;
  /** The pose just became valid: a rising pair of notes, and a short buzz. */
  ready: () => void;
  /** A frame was taken: a click, and a longer buzz. */
  shutter: () => void;
  /** Forget the last utterance, so the next step starts talking immediately. */
  reset: () => void;
  /** Stop any speech in flight and release the audio device. */
  close: () => void;
};

const SILENT: CaptureVoice = {
  say: () => {},
  ready: () => {},
  shutter: () => {},
  reset: () => {},
  close: () => {},
};

/** A voice that does nothing, for when sound is off. Exported so callers need no null checks. */
export const silentVoice = SILENT;

function openAudio(): AudioContext | null {
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/**
 * Build the voice. **Call this from the user gesture that starts the camera**, never from the
 * frame loop: browsers refuse to create or resume an `AudioContext` outside a gesture, and one
 * built in the loop is born suspended and stays silent for the whole scan.
 */
export function createCaptureVoice(lang: string): CaptureVoice {
  const audio = openAudio();
  const speech = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  let lastCode: string | null = null;
  let lastAt = 0;

  const buzz = (pattern: number | number[]) => {
    if (!canVibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // A vibration the device declined is not a reason to interrupt a capture.
    }
  };

  const beep = (from: number, to: number, seconds: number) => {
    if (!audio) return;
    try {
      // Resuming is safe to attempt every time: a context that is already running ignores it, and
      // one suspended by a backgrounded tab needs it. The promise is deliberately unawaited.
      if (audio.state === "suspended") void audio.resume();
      const now = audio.currentTime;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(from, now);
      if (to !== from) oscillator.frequency.linearRampToValueAtTime(to, now + seconds);
      // Ramped rather than switched, because an abrupt gain change is heard as a click on top of
      // the tone the click is supposed to be.
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now);
      oscillator.stop(now + seconds + 0.02);
    } catch {
      // Same reasoning as the vibration.
    }
  };

  return {
    say(code, text) {
      if (!speech || !text) return;
      const now = Date.now();
      if (!shouldAnnounce(code, lastCode, lastAt, now)) return;
      lastCode = code;
      lastAt = now;
      try {
        // Cancel first: queued utterances would otherwise describe a pose the head has already
        // left, which is worse than silence because the user acts on it.
        speech.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 1.05;
        speech.speak(utterance);
      } catch {
        // As above.
      }
    },
    ready() {
      beep(660, 990, 0.13);
      buzz(18);
    },
    shutter() {
      beep(1180, 1180, 0.06);
      buzz([12, 40, 24]);
    },
    reset() {
      lastCode = null;
      lastAt = 0;
    },
    close() {
      try {
        speech?.cancel();
      } catch {
        // As above.
      }
      try {
        void audio?.close();
      } catch {
        // As above.
      }
    },
  };
}

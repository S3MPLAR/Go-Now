(() => {
  const BUILTINS = new Set(['soft', 'pixel', 'bell', 'pulse', 'chime', 'click']);
  const BUILTIN_GAIN_BOOST = 1.3;
  let token = 0;
  let context = null;
  let sources = [];
  let closeTimer = null;

  function stop() {
    token += 1;
    clearTimeout(closeTimer);
    closeTimer = null;
    for (const source of sources) {
      try {
        source.stop();
      } catch (err) {
        // ignore
      }
    }
    sources = [];
    if (context) {
      const current = context;
      context = null;
      try {
        current.close();
      } catch (err) {
        // ignore
      }
    }
  }

  function tone(target, output, start, duration, frequency, type, gain) {
    const osc = target.createOscillator();
    const envelope = target.createGain();
    const level = Math.min(1, gain * BUILTIN_GAIN_BOOST);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(envelope);
    envelope.connect(output);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    sources.push(osc);
  }

  function playBuiltin(id, volume) {
    context = new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
    const master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
    const now = context.currentTime + 0.01;
    let total = 1;
    if (id === 'pixel') {
      [880, 1174.66, 1567.98].forEach((frequency, index) => {
        tone(context, master, now + index * 0.09, 0.08, frequency, 'square', 0.024);
      });
      total = 0.36;
    } else if (id === 'bell') {
      tone(context, master, now, 1.4, 523.25, 'triangle', 0.035);
      tone(context, master, now + 0.01, 1.1, 783.99, 'sine', 0.014);
      tone(context, master, now + 0.02, 0.8, 1046.5, 'sine', 0.008);
      total = 1.55;
    } else if (id === 'pulse') {
      tone(context, master, now, 0.2, 392, 'sine', 0.04);
      tone(context, master, now + 0.17, 0.2, 523.25, 'sine', 0.036);
      total = 0.45;
    } else if (id === 'chime') {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        tone(context, master, now + index * 0.09, 0.5, frequency, 'triangle', 0.022);
      });
      total = 0.85;
    } else if (id === 'click') {
      tone(context, master, now, 0.035, 1900, 'square', 0.02);
      tone(context, master, now + 0.045, 0.03, 1200, 'triangle', 0.012);
      total = 0.12;
    } else {
      tone(context, master, now, 0.95, 659.25, 'sine', 0.0375);
      tone(context, master, now, 0.86, 987.77, 'sine', 0.009);
      tone(context, master, now, 0.7, 1318.51, 'sine', 0.0025);
      total = 1.1;
    }
    closeTimer = setTimeout(stop, (total + 0.2) * 1000);
  }

  function dataUrlToBuffer(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const binary = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  async function playCustom(dataUrl, current, volume) {
    context = new AudioContext();
    if (context.state === 'suspended') await context.resume();
    let buffer;
    try {
      buffer = await context.decodeAudioData(dataUrlToBuffer(dataUrl));
    } catch (err) {
      const failed = context;
      context = null;
      try {
        failed.close();
      } catch (closeErr) {
        // ignore
      }
      throw err;
    }
    if (current !== token) {
      stop();
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    sources.push(source);
    closeTimer = setTimeout(stop, (buffer.duration + 0.2) * 1000);
  }

  async function play(id, customDataUrl, volume = 0.8) {
    const level = Number.isFinite(Number(volume)) ? Math.min(1, Math.max(0, Number(volume))) : 0.8;
    stop();
    const current = token;
    if (customDataUrl) {
      try {
        await playCustom(customDataUrl, current, level);
        return true;
      } catch (err) {
        console.error('[sound] custom failed:', err.message);
        if (current !== token) return false;
        stop();
        playBuiltin('soft', level);
        return false;
      }
    }
    playBuiltin(BUILTINS.has(id) ? id : 'soft', level);
    return true;
  }

  window.ppSound = { play, stop };
})();

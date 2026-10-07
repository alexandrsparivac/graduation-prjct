const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

/** Capture an entire utterance and transcribe it in the lesson language. */
export function createVoiceRecorder({ getToken, getMicrophone = options => navigator.mediaDevices.getUserMedia(options),
  Recorder = globalThis.MediaRecorder, fetchImpl = fetch, maxDurationMs = 30_000,
  permissionTimeoutMs = 15_000, transcriptionTimeoutMs = 50_000 } = {}) {
  return function listen(locale, { onresult, onerror, onend, onstart, onprocessing } = {}) {
    const controller = new AbortController();
    let stream, recorder, timer, recordingStarted = 0, ended = false, processing = false;
    const chunks = [];
    let bytes = 0;
    const closeTracks = () => stream?.getTracks().forEach(track => track.stop());
    const finish = () => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      closeTracks();
      onend?.();
    };
    const fail = error => {
      if (ended) return;
      onerror?.(error.code || ({ NotAllowedError: 'not-allowed', SecurityError: 'not-allowed',
        NotFoundError: 'no-microphone', NotReadableError: 'microphone-busy' }[error.name]) || 'transcription_unavailable');
      cancel();
    };
    function cancel() {
      if (ended) return;
      controller.abort();
      try { if (recorder?.state !== 'inactive') recorder?.stop(); } catch { /* already stopped */ }
      chunks.length = 0;
      finish();
    }
    function stop() {
      if (ended) return;
      if (processing || !recordingStarted) { cancel(); return; }
      clearTimeout(timer);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        timer = setTimeout(() => fail(errorWithCode('recording-error')), 2500);
      }
      catch (error) { fail(error); }
    }
    const errorWithCode = code => Object.assign(new Error(code), { code });
    const signal = controller.signal;
    // Every asynchronous stage is cancellable, including permission dialogs.
    const stage = promise => new Promise((resolve, reject) => {
      const aborted = () => reject(errorWithCode('cancelled'));
      if (signal.aborted) { Promise.resolve(promise).catch(() => {}); return aborted(); }
      signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    });
    async function transcribe() {
      if (ended) return;
      closeTracks();
      clearTimeout(timer);
      processing = true;
      if (Date.now() - recordingStarted < 350 || !bytes) { fail(errorWithCode('no-speech')); return; }
      onprocessing?.();
      timer = setTimeout(() => fail(errorWithCode('transcription_unavailable')), transcriptionTimeoutMs);
      try {
        const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        chunks.length = 0;
        let token = await stage(getToken());
        if (!token) throw errorWithCode('unauthorized');
        const request = () => fetchImpl(`/api/transcription?locale=${encodeURIComponent(locale)}`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': audio.type },
          body: audio, signal
        });
        let response = await stage(request());
        if (response.status === 401) {
          token = await stage(getToken(true));
          if (!token) throw errorWithCode('unauthorized');
          response = await stage(request());
        }
        const result = await stage(response.json());
        if (!response.ok) throw errorWithCode(result.error || 'transcription_unavailable');
        if (typeof result.text !== 'string' || !result.text.trim()) throw errorWithCode('no-speech');
        if (!ended) onresult?.([result.text]);
        finish();
      } catch (error) { if (!ended) fail(error); }
    }
    (async () => {
      timer = setTimeout(() => fail(errorWithCode('permission-timeout')), permissionTimeoutMs);
      try {
        const permission = getMicrophone({ audio: { channelCount: 1, echoCancellation: true,
          noiseSuppression: true, autoGainControl: true }, video: false });
        // A grant after cancellation must not leave a hidden microphone open.
        Promise.resolve(permission).then(late => { if (ended) late.getTracks().forEach(track => track.stop()); }, () => {});
        stream = await stage(permission);
        if (ended) { closeTracks(); return; }
        clearTimeout(timer);
        const mimeType = TYPES.find(type => Recorder.isTypeSupported(type));
        recorder = new Recorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64_000 });
        recorder.ondataavailable = event => {
          if (ended || !event.data?.size) return;
          bytes += event.data.size;
          if (bytes > 4 * 1024 * 1024) { fail(errorWithCode('recording-too-large')); return; }
          chunks.push(event.data);
        };
        recorder.onerror = event => fail(event.error || errorWithCode('recording-error'));
        recorder.onstop = transcribe;
        recorder.start(250);
        recordingStarted = Date.now();
        timer = setTimeout(stop, maxDurationMs);
        onstart?.();
      } catch (error) { if (!ended) fail(error); }
    })();
    return { stop, abort: cancel };
  };
}

// Binary units: 2 GiB, shown as 2 GB in the interface.
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
export function checkAudioSize(bytes) {
 if (!Number.isSafeInteger(bytes) || bytes < 0) throw Error('Invalid audio file size.');
 if (bytes > MAX_AUDIO_BYTES) throw Error('Please split files larger than 2 GB before importing.');
}

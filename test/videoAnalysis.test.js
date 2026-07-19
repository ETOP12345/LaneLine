const test = require('node:test');
const assert = require('node:assert/strict');
const { selectFrames, validateVideoMetadata, validateUploadedVideo } = require('../videoAnalysis');

test('selectFrames chooses 30 frames across a 30 second competitive clip', () => {
  const frames = Array.from({ length: 180 }, (_, index) => ({ path: `frame_${index}.jpg`, timestampSeconds: index / 6 }));
  const selected = selectFrames(frames, 30, 30);
  assert.equal(selected.length, 30);
  assert.ok(selected[0].timestampSeconds < 1);
  assert.ok(selected.at(-1).timestampSeconds > 29);
});

test('validateVideoMetadata rejects over-duration clips', () => {
  assert.throws(() => validateVideoMetadata({ durationSeconds: 31, width: 1280, height: 720 }, { maxVideoDurationSeconds: 30, minVideoHeight: 480 }), /30 seconds/);
});

test('validateUploadedVideo accepts mp4 uploads', () => {
  assert.equal(validateUploadedVideo({ filename: 'swim.mp4', contentType: 'video/mp4', data: Buffer.alloc(1024) }, { maxVideoSizeMb: 50 }), '');
});

test('validateUploadedVideo rejects non-video extensions', () => {
  assert.match(validateUploadedVideo({ filename: 'notes.txt', contentType: 'text/plain', data: Buffer.alloc(1024) }, { maxVideoSizeMb: 50 }), /MP4/);
});

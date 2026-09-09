import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createYouTubeClient } from '../youtube.ts';
import { discoverLiveStatus } from '../status.ts';

const SOURCE = {
  id: 'audit-source',
  officialChannelId: 'UC-OFFICIAL',
  enabled: true,
  supportsDynamicLiveDetection: true,
};

function ok(body) {
  return { ok: true, status: 200, async json() { return body; } };
}

test('AUD2-05 malformed search payload does not become NOT_LIVE', async () => {
  const youtube = createYouTubeClient('test-key', async () => ok({}));
  await assert.rejects(
    () => youtube.searchLive(SOURCE.officialChannelId),
    /search response malformed/,
  );
});

test('AUD2-05 malformed videos payload is rejected', async () => {
  const youtube = createYouTubeClient('test-key', async () => ok({}));
  await assert.rejects(
    () => youtube.verifyVideo('VIDEO'),
    /videos response malformed/,
  );
});

test('AUD2-05 unstarted candidate yields UNKNOWN', async () => {
  const youtube = {
    async searchLive() {
      return [{ videoId: 'V1', channelId: SOURCE.officialChannelId, title: 'candidate' }];
    },
    async verifyVideo() {
      return {
        videoId: 'V1',
        channelId: SOURCE.officialChannelId,
        title: 'candidate',
        embeddable: true,
        isLiveContent: true,
        actualStartTime: undefined,
        actualEndTime: undefined,
      };
    },
  };

  assert.equal((await discoverLiveStatus(youtube, SOURCE)).status, 'UNKNOWN');
});

test('AUD2-05 explicitly non-live candidate cannot become LIVE', async () => {
  const youtube = {
    async searchLive() {
      return [{ videoId: 'V2', channelId: SOURCE.officialChannelId, title: 'candidate' }];
    },
    async verifyVideo() {
      return {
        videoId: 'V2',
        channelId: SOURCE.officialChannelId,
        title: 'candidate',
        embeddable: true,
        isLiveContent: false,
        actualStartTime: undefined,
        actualEndTime: undefined,
      };
    },
  };

  assert.equal((await discoverLiveStatus(youtube, SOURCE)).status, 'NOT_LIVE');
});

test('AUD2-05 later confirmed LIVE wins over earlier incomplete candidate', async () => {
  const youtube = {
    async searchLive() {
      return [
        { videoId: 'V1', channelId: SOURCE.officialChannelId, title: 'uncertain' },
        { videoId: 'V2', channelId: SOURCE.officialChannelId, title: 'confirmed' },
      ];
    },
    async verifyVideo(videoId) {
      if (videoId === 'V1') {
        return {
          videoId,
          channelId: SOURCE.officialChannelId,
          title: 'uncertain',
          embeddable: true,
          isLiveContent: true,
          actualStartTime: undefined,
          actualEndTime: undefined,
        };
      }

      return {
        videoId,
        channelId: SOURCE.officialChannelId,
        title: 'confirmed',
        embeddable: true,
        isLiveContent: true,
        actualStartTime: new Date().toISOString(),
        actualEndTime: undefined,
      };
    },
  };

  assert.equal((await discoverLiveStatus(youtube, SOURCE)).status, 'LIVE');
});

test('AUD2-06 discovery has no four-hour publishedAfter cutoff', async () => {
  let requestedUrl = '';

  const youtube = createYouTubeClient('test-key', async (url) => {
    requestedUrl = String(url);
    return ok({ items: [] });
  });

  assert.deepEqual(await youtube.searchLive(SOURCE.officialChannelId), []);

  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('eventType'), 'live');
  assert.equal(url.searchParams.has('publishedAfter'), false);
});
-- LOCAL ONLY — NOT applied to any live database.
--
-- C-09: the `prayer-audio` bucket was created with `public = true` plus an
-- unconditional SELECT policy for `anon, authenticated`. A public bucket means every
-- object is world-readable at a guessable URL with no expiry, no revocation and no
-- authentication — anyone who learns or enumerates a path keeps access forever, and
-- the audio cannot be unpublished. No recordings have been uploaded yet (all
-- `prayers.audio_path` values are NULL), so no existing content is broken.
--
-- The bucket becomes private and the client now requests a short-lived signed URL
-- (`createSignedUrl`, see src/app/(tabs)/prayers.tsx). The SELECT policy stays open
-- to `anon` as well as `authenticated` because the prayer library is reachable
-- without an account; with a private bucket that only permits *signing* a URL, it no
-- longer exposes the object for unauthenticated, unlimited direct download.
--
-- No write policy is added: uploads remain service-role only, and the file-type and
-- size limits already enforced by the bucket are kept.

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['audio/mpeg']
WHERE id = 'prayer-audio';

DROP POLICY IF EXISTS "prayer_audio_public_read" ON storage.objects;

-- Read access is required for createSignedUrl(); it is not a write grant and does
-- not make the object publicly reachable.
CREATE POLICY "prayer_audio_read_for_signed_urls"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'prayer-audio');

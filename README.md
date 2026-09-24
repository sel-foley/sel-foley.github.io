# SelFoley: Text-Guided Selective Video-to-Audio Generation via Conditional Source-Isolation States

Project page for an anonymous ICLR 2027 submission → **https://sel-foley.github.io/**

## Abstract

Text-guided selective video-to-audio generation is important because users often want one specific
sound, rather than every sound visible in a video. However, progress has been limited by the lack of
clean multitrack data, and previous approaches such as SelVA rely on automatically constructed, noisy
supervision. We address this limitation with a human-curated 3.3K multitrack dataset containing
videos, isolated source stems, and source-level captions. More importantly, we rethink selective V2A
as an audio-conditioned V2A problem. Instead of training a text-only model to learn every possible
sound, we exploit pretrained AC-V2A models that already transfer an audio reference into a video. By
probing their conditioning pathways, we find that source selection is strongly controlled by the
semantic representation of the reference audio: a clean reference can suppress unrelated visible
events, not merely transfer timbre. Based on this finding, we propose CSIO, which converts a text
query into the source-selective reference representation normally obtained from audio. This allows a
frozen AC-V2A model to perform text-guided selective generation without massive end-to-end training,
combining text-based source selection with the strong synchronization and acoustic rendering ability
of pretrained AC-V2A models.

## Pages

- **Overview** (`index.html`) — the finding about conditioning pathways and how CSIO uses it
- **Dataset** (`dataset.html`) — SelFoley3.3K, with 30 example clips: video, original mix, and each isolated stem with its caption and active intervals
- **Results** (`results.html`) — SelVA and SelFoley on 15 videos from the human evaluation, next to the human-curated target stem

Pressing a lane plays it with that row's video from the beginning; one lane plays at a time.

## Notes

Plain HTML, CSS and JavaScript, no build step. Serve with any static server that supports HTTP range
requests (`npx serve .`); `python3 -m http.server` does not, so seeking will not work.

Clips come from publicly available video collections (VGGSound, FoleyBench, UnAV-100) and are shown
for research purposes only. The dataset, captions and evaluation protocol are released after review.

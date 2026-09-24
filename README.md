# SelFoley: Turning Audio-Conditioned Video-to-Audio Models into Text-Guided Source Selectors

Project page for an anonymous ICLR 2027 submission → **https://sel-foley.github.io/**

## Abstract

Text-guided selective video-to-audio (V2A) asks a model to render only a requested sound from a
silent video containing several plausible sources. Existing approaches train selection and
generation together, but clean source-level supervision is scarce. We instead study audio-
conditioned V2A (AC-V2A), which generates a soundtrack while following a reference sound.
ControlFoley, an open-weight AC-V2A model, processes reference content and timbre through separate
pathways. Controlled interventions show that its content pathway determines which visible source is
rendered and which alternatives are suppressed. We convert this audio interface into a text
interface with the Clean Source Isolation Operator (CSIO), a 1.31-million-parameter adapter that
predicts the source-content condition while freezing the generator. We train it on StemFoley-3.3K,
containing 3,357 clips and 5,383 human-audited source stems with captions. On the fixed 50-clip test
set, the resulting SelFoley system selects the requested source over every verified same-scene
alternative in 78.76% of cases, versus 51.33% for SelVA; LAION-CLAP confirms this ordering (79.65%
vs. 47.79%). SelFoley also reduces VGGish Fréchet distance (4.71 vs. 25.65) and Synchformer
alignment error (0.384 vs. 0.413), while listeners report substantially stronger non-target
suppression. Separate adapters further improve target selection within ControlFoley, AC-Foley, and
Video-Foley by 7.4–23.6 points. Selective V2A can therefore reuse source-selection interfaces
already present in audio-conditioned generators rather than relearning separation end to end.

## Pages

- **Overview** (`index.html`) — the finding about conditioning pathways and how CSIO uses it
- **Dataset** (`dataset.html`) — StemFoley-3.3K, with 40 example clips: video, original mix, and each isolated stem with its caption
- **Results** (`results.html`) — SelVA and SelFoley on 15 videos from the human evaluation, next to the human-curated target stem

Pressing a lane plays it with that row's video from the beginning; one lane plays at a time.

## Notes

Plain HTML, CSS and JavaScript, no build step. Serve with any static server that supports HTTP range
requests (`npx serve .`); `python3 -m http.server` does not, so seeking will not work.

Clips come from publicly available video collections (VGGSound, FoleyBench, UnAV-100) and are shown
for research purposes only. The SelFoley checkpoint, evaluation code and StemFoley-3.3K are released upon acceptance,
under the applicable source licenses.

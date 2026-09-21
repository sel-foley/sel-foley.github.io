# SelFoley — project page

Project page for an anonymous ICLR 2027 submission:
**SelFoley: Text-Guided Selective Video-to-Audio Generation via Conditional Source-Isolation States**.

Live page: https://sel-foley.github.io/

| page | contents |
|---|---|
| `index.html` | abstract, the conditioning-pathway finding, and how CSIO turns a text query into the source-selective reference representation |
| `dataset.html` | SelFoley3.3K statistics, how it was built, and 30 example clips with their original mix and isolated stems |
| `results.html` | systems compared on identical video–caption rows; model outputs are added as the evaluation is finalised |

Plain HTML, CSS and JavaScript, no build step and no dependencies. Audio plays through the Web Audio
API so that every lane shares one clock with the video: pressing a lane starts that row's video from
the beginning, and only one lane plays at a time. Clips can be opened in an expanded view.

## Examples on the dataset page

Each card is one clip: the video, the original mix, and one isolated stem per source. Every stem
carries its caption and the intervals where that source is active, drawn as shaded bands on the
waveform. Stems are a subset of the mix rather than a decomposition of it, so background sound that
belongs to no annotated source stays in the original mix only.

## Running it locally

Any static server works, but seeking inside the videos needs HTTP range requests:

```bash
npx serve .          # supports ranges
```

`python3 -m http.server` does not answer range requests, so clicking a waveform will jump to 0.

## Data and licensing

Clips are drawn from publicly available video collections (VGGSound, FoleyBench, UnAV-100) and are
shown here for research purposes only. The full dataset, captions, active intervals and the
evaluation protocol are released after the review period.

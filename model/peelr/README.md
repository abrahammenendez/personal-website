# model/peelr

The Python that produces the two things `src/lab/peelr/` cannot produce for itself: the
ONNX model served from R2, and the golden-master fixtures its tests assert against.

Nothing here runs in CI or during a build. It is run by hand, rarely, and its outputs
are what get committed or uploaded. The `.onnx` files it writes are gitignored, since
the smallest is 86 MB.

## The pipeline

| Step | Script | Produces |
| --- | --- | --- |
| 1 | `export_onnx.py` | `htdemucs_split_fp32.onnx`, the network alone |
| 2 | `to_fp16_weights.py` | `htdemucs_split_fp16_weights.onnx`, **the shipped model** |
| 3 | `parity.py` | correlation and SNR for each of them against PyTorch |

Step 1 splits `HTDemucs.forward` so the graph is only the network: STFT, iSTFT and both
normalisations move to the host. That is not a stylistic choice. Leaving the
normalisation in puts 2,752,512 elements through a float16 cast, which overflows fp16's
65504 ceiling and turns the whole output to NaN.

Step 2 stores each initializer over 128 elements as fp16 with a `Cast` back to float in
front of its consumers, so the download halves and the arithmetic stays fp32.
`to_fp16_graph.py` is the alternative that converts the arithmetic too. It is kept
because it is the record of a rejected approach, and it must not be shipped: ONNX
Runtime's WebGPU backend miscomputes this model's Conv1d time branch in fp16, measuring
1.18 dB SNR against Python Demucs on drums where the shipped model measures 26.93.

## Checking the browser against Python

| Script | Answers |
| --- | --- |
| `ts_replica.py` | Is a disagreement in our host code or in the runtime? |
| `reference_run.py` | What does real Demucs produce for this track? |

`ts_replica.py` is `pipeline.ts` translated line for line. If it agrees with Demucs and
the browser does not, the host code is right and the execution provider is not.

`reference_run.py` writes the input and four reference stems as float32 WAVs. It defaults to
`eval/` here, which is gitignored; do not point it into `public/`, or a later build
copies the audio into `dist`.

## Fixtures

| Script | Writes |
| --- | --- |
| `make_fixtures.py` | `../../src/lab/peelr/__fixtures__/reference.json`, for `fft.test.ts` |
| `seg_fixtures.py` | `../../src/lab/peelr/__fixtures__/segments.json`, for `segments.test.ts` |

Both write straight into the repository, so run `npm run check` afterwards to reformat
the JSON. Both define their input signal by formula rather than committing it, and each
formula is mirrored in the test that consumes it.

Neither commits whole tensors. The frequency output alone would be 44 MB at fp32, so
they store head and tail slices plus whole-buffer statistics. The tests compare both,
because slices alone leave the middle of a 343,980-sample buffer unchecked.

## Running it

Requires the pretrained checkpoint, which `demucs` downloads on first use, and about
2 GB of PyTorch. Verified on Python 3.9.6.

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python export_onnx.py
python to_fp16_weights.py
python parity.py
```

## Publishing a new model

The object key carries the model's content hash, so a new export is a new URL and no
client can be served a stale one. Three things have to agree: the file, the R2 key, and
`MODEL_VERSION` in `src/lab/peelr/constants.ts`.

```sh
shasum -a 256 htdemucs_split_fp16_weights.onnx | cut -c1-8
```

Set `MODEL_VERSION` to that, then upload to the key it implies:

```sh
npx wrangler r2 object put personal-website-models/peelr/htdemucs-split-<hash>.onnx --file htdemucs_split_fp16_weights.onnx --remote
```

## Licence

The weights are Demucs', MIT licensed, and this site redistributes them, so
`LICENSE-demucs` travels with them and `/lab/peelr` carries the notice on the page.
Everything in this directory is written against
[adefossez/demucs](https://github.com/adefossez/demucs) read directly, rather than
against any browser port of it.

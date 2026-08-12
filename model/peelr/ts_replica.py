"""Literal translation of `pipeline.ts` separateSegment, to localise a divergence.

When the browser's output disagrees with Demucs, the fault is either in the host code
or in the runtime. Running the same host steps in Python against the same ONNX file
answers which: if this agrees with Demucs and the browser does not, the host code is
right and the difference is the execution provider.
"""
import argparse

import numpy as np
import onnxruntime as ort
import torch
import torchaudio
from demucs.pretrained import get_model

SAMPLE_RATE = 44100
BINS, FRAMES = 2048, 336

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("track", help="audio file to separate")
parser.add_argument("--model", default="htdemucs_split_fp16_weights.onnx")
parser.add_argument("--start", type=int, default=10, help="seconds into the track")
args = parser.parse_args()

sub = get_model("htdemucs").models[0].eval()
L = int(sub.segment * sub.samplerate)

wav, sr = torchaudio.load(args.track)
wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE)
wav = wav[:, SAMPLE_RATE * args.start : SAMPLE_RATE * args.start + L]
mix = wav[None]

with torch.no_grad():
    reference = sub(mix)[0]          # what Demucs itself produces
    mag = sub._magnitude(sub._spec(mix))     # [1, 4, 2048, 336]

# The host code from pipeline.ts, step for step.
spec_norm = mag.numpy().copy().reshape(-1)
mix_norm = np.concatenate([mix[0, 0].numpy(), mix[0, 1].numpy()])


def moments(a):                       # segments.ts moments(): unbiased, like torch.std
    return a.mean(), a.std(ddof=1)


sm, ss = moments(spec_norm)
mm, ms = moments(mix_norm)
spec_norm = (spec_norm - sm) / (1e-5 + ss)
mix_norm = (mix_norm - mm) / (1e-5 + ms)

session = ort.InferenceSession(args.model, providers=["CPUExecutionProvider"])
freq, time = session.run(None, {
    "spec_norm": spec_norm.reshape(1, 4, BINS, FRAMES).astype(np.float32),
    "mix_norm": mix_norm.reshape(1, 2, L).astype(np.float32),
})

freq = freq.reshape(-1) * (1e-5 + ss) + sm     # denormaliseInPlace
time = time.reshape(-1) * (1e-5 + ms) + mm

# readSpecChannel + demucsIspec + add the time branch, exactly as pipeline.ts does.
stride = BINS * FRAMES
out = np.zeros((4, 2, L), dtype=np.float32)
for stem in range(4):
    for ch in range(2):
        rb = stem * 4 * stride + ch * 2 * stride
        re = freq[rb : rb + stride].reshape(BINS, FRAMES)
        im = freq[rb + stride : rb + 2 * stride].reshape(BINS, FRAMES)
        z = torch.from_numpy(re + 1j * im)[None, None]
        out[stem, ch] = sub._ispec(z, L)[0, 0].numpy()
        out[stem, ch] += time[stem * 2 * L + ch * L : stem * 2 * L + (ch + 1) * L]

print(f"{'stem':8s} {'SNR vs Demucs':>14s}")
for i, name in enumerate(sub.sources):
    r = reference[i].numpy()
    e = out[i] - r
    print(f"{name:8s} {10 * np.log10((r ** 2).sum() / max((e ** 2).sum(), 1e-30)):14.2f} dB")

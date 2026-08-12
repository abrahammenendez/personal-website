"""Separate a track with real Python Demucs, to compare the browser's stems against.

Writes the input and the four reference stems as 32-bit float WAVs, in the same
container `wav.ts` writes, so neither side decodes anything differently.
"""
import argparse
import os
import struct

import numpy as np
import torch
import torchaudio
from demucs.apply import apply_model
from demucs.pretrained import get_model

SAMPLE_RATE = 44100

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("track", help="audio file to separate")
parser.add_argument("--out", default="eval", help="directory for the WAVs")
parser.add_argument("--start", type=int, default=40, help="seconds into the track")
parser.add_argument("--seconds", type=int, default=10, help="length to separate")
args = parser.parse_args()


def write_float_wav(path, stereo, rate=SAMPLE_RATE):
    """32-bit float WAV: an 18-byte fmt chunk carrying cbSize, plus a fact chunk."""
    data = np.stack([stereo[0].numpy(), stereo[1].numpy()], axis=1).astype("<f4").tobytes()
    frames = stereo.shape[-1]
    header = b"".join([
        b"RIFF", struct.pack("<I", 4 + 26 + 12 + 8 + len(data)), b"WAVE",
        b"fmt ", struct.pack("<IHHIIHHH", 18, 3, 2, rate, rate * 8, 8, 32, 0),
        b"fact", struct.pack("<II", 4, frames),
        b"data", struct.pack("<I", len(data)),
    ])
    open(path, "wb").write(header + data)


os.makedirs(args.out, exist_ok=True)

wav, sr = torchaudio.load(args.track)
if sr != SAMPLE_RATE:
    wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE)
wav = wav[:, SAMPLE_RATE * args.start : SAMPLE_RATE * (args.start + args.seconds)].contiguous()
print("input:", tuple(wav.shape), f"{SAMPLE_RATE} Hz,", wav.shape[-1] / SAMPLE_RATE, "s")

# The exact bytes the browser will separate, so neither side decodes differently.
write_float_wav(f"{args.out}/input.wav", wav)

sub = get_model("htdemucs").models[0].eval()

with torch.no_grad():
    # Match what peelr does: no shift trick, Demucs' default overlap and window.
    out = apply_model(sub, wav[None], shifts=0, split=True, overlap=0.25,
                      transition_power=1.0, progress=False, device="cpu")[0]

for name, stem in zip(sub.sources, out):
    write_float_wav(f"{args.out}/{name}.wav", stem)
    print(f"  {name}: peak {stem.abs().max():.4f}  rms {stem.pow(2).mean().sqrt():.5f}")
print("written to", args.out)

"""Capture Demucs' real segmentation behaviour using a stub model.

A stub lets `apply_model` run its own splitting, weighting and overlap-add without
paying for htdemucs, so the fixtures describe Demucs' logic rather than a copy of it.
`signal()` is mirrored in `segments.test.ts`.
"""
import json
import math
from fractions import Fraction

import numpy as np
import torch
import torch.nn as nn
from demucs.apply import apply_model

SR = 44100
SEG = 343980
OUT = "../../src/lab/peelr/__fixtures__/segments.json"


class Stub(nn.Module):
    """Returns each source as a fixed, source-dependent transform of the input, so the
    overlap-add maths is observable and every source is distinguishable."""

    def __init__(self):
        super().__init__()
        self.sources = ["drums", "bass", "other", "vocals"]
        self.samplerate = SR
        self.audio_channels = 2
        self.segment = Fraction(39, 5)
        self.use_train_segment = False
        self._p = nn.Parameter(torch.zeros(1))

    def forward(self, mix):
        return torch.stack([mix * (i + 1) for i in range(4)], dim=1)


def signal(n):
    i = np.arange(n, dtype=np.float64)
    x = 0.5 * np.sin(2 * math.pi * 440 * i / SR) + 0.2 * np.sin(2 * math.pi * 97 * i / SR)
    return x.astype(np.float32)


# Deliberately not a multiple of the stride, so the ragged tail chunk is exercised.
N = SEG * 2 + 51234
mix = torch.from_numpy(np.stack([signal(N), signal(N) * 0.7]))

out = apply_model(Stub().eval(), mix[None], shifts=0, split=True, overlap=0.25,
                  transition_power=1.0, progress=False, device="cpu")[0]

stride = int((1 - 0.25) * SEG)
offsets = list(range(0, N, stride))
w = torch.cat([torch.arange(1, SEG // 2 + 1), torch.arange(SEG - SEG // 2, 0, -1)])
w = (w / w.max()) ** 1.0

# `drums` is mix * 1, so a correct overlap-add returns the input exactly.
drums = out[0, 0].numpy()
err = np.abs(drums - mix[0].numpy())

fx = {
  "meta": {"segment": SEG, "stride": stride, "overlap": 0.25, "transitionPower": 1.0,
           "totalSamples": N, "numSegments": len(offsets)},
  "offsets": offsets,
  "weight": {"len": int(w.numel()), "max": float(w.max()), "argmax": int(w.argmax()),
             "head": [float(v) for v in w[:8]], "tail": [float(v) for v in w[-8:]],
             "mid": [float(v) for v in w[SEG // 2 - 2: SEG // 2 + 2]]},
  "identityReconstruction": {"maxAbsErr": float(err.max()),
                             "head": [float(v) for v in drums[:64]],
                             "tail": [float(v) for v in drums[-64:]]},
  "sourceScaling": [float(out[i, 0].abs().max()) for i in range(4)],
  "moments": {
    "note": "torch.std defaults to the unbiased estimator (n-1). Dividing by n instead "
            "shifts every normalised value, and the model was trained on the n-1 version.",
    "mean": float(mix.mean()),
    "stdUnbiased": float(mix.std()),
    "stdBiased": float(mix.std(unbiased=False)),
    "count": int(mix.numel()),
    "head": [float(v) for v in mix[0][:32]],
  },
}
open(OUT, "w").write(json.dumps(fx, indent=1))
print("segments:", len(offsets), "offsets, stride", stride)
print("weight: max", float(w.max()), "at", int(w.argmax()), "| first", float(w[0]), "last", float(w[-1]))
print("identity reconstruction max abs err:", float(err.max()))
print("per-source absmax (should be 1x,2x,3x,4x):", fx["sourceScaling"])

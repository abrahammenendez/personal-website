"""Generate golden-master fixtures for the TypeScript STFT/iSTFT.

The input signal is defined by formula so TypeScript can regenerate it bit for bit.
Only the reference OUTPUTS are stored, and only slices plus statistics, to keep the
committed file small. `signal()` is mirrored in `fft.test.ts`.
"""
import json
import math
import os

import numpy as np
import torch
from demucs.pretrained import get_model

SR, NFFT, HOP = 44100, 4096, 1024
N = 343980
OUT = "../../src/lab/peelr/__fixtures__/reference.json"


def signal(ch: int, n: int = N) -> np.ndarray:
    """Deterministic broadband test signal. Mirrored exactly in TypeScript."""
    i = np.arange(n, dtype=np.float64)
    if ch == 0:
        x = (0.50 * np.sin(2 * math.pi * 440.0 * i / SR)
             + 0.25 * np.sin(2 * math.pi * 1000.0 * i / SR)
             + 0.10 * np.sin(2 * math.pi * 7000.0 * i / SR + 1.0))
    else:
        x = (0.40 * np.sin(2 * math.pi * 220.0 * i / SR + 0.5)
             + 0.30 * np.sin(2 * math.pi * 3000.0 * i / SR))
    # linear chirp for broadband content, and a transient to exercise time resolution
    x = x + 0.20 * np.sin(2 * math.pi * (100.0 + 5000.0 * i / n) * i / SR)
    x[10000:10010] += 0.8
    return x.astype(np.float32)


def stats(a: np.ndarray) -> dict:
    a = np.asarray(a, dtype=np.float64).ravel()
    return {"len": int(a.size), "mean": float(a.mean()), "std": float(a.std()),
            "absmax": float(np.abs(a).max()), "sum": float(a.sum())}


def slices(a: np.ndarray, k: int = 256) -> dict:
    a = np.asarray(a, dtype=np.float64).ravel()
    return {"head": [float(v) for v in a[:k]], "tail": [float(v) for v in a[-k:]]}


mix = torch.from_numpy(np.stack([signal(0), signal(1)]))[None]  # [1, 2, N]
sub = get_model("htdemucs").models[0].eval()

with torch.no_grad():
    z = sub._spec(mix)                    # complex [1, 2, 2048, 336]
    spec = sub._magnitude(z)              # real    [1, 2*2, 2048, 336]
    back = sub._ispec(z, N)               # [1, 2, N]

zr, zi = z.real.numpy(), z.imag.numpy()
fx = {
    "meta": {"sampleRate": SR, "nFft": NFFT, "hop": HOP, "segment": N,
             "specPad": HOP // 2 * 3, "frames": int(z.shape[-1]), "bins": int(z.shape[-2]),
             "note": "torch.stft(normalized=True) divides by sqrt(nFft); center=True "
                     "reflect-pads by nFft/2 on top of Demucs' own reflect pad"},
    "signal": {"ch0": stats(signal(0)) | slices(signal(0)),
               "ch1": stats(signal(1)) | slices(signal(1))},
    "spec": {"shape": list(z.shape),
             "real": stats(zr) | slices(zr[0, 0]),
             "imag": stats(zi) | slices(zi[0, 0])},
    "magnitudeCac": {"shape": list(spec.shape), **stats(spec.numpy())},
    "ispec": {"shape": list(back.shape),
              "ch0": stats(back[0, 0].numpy()) | slices(back[0, 0].numpy()),
              "roundTripMaxAbsErr": float((back - mix).abs().max())},
}
open(OUT, "w").write(json.dumps(fx, indent=1))
print(f"{OUT}: {os.path.getsize(OUT)/1024:.0f} KB")
print("spec shape:", tuple(z.shape), "| ispec round-trip max err:", fx["ispec"]["roundTripMaxAbsErr"])
print("spec.real absmax:", fx["spec"]["real"]["absmax"], "| std:", round(fx["spec"]["real"]["std"], 6))

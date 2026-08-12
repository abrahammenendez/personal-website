"""Compare each exported ONNX model against PyTorch, end to end through mask and iSTFT.

Per-tensor comparison hides errors that only matter after reconstruction, so this runs
the full host-side path the browser runs and reports correlation and SNR.
"""
import argparse
import time

import numpy as np
import onnxruntime as ort
import torch
from demucs.pretrained import get_model

from export_onnx import normalise

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("models", nargs="*", default=["htdemucs_split_fp32.onnx",
                                                  "htdemucs_split_fp16_weights.onnx"])
models = parser.parse_args().models

sub = get_model("htdemucs").models[0].eval()
L = int(sub.segment * sub.samplerate)
torch.manual_seed(1234)
mix = torch.randn(1, 2, L)

with torch.no_grad():
    spec = sub._magnitude(sub._spec(mix))
    xin, xtin, mean, std, meant, stdt = normalise(mix, spec)
    ref_full = sub(mix)


def corr(a, b):
    return float(np.corrcoef(a.ravel().astype(np.float64), b.ravel().astype(np.float64))[0, 1])


for name in models:
    session = ort.InferenceSession(name, providers=["CPUExecutionProvider"])
    started = time.time()
    of, ot = session.run(None, {"spec_norm": xin.numpy(), "mix_norm": xtin.numpy()})
    elapsed = time.time() - started

    fx = torch.from_numpy(of).float() * std[:, None] + mean[:, None]
    ftm = torch.from_numpy(ot).float() * stdt[:, None] + meant[:, None]
    rebuilt = ftm + sub._ispec(sub._mask(sub._spec(mix), fx), L)

    r, R = rebuilt.numpy(), ref_full.numpy()
    err = r - R
    snr = 10 * np.log10((R ** 2).sum() / max((err ** 2).sum(), 1e-30))
    print(f"{name}: corr={corr(r, R):.8f}  max_abs={np.abs(err).max():.2e}  "
          f"SNR={snr:.1f} dB  segment={elapsed:.2f}s")

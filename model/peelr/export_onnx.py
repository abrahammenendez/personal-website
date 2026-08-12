"""Export htdemucs as the network only: STFT and iSTFT stay on the host.

Step 1 of 3. `to_fp16_weights.py` then halves the download and `parity.py` checks the
result against PyTorch. README.md has the order and the reasoning.
"""
import torch
import torch.nn as nn
from demucs.pretrained import get_model
from einops import rearrange

OUT = "htdemucs_split_fp32.onnx"


class SplitHTDemucs(nn.Module):
    """Runs HTDemucs.forward up to, but not including, `x = xt + x`.

    Returns the denormalised frequency and time branches so the host can do
    _mask (a reshape, since cac=True) and _ispec itself.
    """

    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, x, xt):
        """Inputs are ALREADY normalised; outputs are NOT denormalised.

        The mean/std maths is deliberately outside the graph. Keeping it in makes fp16
        conversion impossible: the element count 1*4*2048*336 = 2752512 reaches a
        float32->float16 cast, overflows fp16's 65504 ceiling, and the whole graph
        becomes NaN. The host does both normalisations instead; they are four lines.
        """
        m = self.m
        B = x.shape[0]
        Fq, T = x.shape[-2], x.shape[-1]

        saved, saved_t, lengths, lengths_t = [], [], [], []
        for idx, encode in enumerate(m.encoder):
            lengths.append(x.shape[-1])
            inject = None
            if idx < len(m.tencoder):
                lengths_t.append(xt.shape[-1])
                tenc = m.tencoder[idx]
                xt = tenc(xt)
                if not tenc.empty:
                    saved_t.append(xt)
                else:
                    inject = xt
            x = encode(x, inject)
            if idx == 0 and m.freq_emb is not None:
                frs = torch.arange(x.shape[-2], device=x.device)
                emb = m.freq_emb(frs).t()[None, :, :, None].expand_as(x)
                x = x + m.freq_emb_scale * emb
            saved.append(x)

        if m.crosstransformer:
            if m.bottom_channels:
                b, c, f, t = x.shape
                x = rearrange(x, "b c f t-> b c (f t)")
                x = m.channel_upsampler(x)
                x = rearrange(x, "b c (f t)-> b c f t", f=f)
                xt = m.channel_upsampler_t(xt)

            x, xt = m.crosstransformer(x, xt)

            if m.bottom_channels:
                x = rearrange(x, "b c f t-> b c (f t)")
                x = m.channel_downsampler(x)
                x = rearrange(x, "b c (f t)-> b c f t", f=f)
                xt = m.channel_downsampler_t(xt)

        for idx, decode in enumerate(m.decoder):
            skip = saved.pop(-1)
            x, pre = decode(x, skip, lengths.pop(-1))
            offset = m.depth - len(m.tdecoder)
            if idx >= offset:
                tdec = m.tdecoder[idx - offset]
                length_t = lengths_t.pop(-1)
                if tdec.empty:
                    pre = pre[:, :, 0]
                    xt, _ = tdec(pre, None, length_t)
                else:
                    xt, _ = tdec(xt, saved_t.pop(-1), length_t)

        S = len(m.sources)
        x = x.view(B, S, -1, Fq, T)
        xt = xt.view(B, S, -1, xt.shape[-1])
        return x, xt


def normalise(mix, spec):
    mean = spec.mean(dim=(1, 2, 3), keepdim=True)
    std = spec.std(dim=(1, 2, 3), keepdim=True)
    meant = mix.mean(dim=(1, 2), keepdim=True)
    stdt = mix.std(dim=(1, 2), keepdim=True)
    return (spec - mean) / (1e-5 + std), (mix - meant) / (1e-5 + stdt), mean, std, meant, stdt


# Guarded so `parity.py` can import the class and `normalise` without re-exporting.
if __name__ == "__main__":
    sub = get_model("htdemucs").models[0].eval()
    L = int(sub.segment * sub.samplerate)

    mix = torch.randn(1, 2, L)
    net = SplitHTDemucs(sub).eval()

    with torch.no_grad():
        spec = sub._magnitude(sub._spec(mix))
        xin, xtin, mean, std, meant, stdt = normalise(mix, spec)
        fx, ft = net(xin, xtin)
        fx = fx * std[:, None] + mean[:, None]
        ft = ft * stdt[:, None] + meant[:, None]
        print("split outputs:", tuple(fx.shape), tuple(ft.shape))

        # The split has to be exact before any fp16 question arises.
        ref = sub(mix)
        rebuilt = ft + sub._ispec(sub._mask(sub._spec(mix), fx), L)
        err = (ref - rebuilt).abs().max().item()
        corr = torch.corrcoef(torch.stack([ref.flatten(), rebuilt.flatten()]))[0, 1].item()
        print(f"vs full forward: max_abs_diff={err:.3e}  corr={corr:.8f}")

    torch.onnx.export(
        net, (xin, xtin), OUT,
        input_names=["spec_norm", "mix_norm"], output_names=["freq", "time"],
        opset_version=17, dynamo=False,
    )
    print(f"exported {OUT}")

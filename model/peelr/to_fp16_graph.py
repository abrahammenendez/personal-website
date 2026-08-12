"""Convert the whole graph to fp16, arithmetic included.

Do not ship this. It is the same size as the weights-only conversion, but ONNX Runtime's
WebGPU backend miscomputes this model's Conv1d time branch in fp16: 1.18 dB SNR against
Python Demucs on drums where `to_fp16_weights.py` measures 26.93.
"""
import os

import onnx
from onnx import TensorProto
from onnxconverter_common import float16

SOURCE = "htdemucs_split_fp32.onnx"
OUT = "htdemucs_split_fp16_graph.onnx"

model = onnx.load(SOURCE)

# Casts that explicitly target FLOAT keep their attribute through conversion while the
# tensor they feed is retyped, so the model refuses to load. Shape maths casting to
# INT64 is unaffected. Found by loading and reading the type error.
blocked = [
    n.name for n in model.graph.node
    if n.op_type == "Cast"
    and any(a.name == "to" and a.i == TensorProto.FLOAT for a in n.attribute)
]
converted = float16.convert_float_to_float16(model, keep_io_types=True, node_block_list=blocked)
onnx.save(converted, OUT)
print(f"blocked {len(blocked)} float-typed Cast nodes")
print(f"{OUT}: {os.path.getsize(OUT) / 1e6:.2f} MB")

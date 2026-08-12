"""Halve the download without touching the arithmetic.

Storing weights as fp16 and casting them back to fp32 at load keeps every operator in
fp32, which matters because ONNX Runtime's WebGPU backend computes this model's Conv1d
time branch incorrectly in fp16. Whole-graph fp16 conversion is what breaks it.
"""
import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

SOURCE = "htdemucs_split_fp32.onnx"
OUT = "htdemucs_split_fp16_weights.onnx"

model = onnx.load(SOURCE)
graph = model.graph

initializers = list(graph.initializer)
converted = 0
casts = []

for tensor in initializers:
    if tensor.data_type != TensorProto.FLOAT:
        continue
    array = numpy_helper.to_array(tensor)
    # Tiny tensors save nothing and adding a node costs more than the bytes.
    if array.size < 128:
        continue
    half = numpy_helper.from_array(array.astype(np.float16), tensor.name + "_fp16")
    graph.initializer.remove(tensor)
    graph.initializer.append(half)
    casts.append(
        helper.make_node("Cast", [half.name], [tensor.name], to=TensorProto.FLOAT,
                         name=f"restore_{tensor.name}")
    )
    converted += 1

# Casts must precede every consumer, and the graph is topologically sorted.
graph.node.extend(casts)
sorted_nodes = casts + [n for n in graph.node if n not in casts]
del graph.node[:]
graph.node.extend(sorted_nodes)

onnx.save(model, OUT, save_as_external_data=False)
for f in (SOURCE, OUT):
    print(f"{f}: {os.path.getsize(f) / 1e6:.2f} MB")
print(f"converted {converted} initializers")

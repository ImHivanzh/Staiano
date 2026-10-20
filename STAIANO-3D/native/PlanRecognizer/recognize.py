"""Raster2Seq inference only: original 2D polygons, no 3D generation or network calls."""
import argparse
import contextlib
import enum
import hashlib
import json
import pathlib
import sys
import types

CHECKPOINT_SHA256 = "f7c0ef9379aa8cf11349da8b2179214e0d495af758383984a2361a1309aab3b7"


def inference_modules(source):
    # Training-only imports require compiled rasterizers; inference uses PyTorch's
    # official deformable-attention reference on either CUDA or CPU.
    datasets = types.ModuleType("datasets")
    datasets.__path__ = [str(source / "datasets")]
    sys.modules["datasets"] = datasets
    tokens = types.ModuleType("datasets.poly_data")
    tokens.TokenType = enum.Enum("TokenType", {"coord": 0, "sep": 1, "eos": 2, "cls": 3})
    sys.modules[tokens.__name__] = tokens
    rasterizer = types.ModuleType("diff_ras.polygon")
    rasterizer.SoftPolygon = None
    sys.modules[rasterizer.__name__] = rasterizer
    from fvcore.common.registry import Registry
    registry = types.ModuleType("detectron2.utils.registry")
    registry.Registry = Registry
    sys.modules[registry.__name__] = registry
    sys.modules["MultiScaleDeformableAttention"] = types.ModuleType("MultiScaleDeformableAttention")
    sys.path.insert(0, str(source))
    from models.ops.functions.ms_deform_attn_func import MSDeformAttnFunction, ms_deform_attn_core_pytorch
    MSDeformAttnFunction.apply = staticmethod(lambda value, shapes, offsets, locations, weights, step: ms_deform_attn_core_pytorch(value, shapes, locations, weights))


def recognize(source, checkpoint, image_file):
    import cv2
    import numpy as np
    import torch
    import torchvision
    from PIL import Image
    torch.set_num_threads(4)
    with checkpoint.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != CHECKPOINT_SHA256:
            raise ValueError("Checkpoint Raster2Seq non valido.")
    inference_modules(source)
    # The checkpoint already supplies the backbone; never fetch ImageNet weights.
    resnet = torchvision.models.resnet50
    def backbone(**kwargs):
        kwargs.pop("pretrained", None)
        return resnet(weights=None, **kwargs)
    torchvision.models.resnet50 = backbone
    from datasets.discrete_tokenizer import DiscreteTokenizer
    from models import build_model
    with torch.serialization.safe_globals([argparse.Namespace]):
        saved = torch.load(checkpoint, map_location="cpu", weights_only=True, mmap=True)
    args = saved["args"]
    args.device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = DiscreteTokenizer(args.num_bins, args.seq_len, add_cls=args.add_cls_token)
    args.vocab_size = len(tokenizer)
    model = build_model(args, train=False, tokenizer=tokenizer)
    weights = saved.get("ema", saved["model"])
    weights = {key.removeprefix("module."): value for key, value in weights.items() if ".kv_cache." not in key and ".cache." not in key and not key.endswith(("total_params", "total_ops"))}
    model.load_state_dict(weights, strict=True)
    model.to(args.device).eval()
    image = Image.open(image_file)
    if image.width * image.height > 5_000_000:
        raise ValueError("Planimetria troppo grande.")
    rgba = image.convert("RGBA")
    paper = Image.new("RGBA", image.size, "white")
    paper.alpha_composite(rgba)
    rgb = np.array(paper.convert("RGB"))
    height, width = rgb.shape[:2]
    size = args.image_size
    scale = min(size / width, size / height)
    dw, dh = max(1, int(width * scale)), max(1, int(height * scale))
    left, top = (size - dw) // 2, (size - dh) // 2
    canvas = np.full((size, size, 3), 255, dtype=np.uint8)
    canvas[top:top + dh, left:left + dw] = cv2.resize(rgb, (dw, dh), interpolation=cv2.INTER_CUBIC)
    tensor = torch.from_numpy(canvas.transpose(2, 0, 1)).float().div(255).to(args.device)
    with torch.inference_mode():
        output = model.forward_inference([tensor], use_cache=True)
    labels = output["pred_room_logits"][0].softmax(-1)[..., :-1].argmax(-1).cpu().tolist()
    shapes, points, indices = [], [], []
    def finish():
        if len(points) < 2:
            return
        votes = [labels[i] for i in indices if i < len(labels)]
        label = max(set(votes), key=votes.count) if votes else 8
        shapes.append({"label": label, "points": list(points)})
    for index, token in enumerate(output["gen_out"][0]):
        if isinstance(token, int):
            finish(); points, indices = [], []
            if token in (2, -1):
                break
        else:
            x = min(width - 1, max(0, (float(token[0]) * (size - 1) - left) / scale))
            y = min(height - 1, max(0, (float(token[1]) * (size - 1) - top) / scale))
            points.append({"x": x, "y": y}); indices.append(index)
    if points:
        finish()
    return {"width": width, "height": height, "shapes": shapes, "device": args.device}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--checkpoint", type=pathlib.Path, required=True)
    parser.add_argument("--input", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    with contextlib.redirect_stdout(sys.stderr):
        result = recognize(args.source, args.checkpoint, args.input)
    args.output.write_text(json.dumps(result, allow_nan=False), encoding="utf-8")

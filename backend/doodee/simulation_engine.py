import base64
import os


REGION_PARAMETERS = {
    "eyes": {"outer_corner_lift", "eyelid_definition"},
    "nose": {"bridge_height", "tip_projection", "tip_rotation", "alar_width"},
    "lips": {"fullness", "lip_height", "corner_lift"},
    "cheeks": {"projection", "volume"},
    "jaw": {"width", "definition"},
    "chin": {"projection", "height", "width"},
}
REGION_LANDMARKS = {
    "eyes": ((33, 133, 159, 145), (362, 263, 386, 374)),
    "nose": ((168, 193, 417, 98, 327, 2, 1),),
    "lips": ((61, 291, 0, 13, 14, 17),),
    "cheeks": ((116, 50, 187, 205), (345, 280, 411, 425)),
    "jaw": ((234, 172, 152, 397, 454),),
    "chin": ((172, 176, 152, 400, 397),),
}


def validate_parameters(region, parameters):
    allowed = REGION_PARAMETERS.get(region)
    if not allowed:
        raise ValueError("unsupported_region")
    if not parameters or set(parameters) - allowed:
        raise ValueError("invalid_parameters")
    cleaned = {}
    for key, value in parameters.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not -100 <= value <= 100:
            raise ValueError("invalid_parameters")
        cleaned[key] = round(float(value), 2)
    return cleaned


def generate_image(source, content_type, region, parameters):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    prompt = (
        "Create a conservative educational facial morphology preview. Preserve the person's identity, "
        f"expression, lighting, background, hair, skin texture, and every area except {region}. "
        f"Apply only these bounded visual adjustments: {parameters}. This is not a surgical outcome prediction. "
        "Return one photorealistic image with no text."
    )
    response = client.models.generate_content(
        model=os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"),
        contents=[prompt, types.Part.from_bytes(data=source, mime_type=content_type)],
        config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
    )
    for part in response.parts or ():
        if part.inline_data and part.inline_data.data:
            data = part.inline_data.data
            return base64.b64decode(data) if isinstance(data, str) else data
    raise ValueError("provider_no_image")


def constrain_region_and_watermark(source, generated, region):
    import cv2
    import numpy as np

    from .analysis_engine import _landmarks

    original = cv2.imdecode(np.frombuffer(source, np.uint8), cv2.IMREAD_COLOR)
    edited = cv2.imdecode(np.frombuffer(generated, np.uint8), cv2.IMREAD_COLOR)
    if original is None or edited is None:
        raise ValueError("provider_invalid_image")
    edited = cv2.resize(edited, (original.shape[1], original.shape[0]), interpolation=cv2.INTER_LANCZOS4)
    points = _landmarks(original)
    height, width = original.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)
    for group in REGION_LANDMARKS[region]:
        polygon = np.array([(int(points[i, 0] * width), int(points[i, 1] * height)) for i in group], dtype=np.int32)
        cv2.fillConvexPoly(mask, cv2.convexHull(polygon), 255)
    radius = max(9, int(min(width, height) * 0.04))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius, radius))
    mask = cv2.dilate(mask, kernel)
    blur = max(9, radius | 1)
    alpha = cv2.GaussianBlur(mask, (blur, blur), 0).astype(np.float32)[:, :, None] / 255
    output = (edited * alpha + original * (1 - alpha)).astype(np.uint8)
    label = "SIMULATION - NOT A SURGICAL OUTCOME"
    scale = max(0.45, width / 1800)
    thickness = max(1, int(scale * 2))
    (text_width, text_height), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
    x, y = max(12, width - text_width - 18), height - 18
    cv2.rectangle(output, (x - 8, y - text_height - 8), (width - 10, y + 7), (0, 0, 0), -1)
    cv2.putText(output, label, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thickness, cv2.LINE_AA)
    ok, encoded = cv2.imencode(".png", output)
    if not ok:
        raise ValueError("provider_invalid_image")
    return encoded.tobytes()


"""The face rendered as a depth-shaded mesh, ported from p1/doodee3/dd2 (backend/engine.py).

Rendered here rather than in the browser, the way the original does it, because the triangulation is
the picture. Filling each Delaunay triangle separately and shading it by its own mean depth is what
turns a landmark cloud into a surface: a nose bridge comes out bright because it protrudes, the
crease beside it comes out dark because it recedes. A browser port of this needed a Delaunay
implementation of its own, and the first attempt avoided that by filling one convex hull per zone —
which reads as eight coloured stickers laid over a face rather than as a face.

Three details from the original carry the look, and all three are kept:

Depth drives brightness, not colour. Each triangle's shade is ``0.82 + 0.36 * normalised_depth``,
applied to a zone hue that only says which region it belongs to.

Edges blend toward a neutral grey. An edge takes most of its colour from one shared edge tone and
only a hint from the zone, so the mesh reads as a single shaded object instead of eight.

Far triangles are painted first. Without that ordering the nose is drawn behind the cheeks it sits
in front of, and the surface stops making sense.
"""

# Landmark indices per anatomical zone.
ZONES = {
    "forehead": (10, 151, 9, 8, 107, 336, 66, 296, 105, 334, 108, 337, 69, 299, 104, 333, 68, 298,
                 71, 301, 109, 338),
    "temple": (21, 54, 103, 67, 251, 284, 332, 297, 127, 162, 234, 356, 389, 454, 137, 366),
    "eye_brow": (70, 63, 105, 66, 107, 336, 296, 334, 293, 300, 33, 133, 160, 158, 144, 153, 246,
                 362, 263, 385, 387, 373, 380, 466, 173, 398),
    "nose": (168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 97, 326, 327, 129, 358, 45, 275, 44, 274,
             220, 440, 64, 294),
    "cheek": (116, 117, 118, 119, 120, 100, 142, 205, 206, 207, 187, 123, 50, 101, 36, 111,
              345, 346, 347, 348, 349, 329, 371, 425, 426, 427, 411, 352, 280, 330, 266, 340),
    "lips": (61, 291, 0, 17, 13, 14, 78, 308, 81, 311, 178, 402, 37, 267, 39, 269, 84, 314, 181,
             405, 146, 375, 91, 321, 87, 317, 80, 310, 88, 318),
    "jaw": (172, 136, 150, 149, 176, 148, 58, 132, 93, 397, 365, 379, 378, 400, 377, 288, 361, 323),
    "chin": (152, 175, 199, 200, 18, 83, 313, 406, 182, 194, 32, 262, 428, 208, 421, 201),
}

# BGR, as OpenCV wants them and as the original wrote them.
ZONE_COLOURS = {
    "forehead": (255, 176, 46),
    "temple": (232, 118, 255),
    "eye_brow": (86, 220, 255),
    "nose": (108, 255, 148),
    "cheek": (98, 130, 255),
    "lips": (150, 92, 255),
    "jaw": (255, 226, 84),
    "chin": (72, 190, 255),
}

ZONE_LABELS_TH = {
    "forehead": "หน้าผาก", "temple": "ขมับ", "eye_brow": "ตา/คิ้ว", "nose": "จมูก",
    "cheek": "แก้ม", "lips": "ริมฝีปาก", "jaw": "กราม", "chin": "คาง",
}

MESH_BACKDROP = (26, 22, 20)
MESH_EDGE = (168, 158, 148)
UNZONED = (120, 120, 120)


def delaunay(vertices, shape):
    """Triangulate the analysis mesh without depending on the removed simulation engine."""
    import cv2
    import numpy as np

    height, width = shape[:2]
    subdiv = cv2.Subdiv2D((0, 0, width, height))
    lookup = {}
    for index, point in enumerate(vertices):
        key = (int(np.clip(round(float(point[0])), 0, width - 1)),
               int(np.clip(round(float(point[1])), 0, height - 1)))
        if key not in lookup:
            lookup[key] = index
            subdiv.insert((float(key[0]), float(key[1])))
    triangles = []
    for triangle in subdiv.getTriangleList():
        corners = [(int(round(triangle[i])), int(round(triangle[i + 1]))) for i in (0, 2, 4)]
        if all(corner in lookup for corner in corners):
            indices = [lookup[corner] for corner in corners]
            if len(set(indices)) == 3:
                triangles.append(indices)
    return np.asarray(triangles, dtype=np.int32)


def zone_of_landmark():
    """Landmark index -> zone name. Later zones win a shared index, as in the original."""
    membership = {}
    for zone, indices in ZONES.items():
        for index in indices:
            membership[index] = zone
    return membership


def mesh_map(shape, points, triangles=None):
    """The depth-shaded mesh for one view, as a BGR image of `shape`.

    `points` are landmarks in pixels. `triangles` may be passed in when they have already been
    computed for a warp; otherwise they are triangulated here.
    """
    import cv2
    import numpy as np

    height, width = shape[:2]
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    canvas[:] = MESH_BACKDROP

    if triangles is None:
        triangles = delaunay(points[:, :2], shape)
    if not len(triangles):
        return canvas

    # Negated because MediaPipe's z grows more negative toward the camera; reading it unnegated
    # makes the nose bridge the darkest thing in the picture.
    protrusion = -points[:, 2]
    face_only = triangles[(triangles < len(points)).all(axis=1)]
    if not len(face_only):
        return canvas
    depth = protrusion[face_only].mean(axis=1)
    span = float(depth.max() - depth.min()) or 1.
    shading = .82 + .36 * (depth - depth.min()) / span

    membership = zone_of_landmark()
    for position in np.argsort(depth):  # far first, so nearer triangles sit on top
        corners = face_only[position]
        named = [membership[int(index)] for index in corners if int(index) in membership]
        # Majority of the three corners, so a triangle spanning two zones picks the one it mostly
        # belongs to rather than whichever corner came first.
        colour = ZONE_COLOURS[max(set(named), key=named.count)] if named else UNZONED
        shade = float(shading[position])
        polygon = points[corners, :2].astype(np.int32)
        cv2.fillConvexPoly(canvas, polygon, [min(255, c * shade * .30) for c in colour], cv2.LINE_AA)
        edge = [min(255, (MESH_EDGE[i] * .62 + colour[i] * .38) * shade * .78) for i in range(3)]
        cv2.polylines(canvas, [polygon], True, edge, 1, cv2.LINE_AA)
    return canvas


def mesh_png(image_bytes, points_normalised):
    """A PNG of the mesh for one scan view.

    Takes the photo only for its dimensions — no pixel of it is drawn. The mesh is the whole point,
    and a face photograph underneath would make it a decorated portrait instead of a model.
    """
    import cv2
    import numpy as np

    image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("invalid_image")
    height, width = image.shape[:2]
    points = np.asarray(points_normalised, dtype=np.float64).copy()
    points[:, 0] *= width
    points[:, 1] *= height
    canvas = mesh_map((height, width), points)
    ok, encoded = cv2.imencode(".png", canvas)
    if not ok:
        raise ValueError("invalid_image")
    return encoded.tobytes()

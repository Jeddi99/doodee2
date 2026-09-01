"""Canonical geometry controls and input-only aliases for retired clients.

Split from the engine on purpose. The engine knows how to move pixels; this file is the part a
clinician would actually review, so it stays readable and free of image code.
"""
# --------------------------------------------------------------------------------------------
# Landmark groups the controls act on. Displacements are always expressed as a fraction of the
# face's own size, so the same slider value means the same proportional change whether the person
# filled the frame or sat back from the camera.
# --------------------------------------------------------------------------------------------

BROW_INNER = (107, 336, 55, 285)
#: midline skin between the brow heads. It belongs to no brow itself, so a brow rule that
#: hands it the full lift raises the top of the nose with the brows -- measured at 64 px of
#: nose-bridge travel on a 975 px face before this was split out.
BROW_GLABELLA = (8,)
BROW_MID = (105, 334, 66, 296, 52, 282)
BROW_TAIL = (70, 300, 46, 276, 63, 293, 53, 283)
BROW_LOWER = (65, 295, 52, 282, 46, 276)
BROW_ALL = BROW_INNER + BROW_MID + BROW_TAIL

EYE_OUTER = (33, 263, 130, 359, 247, 467, 226, 446)
EYE_UPPER = (159, 386, 158, 385, 157, 384, 160, 387, 173, 398)
EYE_UNDER = (23, 24, 25, 110, 228, 229, 230, 253, 254, 255, 339, 448, 449, 450)
#: the lid margins themselves, not the hollow below them -- opening an eye moves these two apart
EYE_LID_UPPER = (159, 158, 157, 160, 161, 386, 385, 384, 387, 388)
EYE_LID_LOWER = (145, 144, 153, 154, 163, 374, 373, 380, 381, 390)

NOSE_BRIDGE = (168, 6, 197, 195, 5, 4, 1, 45, 275, 220, 440)
NOSE_TIP = (1, 4, 19, 94, 2, 44, 274)
NOSE_ALAR = (98, 97, 326, 327, 129, 358, 64, 294, 218, 438, 115, 344)

LIP_OUTER = (61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
             146, 91, 181, 84, 17, 314, 405, 321, 375)
LIP_CORNER = (61, 291, 76, 306, 62, 292)
LIP_CUPID = (37, 0, 267, 11, 12)
LIP_LOWER = (17, 84, 314, 181, 405, 15, 16)

CHEEK_APPLE = (116, 117, 118, 119, 120, 100, 123, 50, 101, 36,
               345, 346, 347, 348, 349, 329, 352, 280, 330, 266)
CHEEK_BONE = (116, 117, 123, 137, 177, 345, 346, 352, 366, 401)
NASOLABIAL = (205, 206, 207, 216, 212, 202, 425, 426, 427, 436, 432, 422)

JAW_LOWER = (172, 136, 150, 149, 176, 148, 397, 365, 379, 378, 400, 377)
JAW_ANGLE = (58, 132, 93, 234, 288, 361, 323, 454)
JAW_LINE = JAW_LOWER + JAW_ANGLE

CHIN_TIP = (152, 175, 199, 200, 18)
CHIN_SIDE = (148, 377, 176, 400, 149, 378, 32, 262)

# --------------------------------------------------------------------------------------------
# How far a control is allowed to reach.
#
# A rule names a handful of landmarks, but skin is continuous: the vertices around a named point
# have to travel with it or the spline averages the request away. `SUPPORT` is the radius of that
# co-moving neighbourhood as a fraction of the face's own width, and `HOLD` is the list of
# landmarks that must stay where they are while this control works.
#
# The two together are what makes a control local. A brow lift with a wide radius and nothing
# pinned translates a disc of the upper face upward: on the test photo the upper eyelid rose 62 px
# against the brow's 65, so the eyes travelled with the brows and the whole region read as sliding
# rather than the brow reshaping. Pinning the lid margins and the nose bridge gives the spline
# something to stretch *against*, which is what a brow lift physically does to the skin between
# them.
# --------------------------------------------------------------------------------------------

_BROW_HOLD = EYE_LID_UPPER + EYE_LID_LOWER + EYE_OUTER + NOSE_BRIDGE
_EYE_HOLD = BROW_ALL + BROW_GLABELLA + NOSE_BRIDGE
_LIP_HOLD = NOSE_ALAR + CHIN_TIP + CHEEK_APPLE
_JAW_HOLD = LIP_OUTER + NOSE_ALAR

#: Radius of the co-moving neighbourhood, as a fraction of face width.
#:
#: Measured, not chosen. Each value is the widest radius on the test photo that still delivered the
#: most movement to the landmarks the rule names while leaving this control's pinned landmarks
#: under 2 px and keeping the map's worst local area above 0.42 -- comfortably clear of the 0.35
#: floor where the spline starts smearing texture. Radius and pins pull in opposite directions and
#: the pins turned out to be the ones that matter: with the lids and the nose bridge held, a brow
#: lift at 0.20 delivers 97% of the requested travel and leaves the lids 1.9 px, where the old
#: unpinned field at 0.24 delivered 104% by dragging the lids 26 px along with it.
#:
#: The two tight ones are tight for an anatomical reason, not a numerical one. An outer-canthus
#: lift and a cheekbone reduction both act within a couple of centimetres of something they must
#: not move -- the brow tail and the eye corner -- so there is no wide radius for them to have.
SUPPORT = {
    "browArch": .24, "browThickness": .18, "browTailLift": .22, "browHeight": .20,
    "canthalTiltLift": .06, "underEyeFiller": .20, "eyelidDepth": .22, "eyeOpening": .20,
    "noseBridgeHeight": .24, "noseTipDrop": .18, "noseWingSlim": .20,
    "lipVolume": .24, "lipCornerLift": .24, "cupidBowSharpness": .20,
    "cheekFiller": .16, "nasolabialLift": .22, "cheekboneReduction": .06,
    "jawBotox": .24, "jawDefinition": .24, "hifuLifting": .24,
    "chinLength": .14, "chinProjection": .24, "chinTaper": .24,
    "smileWidth": .24, "smileLift": .24, "smileArc": .24,
}

#: Landmarks pinned to zero displacement while this control works. A pin is a control point like
#: any other, so the field blends smoothly from the moving landmark down to the pinned one instead
#: of stopping at a hard edge.
HOLD = {
    "browArch": _BROW_HOLD, "browThickness": _BROW_HOLD,
    "browTailLift": _BROW_HOLD, "browHeight": _BROW_HOLD,

    "canthalTiltLift": _EYE_HOLD, "eyelidDepth": _EYE_HOLD, "eyeOpening": _EYE_HOLD,
    "underEyeFiller": _EYE_HOLD + CHEEK_APPLE,

    "noseBridgeHeight": BROW_ALL + EYE_LID_UPPER + EYE_LID_LOWER + LIP_OUTER,
    "noseTipDrop": LIP_OUTER + BROW_ALL + (168, 6),
    "noseWingSlim": LIP_OUTER + CHEEK_APPLE + (168, 6, 197),

    "lipVolume": _LIP_HOLD, "lipCornerLift": _LIP_HOLD, "cupidBowSharpness": _LIP_HOLD,
    "smileWidth": _LIP_HOLD, "smileLift": _LIP_HOLD, "smileArc": _LIP_HOLD,

    "cheekFiller": LIP_OUTER + EYE_LID_LOWER + NOSE_ALAR,
    "nasolabialLift": LIP_OUTER + EYE_LID_LOWER,
    "cheekboneReduction": EYE_OUTER + LIP_OUTER,

    "jawBotox": _JAW_HOLD, "jawDefinition": _JAW_HOLD, "hifuLifting": _JAW_HOLD,
    "chinLength": LIP_OUTER, "chinProjection": LIP_OUTER, "chinTaper": LIP_OUTER,
}

# Each control is a list of (mode, gain, indices):
#   spread   +gain pushes the point away from the facial midline, -gain pulls it in
#   vertical +gain lifts the point, -gain lowers it
#   depth    +gain brings the point toward the camera (reads as fuller in the depth map)
# Gains are relative; MAX_SHIFT below converts them into pixels.
RULES = {
    "browArch": (("vertical", .8, BROW_MID), ("vertical", -.2, BROW_INNER)),
    "browThickness": (("vertical", -.7, BROW_LOWER), ("vertical", .2, BROW_MID)),
    "browTailLift": (("vertical", .9, BROW_TAIL), ("spread", .25, BROW_TAIL)),
    "browHeight": (("vertical", 1., BROW_ALL), ("vertical", .4, BROW_GLABELLA)),

    "canthalTiltLift": (("vertical", .9, EYE_OUTER), ("spread", .3, EYE_OUTER)),
    "underEyeFiller": (("depth", 1., EYE_UNDER), ("vertical", .18, EYE_UNDER)),
    "eyelidDepth": (("vertical", .55, EYE_UPPER), ("depth", -.35, EYE_UPPER)),
    # the two lid margins move apart, which is the only way a photograph can show a wider eye:
    # there is no landmark for the lid crease, so lifting the whole lid would just move the eye
    "eyeOpening": (("vertical", 1., EYE_LID_UPPER), ("vertical", -.6, EYE_LID_LOWER)),

    "noseBridgeHeight": (("vertical", .45, NOSE_BRIDGE), ("spread", -.35, NOSE_BRIDGE),
                         ("depth", 1., NOSE_BRIDGE)),
    "noseTipDrop": (("vertical", -.7, NOSE_TIP), ("depth", .6, NOSE_TIP)),
    "noseWingSlim": (("spread", -1., NOSE_ALAR),),

    "lipVolume": (("vertical", .45, LIP_CUPID), ("vertical", -.45, LIP_LOWER),
                  ("depth", .5, LIP_OUTER)),
    "lipCornerLift": (("vertical", .9, LIP_CORNER),),
    "cupidBowSharpness": (("vertical", .7, LIP_CUPID), ("spread", -.25, LIP_CUPID)),

    "cheekFiller": (("spread", .55, CHEEK_APPLE), ("vertical", .35, CHEEK_APPLE),
                    ("depth", 1., CHEEK_APPLE)),
    "nasolabialLift": (("vertical", .8, NASOLABIAL), ("depth", .45, NASOLABIAL)),
    "cheekboneReduction": (("spread", -.9, CHEEK_BONE), ("depth", -.4, CHEEK_BONE)),

    "jawBotox": (("spread", -1., JAW_LOWER), ("spread", -.45, JAW_ANGLE)),
    "jawDefinition": (("spread", -.5, JAW_LINE), ("vertical", .4, JAW_LINE),
                      ("depth", .35, JAW_LINE)),
    "hifuLifting": (("vertical", .75, JAW_LINE), ("vertical", .5, NASOLABIAL),
                    ("spread", -.3, JAW_LOWER)),

    "chinLength": (("vertical", -1., CHIN_TIP), ("vertical", -.4, CHIN_SIDE)),
    "chinProjection": (("depth", 1., CHIN_TIP), ("vertical", -.25, CHIN_TIP)),
    "chinTaper": (("spread", -.9, CHIN_SIDE), ("spread", -.35, CHIN_TIP)),

    "smileWidth": (("spread", .9, LIP_CORNER),),
    "smileLift": (("vertical", .8, LIP_CORNER), ("vertical", .3, LIP_LOWER)),
    "smileArc": (("vertical", -.6, LIP_LOWER), ("vertical", .3, LIP_CORNER)),
}

# key -> (Thai label, English label, help text)
CONTROLS = {
    "browArch": ("ความโก่งของคิ้ว", "Brow arch", "ยกกลางคิ้วให้โค้งขึ้น"),
    "browThickness": ("ความหนาของคิ้ว", "Brow thickness", "ขยายขอบล่างของคิ้วลงมา"),
    "browTailLift": ("ระดับยกหางคิ้ว", "Brow tail lift", "ยกปลายหางคิ้วขึ้นและออก"),
    "browHeight": ("ระดับคิ้วทั้งเส้น", "Brow height", "ยกหรือลดคิ้วทั้งเส้นพร้อมกัน"),
    "canthalTiltLift": ("ระดับยกหางตา", "Outer-corner lift", "ยกหางตาขึ้นเป็นทรงอัลมอนด์"),
    "underEyeFiller": ("ความเรียบใต้ตา", "Under-eye support", "เติมร่องใต้ตาให้ตื้นขึ้น"),
    "eyelidDepth": ("ความชัดชั้นตา", "Eyelid definition", "ทำให้ชั้นตาชัดขึ้น"),
    "eyeOpening": ("ความเปิดของดวงตา", "Eye opening", "เปิดหรือหุบเปลือกตาบนล่าง"),
    "noseBridgeHeight": ("ความสูงสันจมูก", "Bridge height", "ยกสันจมูกให้โด่งและแคบลง"),
    "noseTipDrop": ("ความยาวปลายจมูก", "Tip projection", "ยืดปลายจมูกให้ยื่นออก"),
    "noseWingSlim": ("ความเรียวปีกจมูก", "Alar width", "บีบปีกจมูกเข้าหาแนวกลาง"),
    "lipVolume": ("ความอิ่มริมฝีปาก", "Lip fullness", "เพิ่มความหนาปากบนและล่าง"),
    "lipCornerLift": ("ระดับยกมุมปาก", "Corner lift", "ยกมุมปากทั้งสองข้าง"),
    "cupidBowSharpness": ("ความชัดปากกระจับ", "Cupid’s bow", "ทำให้ยอดปากกระจับคมขึ้น"),
    "cheekFiller": ("วอลลุ่มแก้ม", "Cheek volume", "เติมโหนกแก้มให้อิ่มและยกขึ้น"),
    "nasolabialLift": ("ระดับยกกลางหน้า", "Midface lift", "ยกร่องแก้มและกลางใบหน้า"),
    "cheekboneReduction": ("ลดความเด่นโหนกแก้ม", "Cheekbone softening", "ลดความกว้างของโหนกแก้ม"),
    "jawBotox": ("ความเรียวกราม", "Jaw slimming", "บีบมุมกรามเข้าเป็นทรง V"),
    "jawDefinition": ("ความคมกรอบหน้า", "Jaw definition", "ทำให้แนวกรามคมและกระชับ"),
    "hifuLifting": ("ระดับยกกรอบหน้า", "Lower-face lift", "ยกกรอบหน้าส่วนล่างขึ้นทั้งแนว"),
    "chinLength": ("ความยาวคาง", "Chin length", "ยืดคางลงให้ยาวขึ้น"),
    "chinProjection": ("ระยะยื่นคาง", "Chin projection", "ดันคางไปข้างหน้า"),
    "chinTaper": ("ความเรียวปลายคาง", "Chin taper", "บีบปลายคางให้เรียวแหลม"),
    "smileWidth": ("ความกว้างรอยยิ้ม", "Smile width", "ขยายมุมปากออกด้านข้าง"),
    "smileLift": ("ระดับยกมุมปาก", "Smile lift", "ยกมุมปากให้ดูยิ้ม"),
    "smileArc": ("ความโค้งรอยยิ้ม", "Smile arc", "เพิ่มความโค้งของแนวปากล่าง"),
}

# category id -> (icon, Thai, English, control keys)
CATEGORIES = (
    ("brows", "〰", "คิ้ว", "Brows", ("browArch", "browThickness", "browTailLift", "browHeight")),
    ("eyes", "◉", "ดวงตา", "Eyes", ("canthalTiltLift", "underEyeFiller", "eyelidDepth",
                                    "eyeOpening")),
    ("nose", "△", "จมูก", "Nose", ("noseBridgeHeight", "noseTipDrop", "noseWingSlim")),
    ("lips", "♡", "ริมฝีปาก", "Lips", ("lipVolume", "lipCornerLift", "cupidBowSharpness")),
    ("cheeks", "●", "แก้ม", "Cheeks", ("cheekFiller", "nasolabialLift", "cheekboneReduction")),
    ("jaw", "◇", "ขากรรไกร", "Jaw", ("jawBotox", "jawDefinition", "hifuLifting")),
    ("chin", "▽", "คาง", "Chin", ("chinLength", "chinProjection", "chinTaper")),
    ("smile", "⌣", "รอยยิ้ม", "Smile", ("smileWidth", "smileLift", "smileArc")),
)

# One-click looks. Anything not named in a preset is left at zero.
PRESETS = {
    "face": (
        ("oval", "วงรีสมดุล", "Balanced oval",
         {"cheekFiller": 30, "jawBotox": 46, "chinLength": 38, "jawDefinition": 35}),
        ("round", "กลมนุ่ม", "Soft round",
         {"cheekFiller": 58, "jawBotox": 12, "chinLength": 16, "jawDefinition": 12}),
        ("square", "เหลี่ยมคม", "Defined square",
         {"cheekFiller": 20, "jawBotox": 0, "chinLength": 24, "jawDefinition": 82}),
        ("heart", "หัวใจ", "Heart shape",
         {"cheekFiller": 58, "jawBotox": 68, "chinLength": 42, "jawDefinition": 46}),
        ("diamond", "ไดมอนด์", "Diamond shape",
         {"cheekFiller": 24, "cheekboneReduction": 0, "jawBotox": 54, "chinLength": 46,
          "jawDefinition": 62}),
    ),
    "eyes": (
        ("almond", "อัลมอนด์สมดุล", "Balanced almond", {"canthalTiltLift": 38, "eyelidDepth": 45}),
        ("round", "กลมละมุน", "Soft round",
         {"canthalTiltLift": 8, "eyelidDepth": 26, "underEyeFiller": 28}),
        ("lifted", "ยกหางตา", "Lifted outer corner", {"canthalTiltLift": 76, "eyelidDepth": 42}),
        ("refreshed", "ใต้ตาสดใส", "Refreshed under-eye",
         {"underEyeFiller": 72, "eyelidDepth": 32}),
    ),
    "nose": (
        ("natural", "ตรงธรรมชาติ", "Natural straight",
         {"noseBridgeHeight": 34, "noseTipDrop": 28, "noseWingSlim": 22}),
        ("slope", "สโลปละมุน", "Soft slope",
         {"noseBridgeHeight": 48, "noseTipDrop": 44, "noseWingSlim": 25}),
        ("tip", "ปลายเรียว", "Refined tip",
         {"noseBridgeHeight": 34, "noseTipDrop": 72, "noseWingSlim": 48}),
        ("upturn", "ปลายเชิดเล็กน้อย", "Gentle upturn",
         {"noseBridgeHeight": 46, "noseTipDrop": 16, "noseWingSlim": 40}),
    ),
    "lips": (
        ("balanced", "สมดุลธรรมชาติ", "Natural balance",
         {"lipVolume": 32, "lipCornerLift": 24, "cupidBowSharpness": 34}),
        ("full", "อิ่มละมุน", "Soft full",
         {"lipVolume": 74, "lipCornerLift": 28, "cupidBowSharpness": 38}),
        ("cupid", "กระจับชัด", "Defined cupid", {"lipVolume": 45, "cupidBowSharpness": 82}),
        ("lifted", "มุมปากยก", "Lifted corners",
         {"lipVolume": 38, "lipCornerLift": 78, "cupidBowSharpness": 42}),
    ),
    "cheeks": (
        ("natural", "ธรรมชาติ", "Natural",
         {"cheekFiller": 25, "nasolabialLift": 20, "cheekboneReduction": 12}),
        ("high", "โหนกแก้มสูง", "High cheek",
         {"cheekFiller": 52, "nasolabialLift": 46, "cheekboneReduction": 0}),
        ("volume", "กลางหน้าอิ่ม", "Midface support",
         {"cheekFiller": 76, "nasolabialLift": 54, "cheekboneReduction": 10}),
        ("lifted", "แก้มยกกระชับ", "Lifted cheek",
         {"cheekFiller": 45, "nasolabialLift": 80, "cheekboneReduction": 18}),
    ),
    "jaw": (
        ("soft", "กรอบหน้านุ่ม", "Soft contour",
         {"jawBotox": 28, "jawDefinition": 24, "hifuLifting": 22}),
        ("vline", "วีไลน์", "V-line", {"jawBotox": 78, "jawDefinition": 52, "hifuLifting": 48}),
        ("straight", "ตรงสมดุล", "Balanced straight",
         {"jawBotox": 34, "jawDefinition": 58, "hifuLifting": 30}),
        ("slim", "กรามเรียว", "Slim jaw",
         {"jawBotox": 88, "jawDefinition": 36, "hifuLifting": 56}),
    ),
    "chin": (
        ("balanced", "สมดุล", "Balanced",
         {"chinLength": 34, "chinProjection": 36, "chinTaper": 30}),
        ("projected", "คางมีมิติ", "Projected",
         {"chinLength": 38, "chinProjection": 78, "chinTaper": 36}),
        ("soft", "สั้นละมุน", "Soft short",
         {"chinLength": 15, "chinProjection": 24, "chinTaper": 18}),
        ("taper", "ปลายเรียว", "Tapered",
         {"chinLength": 55, "chinProjection": 44, "chinTaper": 82}),
    ),
}

# --------------------------------------------------------------------------------------------
# What is actually done in a clinic to achieve each change. Procedure names follow ASPS and the
# published Thai clinic literature; numbers appear only where a source states them, because a
# made-up dose is worse than no dose. Everything here is background for a conversation with a
# doctor, never a plan.
# --------------------------------------------------------------------------------------------

KINDS = {
    "surgery": ("ผ่าตัด", "#ff6b8a"),
    "filler": ("ฉีดฟิลเลอร์", "#4de3ff"),
    "toxin": ("โบทูลินัมท็อกซิน", "#a78bfa"),
    "thread": ("ร้อยไหม", "#ffd166"),
    "energy": ("พลังงาน (HIFU/RF/เลเซอร์)", "#5ee6a8"),
    "graft": ("ปลูกถ่ายเนื้อเยื่อ/ไขมัน", "#ffa552"),
}


def _p(kind, th, en, downtime, lasts, note=""):
    return {"kind": kind, "th": th, "en": en, "downtime": downtime, "lasts": lasts, "note": note}


PROCEDURES = {
    "browArch": (
        _p("toxin", "ยกหัวคิ้วด้วยโบทอก", "Chemical brow lift", "ไม่ต้องพัก", "3-4 เดือน",
           "คลายกล้ามเนื้อที่ดึงคิ้วลง ทำให้แนวคิ้วยกขึ้นเล็กน้อย"),
        _p("surgery", "ยกคิ้วผ่านกล้อง", "Endoscopic brow lift", "7-14 วัน", "หลายปี"),
    ),
    "browThickness": (
        _p("graft", "ปลูกคิ้ว", "Eyebrow hair transplant (FUE)", "5-7 วัน", "ถาวร",
           "ย้ายรากผมมาปลูกตามแนวคิ้ว"),
    ),
    "browHeight": (
        _p("surgery", "ยกคิ้วผ่านกล้อง", "Endoscopic brow lift", "7-14 วัน", "หลายปี",
           "ยกคิ้วทั้งเส้น ไม่ใช่เฉพาะหัวหรือหางคิ้ว"),
        _p("toxin", "โบทอกปรับแนวคิ้ว", "Botulinum brow shaping", "ไม่ต้องพัก", "3-4 เดือน",
           "ใช้ได้ทั้งยกและลดระดับคิ้ว ขึ้นกับกล้ามเนื้อที่ฉีด"),
        _p("thread", "ร้อยไหมยกคิ้ว", "Thread brow lift", "2-5 วัน", "9-12 เดือน"),
    ),
    "eyeOpening": (
        _p("surgery", "ผ่าตัดเปลือกตาบน", "Upper blepharoplasty", "7-14 วัน", "หลายปี",
           "ตัดหนังตาที่หย่อนออก ทำให้ตาเปิดขึ้น"),
        _p("surgery", "ผ่าตัดแก้ไขเปลือกตา", "Revision blepharoplasty", "7-14 วัน", "หลายปี",
           "ใช้เมื่อเปลือกตาถูกตัดมากเกินไปจนตาเปิดกว้างผิดธรรมชาติ"),
    ),
    "browTailLift": (
        _p("toxin", "ยกหางคิ้วด้วยโบทอก", "Botox tail lift", "ไม่ต้องพัก", "3-4 เดือน"),
        _p("thread", "ร้อยไหมยกหางคิ้ว", "Brow thread lift", "2-5 วัน", "9-12 เดือน"),
        _p("surgery", "ยกคิ้วด้านข้าง", "Temporal brow lift", "7-14 วัน", "หลายปี"),
    ),
    "canthalTiltLift": (
        _p("surgery", "ผ่าตัดเปิดหางตา", "Lateral canthoplasty", "10-14 วัน", "ถาวร",
           "เปิดมุมตาด้านนอกให้ตายาวขึ้น"),
        _p("surgery", "ตรึงหางตา", "Canthopexy", "7-10 วัน", "หลายปี", "ยกหางตาโดยไม่ตัดเปิด"),
        _p("thread", "ร้อยไหมยกหางตา", "Thread lift, outer corner", "2-5 วัน", "6-12 เดือน"),
    ),
    "underEyeFiller": (
        _p("filler", "ฟิลเลอร์ร่องใต้ตา", "Tear trough filler (HA)", "1-3 วัน", "9-12 เดือน",
           "ฟิลเลอร์ไฮยาลูรอนิกแอซิด ละลายได้ด้วยเอนไซม์ถ้าผลไม่พอใจ"),
        _p("surgery", "ผ่าตัดถุงใต้ตา", "Lower blepharoplasty with fat repositioning",
           "10-14 วัน", "หลายปี"),
        _p("graft", "เติมไขมันใต้ตา", "Micro fat grafting", "7-10 วัน", "หลายปี"),
    ),
    "eyelidDepth": (
        _p("surgery", "ทำตาสองชั้นแบบกรีด", "Incisional double eyelid surgery", "10-14 วัน", "ถาวร"),
        _p("surgery", "ทำตาสองชั้นแบบเย็บ", "Suture (non-incisional) technique", "5-7 วัน",
           "หลายปี", "พักฟื้นสั้นกว่า แต่มีโอกาสชั้นตาคลายมากกว่าแบบกรีด"),
        _p("surgery", "แก้กล้ามเนื้อตาอ่อนแรง", "Ptosis correction", "10-14 วัน", "ถาวร"),
    ),
    "noseBridgeHeight": (
        _p("filler", "ฉีดฟิลเลอร์สันจมูก", "Non-surgical rhinoplasty (HA filler)", "1-2 วัน",
           "9-12 เดือน", "ไม่ผ่าตัด แต่เสี่ยงหลอดเลือดอุดตันถ้าฉีดผิดชั้น ต้องทำโดยแพทย์"),
        _p("surgery", "เสริมจมูกด้วยซิลิโคน", "Augmentation rhinoplasty, implant", "7-14 วัน",
           "ถาวร"),
        _p("surgery", "เสริมจมูกด้วยกระดูกอ่อนตัวเอง", "Augmentation with autologous cartilage",
           "10-14 วัน", "ถาวร", "ใช้กระดูกอ่อนหูหรือซี่โครง ลดโอกาสร่างกายต่อต้าน"),
    ),
    "noseTipDrop": (
        _p("surgery", "ทำปลายจมูก", "Tip plasty (cartilage graft)", "10-14 วัน", "ถาวร"),
        _p("filler", "ฉีดปลายจมูก", "Tip filler", "1-2 วัน", "9-12 เดือน"),
    ),
    "noseWingSlim": (
        _p("surgery", "ตัดปีกจมูก", "Alarplasty (alar base reduction)", "7-10 วัน", "ถาวร"),
        _p("toxin", "โบทอกลดการบานปีกจมูก", "Alar flare botulinum toxin", "ไม่ต้องพัก",
           "3-4 เดือน", "ได้ผลเฉพาะกรณีปีกจมูกบานจากกล้ามเนื้อ"),
    ),
    "lipVolume": (
        _p("filler", "ฟิลเลอร์ปาก", "Lip filler (HA)", "2-4 วัน", "6-12 เดือน",
           "ราคาไทยอ้างอิงราว 15,000-21,000 บาทต่อ 1 cc ขึ้นกับยี่ห้อ"),
        _p("graft", "เติมไขมันริมฝีปาก", "Lip fat grafting", "7-10 วัน", "หลายปี"),
    ),
    "lipCornerLift": (
        _p("toxin", "โบทอกมุมปาก", "Botulinum toxin to depressor anguli oris", "ไม่ต้องพัก",
           "3-4 เดือน", "คลายกล้ามเนื้อที่ดึงมุมปากลง"),
        _p("surgery", "ยกมุมปาก", "Corner lip lift (grin lift)", "7-10 วัน", "ถาวร"),
    ),
    "cupidBowSharpness": (
        _p("filler", "ฟิลเลอร์เก็บทรงปากกระจับ", "Lip contouring filler", "2-4 วัน", "6-12 เดือน"),
        _p("surgery", "ยกริมฝีปากบน", "Bullhorn (subnasal) lip lift", "7-10 วัน", "ถาวร"),
    ),
    "cheekFiller": (
        _p("filler", "ฟิลเลอร์แก้ม", "Cheek filler (HA หรือ CaHA)", "2-4 วัน", "12-18 เดือน"),
        _p("graft", "เติมไขมันแก้ม", "Cheek fat grafting", "7-14 วัน", "หลายปี"),
        _p("surgery", "เสริมโหนกแก้ม", "Cheek implant", "10-14 วัน", "ถาวร"),
    ),
    "nasolabialLift": (
        _p("filler", "ฟิลเลอร์ร่องแก้ม", "Nasolabial fold filler", "2-4 วัน", "9-12 เดือน"),
        _p("thread", "ร้อยไหมยกกลางหน้า", "Midface thread lift", "3-7 วัน", "9-15 เดือน"),
        _p("energy", "HIFU / Ultherapy", "HIFU or micro-focused ultrasound", "ไม่ต้องพัก",
           "9-12 เดือน"),
    ),
    "cheekboneReduction": (
        _p("surgery", "ผ่าตัดลดโหนกแก้ม", "Zygoma (cheekbone) reduction", "14-21 วัน", "ถาวร",
           "ผ่าตัดกระดูก ต้องประเมินโดยศัลยแพทย์เฉพาะทาง"),
        _p("surgery", "ตัดไขมันกระพุ้งแก้ม", "Buccal fat removal", "5-7 วัน", "ถาวร",
           "ลดความอวบช่วงแก้มล่าง ไม่ได้ลดกระดูกโหนกแก้ม"),
    ),
    "jawBotox": (
        _p("toxin", "โบทอกลดกราม", "Masseter botulinum toxin", "ไม่ต้องพัก", "4-6 เดือน",
           "คลินิกไทยอ้างอิงราว 50-100 ยูนิตต่อครั้ง ขึ้นกับขนาดกล้ามเนื้อ เห็นผลใน 2-6 สัปดาห์"),
        _p("surgery", "ผ่าตัดลดมุมกราม", "Mandibular angle reduction", "14-21 วัน", "ถาวร"),
    ),
    "jawDefinition": (
        _p("filler", "ฟิลเลอร์กรอบหน้า", "Jawline filler", "2-4 วัน", "12-18 เดือน"),
        _p("thread", "ร้อยไหมกรอบหน้า", "Jawline thread lift", "3-7 วัน", "9-15 เดือน"),
        _p("energy", "สลายไขมันใต้คาง", "Deoxycholic acid, submental fat", "3-7 วัน", "ถาวร"),
    ),
    "hifuLifting": (
        _p("energy", "HIFU / Ultherapy", "Micro-focused ultrasound lifting", "ไม่ต้องพัก",
           "9-12 เดือน"),
        _p("energy", "คลื่นวิทยุ Thermage", "Monopolar radiofrequency", "ไม่ต้องพัก", "12 เดือน"),
        _p("thread", "ร้อยไหมยกกระชับ", "Thread lift", "3-7 วัน", "9-15 เดือน"),
        _p("surgery", "ดึงหน้า", "Facelift (rhytidectomy)", "14-21 วัน", "หลายปี"),
    ),
    "chinLength": (
        _p("surgery", "ผ่าตัดเลื่อนกระดูกคาง", "Sliding genioplasty", "14-21 วัน", "ถาวร"),
        _p("filler", "ฟิลเลอร์คาง", "Chin filler", "2-4 วัน", "12-18 เดือน"),
    ),
    "chinProjection": (
        _p("surgery", "เสริมคางด้วยซิลิโคน", "Chin implant (mentoplasty)", "10-14 วัน", "ถาวร"),
        _p("filler", "ฟิลเลอร์คาง", "Chin filler", "2-4 วัน", "12-18 เดือน"),
    ),
    "chinTaper": (
        _p("surgery", "ผ่าตัดวีไลน์", "V-line surgery (T-osteotomy)", "21-30 วัน", "ถาวร",
           "ผ่าตัดกระดูกขากรรไกร เป็นหัตถการใหญ่ ต้องประเมินอย่างละเอียด"),
        _p("filler", "ฟิลเลอร์เก็บทรงคาง", "Chin contouring filler", "2-4 วัน", "12-18 เดือน"),
    ),
    "smileWidth": (
        _p("surgery", "ยกมุมปาก", "Corner lip lift", "7-10 วัน", "ถาวร"),
    ),
    "smileLift": (
        _p("toxin", "โบทอกมุมปาก", "Botulinum toxin, depressor anguli oris", "ไม่ต้องพัก",
           "3-4 เดือน"),
        _p("toxin", "โบทอกยิ้มเห็นเหงือก", "Gummy smile botulinum toxin", "ไม่ต้องพัก",
           "3-4 เดือน"),
    ),
    "smileArc": (
        _p("filler", "ฟิลเลอร์ปรับทรงปาก", "Lip shaping filler", "2-4 วัน", "6-12 เดือน"),
    ),
}

PROCEDURE_SOURCES = (
    ("ASPS — Cosmetic Procedures", "https://www.plasticsurgery.org/cosmetic-procedures"),
    ("ASPS — Dermal Fillers Safety",
     "https://www.plasticsurgery.org/cosmetic-procedures/dermal-fillers/safety"),
    ("ASPS — Rhinoplasty", "https://www.plasticsurgery.org/cosmetic-procedures/rhinoplasty"),
    ("AAD — Acne skin care", "https://www.aad.org/public/diseases/acne/skin-care/tips"),
)

PRESET_GROUP_LABELS = {
    "face": "ทรงหน้า", "eyes": "ดวงตา", "nose": "จมูก", "lips": "ริมฝีปาก",
    "cheeks": "แก้ม", "jaw": "กราม", "chin": "คาง",
}

# Safety ceiling on how far any single landmark may be pushed, as a fraction of face width.
#
# Measured rather than guessed: the thin plate spline's Jacobian determinant stays positive — no
# pixel folding — out to about 20 mm of displacement on a 140 mm face, reaching 0.012 only at 500
# on the scale here. The previous 0.055 came from the older Gaussian warp, whose bending limit is
# a different calculation entirely, and it silently clipped the top dose of chin work to 7.9 mm
# when the record said 9.0. This sits at roughly 0.42 of the measured folding point.
MAX_SHIFT = .115

#: Smallest local area a warped pixel neighbourhood may keep, as a fraction of its original area.
#: Below this the spline is squeezing texture hard enough to read as smeared plastic even though it
#: has not folded. .35 keeps the strongest usable settings intact -- they measure about .71 -- and
#: only bites on the stacked extremes, where the map was measured down at .02.
FOLD_FLOOR = .35


# Public API name used by the Django simulation endpoints.
SLIDERS = CONTROLS


# Compatibility catalog consumed by the existing doodee2 simulation UI. The engine still works
# exclusively in dd2 slider keys; these presets are the stable public names translated at the API
# boundary so previously saved selections and reports remain readable.
INTENSITY_SETTINGS = {1: 30., 2: 50., 3: 72., 4: 100., 5: 130.}
INTENSITY_LEVELS = tuple(
    {"level": level, "label_th": th, "label_en": en}
    for level, th, en in (
        (1, "เบามาก", "Very subtle"), (2, "เบา", "Subtle"),
        (3, "ปานกลาง", "Moderate"), (4, "ชัด", "Pronounced"),
        (5, "ชัดมาก", "Very pronounced"),
    )
)

REGION_LANDMARKS = {
    "eyes": (33, 133, 159, 145, 362, 263, 386, 374),
    "nose": (168, 193, 417, 98, 327, 2, 1),
    "lips": (61, 291, 0, 13, 14, 17),
    "cheeks": (116, 50, 187, 205, 345, 280, 411, 425),
    "jaw": (234, 172, 152, 397, 454),
    "chin": (172, 176, 152, 400, 397),
}


def _simulation_preset(id, region, name_th, name_en, measurement_key, slider,
                       direction=1., source_view="front", related=(), available=True):
    return {
        "id": id, "region": region, "name_th": name_th, "name_en": name_en,
        "effect_th": name_th, "effect_en": name_en,
        "measurement_th": name_th, "measurement_en": name_en,
        "measurement_key": measurement_key, "source_view": source_view,
        "slider": slider, "direction": float(direction), "technique": "warp",
        "warpable": bool(available), "available": bool(available),
        "unavailable_th": "dd2 ไม่มีแบบจำลองการขยับทิศทางนี้ที่มีหลักฐานรองรับ" if not available else "",
        "unavailable_en": "The dd2 engine has no evidence-backed movement in this direction." if not available else "",
        "related_procedures": list(related)[:3],
        "intensity_levels": list(INTENSITY_LEVELS), "default_intensity_level": 3,
        "status": "educational_simulation",
    }


SIMULATION_PRESETS = (
    _simulation_preset("eyes-open", "eyes", "เปิดดวงตา", "More open", "eye_aspect_ratio", "eyeOpening", related=("Blepharoplasty",)),
    _simulation_preset("eyes-soft", "eyes", "ลดความเปิดดวงตา", "Softer opening", "eye_aspect_ratio", "eyeOpening", -1, related=("Blepharoplasty",)),
    _simulation_preset("outer-corner-lift", "eyes", "ยกหางตา", "Outer corners raised", "outer_corner_position", "canthalTiltLift", related=("Canthoplasty", "Brow lift")),
    _simulation_preset("outer-corner-lower", "eyes", "ลดหางตา", "Outer corners lowered", "outer_corner_position", "canthalTiltLift", -1, related=("Canthoplasty",)),
    _simulation_preset("nose-narrow", "nose", "ฐานจมูกแคบลง", "Narrower alar base", "alar_width_ratio", "noseWingSlim", related=("Alar base reduction", "Rhinoplasty")),
    _simulation_preset("nose-wide", "nose", "ฐานจมูกกว้างขึ้น", "Wider alar base", "alar_width_ratio", "noseWingSlim", -1, related=("Rhinoplasty",)),
    _simulation_preset("nose-tip-projection", "nose", "ปลายจมูกยื่นขึ้น", "More tip projection", "nose_projection_ratio", "noseTipDrop", source_view="profile", related=("Rhinoplasty", "Nasal filler")),
    _simulation_preset("nose-tip-retraction", "nose", "ปลายจมูกถอยลง", "Less tip projection", "nose_projection_ratio", "noseTipDrop", -1, "profile", ("Rhinoplasty",)),
    _simulation_preset("lip-volume", "lips", "ริมฝีปากอิ่มขึ้น", "Fuller lips", "lip_height_ratio", "lipVolume", related=("Lip filler", "Fat grafting")),
    _simulation_preset("lip-thin", "lips", "ริมฝีปากบางลง", "Thinner lips", "lip_height_ratio", "lipVolume", -1, related=("Lip reduction",)),
    _simulation_preset("lip-wide", "lips", "ริมฝีปากกว้างขึ้น", "Wider lips", "mouth_width_ratio", "smileWidth", related=("Lip filler",)),
    _simulation_preset("lip-narrow", "lips", "ริมฝีปากแคบลง", "Narrower lips", "mouth_width_ratio", "smileWidth", -1, related=("Lip contouring",)),
    _simulation_preset("cheek-wide", "cheeks", "แนวแก้มกว้างขึ้น", "Wider cheeks", "zygomatic_width_ratio", "cheekFiller", related=("Cheek filler", "Fat grafting")),
    _simulation_preset("cheek-narrow", "cheeks", "แนวแก้มแคบลง", "Narrower cheeks", "zygomatic_width_ratio", "cheekboneReduction", related=("Cheek contouring",)),
    _simulation_preset("cheek-lift", "cheeks", "ยกแนวแก้ม", "Cheeks raised", "cheek_position", "nasolabialLift", related=("Cheek filler", "Thread lift")),
    _simulation_preset("cheek-lower", "cheeks", "ลดแนวแก้ม", "Cheeks lowered", "cheek_position", "nasolabialLift", -1, related=("Cheek contouring",)),
    _simulation_preset("jaw-narrow", "jaw", "แนวกรามแคบลง", "Narrower jaw", "jaw_width_ratio", "jawBotox", related=("Jaw contouring", "Mandibular angle reduction")),
    _simulation_preset("jaw-wide", "jaw", "แนวกรามกว้างขึ้น", "Wider jaw", "jaw_width_ratio", "jawBotox", -1, related=("Jaw filler",), available=False),
    _simulation_preset("jaw-angle-lift", "jaw", "ยกมุมกราม", "Jaw angles raised", "jaw_angle_position", "hifuLifting", related=("Jaw contouring", "Thread lift")),
    _simulation_preset("jaw-angle-lower", "jaw", "ลดมุมกราม", "Jaw angles lowered", "jaw_angle_position", "hifuLifting", -1, related=("Jaw filler",)),
    _simulation_preset("chin-long", "chin", "คางยาวขึ้น", "Longer chin", "chin_height_ratio", "chinLength", related=("Chin filler", "Chin implant", "Genioplasty")),
    _simulation_preset("chin-short", "chin", "คางสั้นลง", "Shorter chin", "chin_height_ratio", "chinLength", -1, related=("Genioplasty",)),
    _simulation_preset("chin-projection", "chin", "คางยื่นขึ้น", "More chin projection", "chin_projection_ratio", "chinProjection", source_view="profile", related=("Chin filler", "Chin implant", "Genioplasty")),
    _simulation_preset("chin-retraction", "chin", "คางถอยลง", "Less chin projection", "chin_projection_ratio", "chinProjection", -1, "profile", ("Genioplasty",)),
)


def get_preset(preset_id):
    return next((preset for preset in SIMULATION_PRESETS if preset["id"] == preset_id), None)


def present_preset(preset):
    if not preset:
        return None
    return {key: value for key, value in preset.items() if key not in {"slider", "direction"}}


def validate_selections(scan, selections):
    if not isinstance(selections, list) or not selections:
        raise ValueError("empty_selections")
    if len(selections) > 6:
        raise ValueError("too_many_selections")
    normalised, presets, seen = [], [], set()
    for selection in selections:
        if not isinstance(selection, dict) or set(selection) - {"region", "preset_id", "intensity_level"}:
            raise ValueError("invalid_selection")
        region, preset_id = selection.get("region"), selection.get("preset_id")
        if region in seen:
            raise ValueError("duplicate_region")
        seen.add(region)
        preset = get_preset(preset_id)
        if not preset or preset["region"] != region:
            raise ValueError(f"preset_region_mismatch:{region}")
        if not preset["available"]:
            raise ValueError(f"information_only_preset:{region}")
        try:
            level = int(selection.get("intensity_level", preset["default_intensity_level"]))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid_intensity_level:{region}") from exc
        if level not in INTENSITY_SETTINGS:
            raise ValueError(f"invalid_intensity_level:{region}")
        normalised.append({"region": region, "preset_id": preset_id, "intensity_level": level})
        presets.append(preset)
    if len({preset["source_view"] for preset in presets}) != 1:
        raise ValueError("mixed_source_view")
    if presets[0]["source_view"] == "profile" and not all(
        (scan.image_objects or {}).get(view) for view in ("left_profile", "right_profile")
    ):
        raise ValueError(f"profile_photos_required:{presets[0]['region']}")
    return normalised, presets


def sliders_for_selections(selections, presets):
    sliders = {}
    for selection, preset in zip(selections, presets):
        value = preset["direction"] * INTENSITY_SETTINGS[selection["intensity_level"]]
        sliders[preset["slider"]] = sliders.get(preset["slider"], 0.) + value
    return sliders


def related_union(presets):
    return list(dict.fromkeys(name for preset in presets for name in preset["related_procedures"]))

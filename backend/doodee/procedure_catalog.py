"""Declarative catalog for every row in the face-procedure source list.

The records contain no callables.  Adding a procedure means composing the five operations from
``surface_effects``; it must never add another renderer function.  Unsupported body/systemic
rows remain present with an empty pipeline so catalog coverage is auditable rather than implicit.
"""
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Iterable

from .surface_effects import OpType, PRIMITIVE_TYPES, Step


ALL_VIEWS = ("front", "front_smile", "left_profile", "right_profile",
             "left_oblique", "right_oblique", "basal")
FRONT = ("front", "front_smile", "left_oblique", "right_oblique")
PROFILES = ("left_profile", "right_profile", "left_oblique", "right_oblique", "basal")

# The three photographs a scan actually carries, and so the only angles a client can be asked to
# switch to. `ALL_VIEWS` also names a smile, two obliques and a basal shot that this build never
# captures or renders; a client reading a raw `views` tuple has no way to tell which of those it
# could show, so `public()` hands over the intersection rather than the declaration.
RENDERED_VIEWS = ("front", "left_profile", "right_profile")

CATEGORIES = MappingProxyType({
    "lifting": ("ยกกระชับ", "Lifting & Tightening"),
    "skin": ("ผิว", "Skin & Rejuvenation"),
    "botox": ("โบท็อกซ์", "Botox / Neurotoxin"),
    "filler": ("ฟิลเลอร์", "Dermal Fillers"),
    "nose": ("ศัลยกรรมจมูก", "Rhinoplasty"),
    "eyes": ("ศัลยกรรมตา", "Blepharoplasty & Eye Surgery"),
    "contour": ("โครงหน้า/ขากรรไกร", "Facial Contouring & Jaw Surgery"),
    "breast": ("ศัลยกรรมหน้าอก", "Breast Surgery"),
    "fat": ("ศัลยกรรมไขมัน", "Fat Surgery & Grafting"),
    "hair": ("ปลูกผม", "Hair & Scalp"),
    "hair_removal": ("กำจัดขน", "Hair Removal"),
    "traditional": ("แพทย์แผนเกาหลี", "Korean Traditional Medicine"),
    "other": ("อื่นๆ", "Miscellaneous Procedures"),
})

# Written down rather than derived from position in `CATEGORIES`. The number is the wire contract
# clients filter by, so retiring a category must not renumber the ones after it -- `enumerate` did
# exactly that, and dropping 13 (`dental`) would have silently moved `other` from 14 to 13 and
# handed every client the wrong list. 13 is retired along with the category and stays unused.
CATEGORY_NUMBERS = MappingProxyType({
    "lifting": 1, "skin": 2, "botox": 3, "filler": 4, "nose": 5, "eyes": 6, "contour": 7,
    "breast": 8, "fat": 9, "hair": 10, "hair_removal": 11, "traditional": 12, "other": 14,
})

# Exact technique labels from data.txt.  Mixed labels are preserved for auditability and routed
# through both deterministic stages; the source wording must never be silently normalised away.
_TECHNIQUE_REFS = {
    "-": "14.14",
    "dd2": "1.5,3.1,4.5,5.1,5.3,5.5,6.3,6.4,6.5,7.1,7.2,7.3,7.4,7.5,7.7,9.1,9.3,9.6,9.7,12.1,14.5,14.9,14.12",
    "dd2 / test": "9.5,14.13",
    "Hybrid": "1.1,1.2,1.4,1.6,4.4,5.2,5.4,5.6,6.8,7.6,7.9,9.4,14.6",
    "Hybrid / test": "1.9",
    "N/A": "1.7,1.8,2.11,3.3,3.5,3.6,4.7,7.10,8.1,8.2,8.3,8.4,9.2,10.4,11.1,14.4,14.7,14.10,14.11",
    "test": "1.3,2.1,2.2,2.3,2.4,2.5,2.6,2.7,2.8,2.9,2.10,3.2,3.4,4.1,4.2,4.3,4.6,6.1,6.2,6.6,6.7,7.8,10.1,10.2,10.3,11.2,12.3,14.1,14.2,14.3,14.8",
    "test / dd2": "4.8",
    "test / Hybrid": "12.2",
}
TECHNIQUE_BY_REF = MappingProxyType({
    ref: label for label, refs in _TECHNIQUE_REFS.items() for ref in refs.split(",")
})

# The curve is read off a phone at arm's length, not off a pixel diff. The earlier .40/1.00/1.60
# ladder was built around level 3 being exactly the clinical dose, which left levels 1 and 2 below
# the point where a viewer can see that anything happened at all -- a slider whose first half does
# nothing visible reads as a broken slider. Level 3 is still the standard result; the whole ladder
# now sits above the threshold where the change is legible without zooming.
INTENSITY_SCALES = MappingProxyType({1: .65, 2: .90, 3: 1.25, 4: 1.65, 5: 2.15})
INTENSITY_LEVELS = (
    MappingProxyType({"level": 1, "label_th": "เบามาก", "label_en": "Minimal", "scale": .65}),
    MappingProxyType({"level": 2, "label_th": "เบา", "label_en": "Subtle", "scale": .90}),
    MappingProxyType({"level": 3, "label_th": "ปานกลาง", "label_en": "Standard", "scale": 1.25}),
    MappingProxyType({"level": 4, "label_th": "ชัด", "label_en": "Pronounced", "scale": 1.65}),
    MappingProxyType({"level": 5, "label_th": "ชัดมาก", "label_en": "Dramatic", "scale": 2.15}),
)

# A variable row describes a dose or a continuously adjustable visible displacement. Everything
# else is a fixed treatment/style: clients can select it, but cannot imply a clinical dose the
# source catalog does not define.
VARIABLE_PROCEDURE_REFS = frozenset({
    "1.1", "1.2", "1.3", "1.4", "1.5", "1.9",
    "2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.8", "2.10",
    "3.1", "3.2", "3.4",
    "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.8",
    "5.1", "5.2", "5.3", "5.6",
    "6.3", "6.5", "6.8",
    "7.1", "7.2", "7.3", "7.4", "7.6", "7.7", "7.8", "7.9",
    "9.1", "9.3", "9.4", "9.5", "9.6", "9.7",
    "10.2", "10.3", "12.1", "12.2", "14.1", "14.5", "14.6", "14.9", "14.12", "14.13",
})

# Stage 2 of the two-stage architecture data.txt describes: once the deterministic LAB pass has
# drawn the feature, a hosted inpaint re-renders it as skin -- pores, the way skin creases along a
# fold, individual hair strands. Stage 1 still decides *where* the feature is and how many there
# are; stage 2 only decides what it is made of.
#
# This table is the *override* list, not the eligibility list. Every row that draws with OpenCV --
# any SHADE/FLATTEN/TONE/INPAINT step -- is refined; see `refine_plan`. The entries here exist
# where a prompt naming the actual feature beats the generic one: a hairline has to be built rather
# than kept, and "an existing eyelid crease" produces a different fold from "the marked area".
#
# A pure warp is still absent on purpose and gets nothing: it moved real photographed skin, so
# there is no drawn region for a generative pass to re-render and paying for one would be waste.
#
# (kind, prompt key). The mask handed over is the union of that row's own surface-step regions, so
# the paid edit can never reach further than the deterministic pass already did.
REFINE_PLANS = MappingProxyType({
    "2.4": ("polish", "smooth_skin"),       # รอยดำ/ฝ้ากระ -- lesion gone, skin closed over it
    "2.7": ("polish", "smooth_skin"),       # เลเซอร์กำจัดไฝ
    "4.1": ("polish", "fold_softened"),     # ฟิลเลอร์ร่องแก้ม
    "4.2": ("polish", "under_eye_skin"),    # ฟิลเลอร์ใต้ตา
    "6.1": ("polish", "eyelid_fold"),       # ตาสองชั้น
    "6.2": ("polish", "eyelid_fold"),       # ตาชั้นหลบ
    "6.6": ("polish", "eyelid_fold_build"), # ศัลยกรรมแก้ตา -- the old fold is flattened, a new one drawn
    "6.7": ("polish", "under_eye_skin"),    # ผ่าตัดถุงใต้ตา
    "10.2": ("fill", "hairline"),           # ปลูกผม -- nothing is drawn to keep, so the mask builds it
    "10.3": ("polish", "facial_hair"),      # ปลูกหนวด เครา คิ้ว
    "11.2": ("polish", "hair_removed"),     # เลเซอร์กำจัดขนบนหน้า
    "14.8": ("polish", "dimple_fold"),      # ศัลยกรรมลักยิ้ม
})


# What a drawn row falls back to when REFINE_PLANS names nothing better. Its prompt is written to
# preserve what stage 1 drew rather than to invent a feature, which is what makes it safe to apply
# to every row rather than to a hand-picked twelve.
DEFAULT_REFINE_PLAN = ("polish", "surface_polish")


def render_kind(procedure: "ProcedureSpec") -> str:
    """What this row does to the photograph: `shape`, `surface`, or `shape_surface`.

    Read off the pipeline, which is the only thing that decides it. The catalog already carried a
    second answer to the same question -- `technique`, whose values are the strings data.txt used
    for its own build stages: `dd2`, `test` and `Hybrid`. Those were being printed on the procedure
    card, so a customer choosing laser skin tightening was shown a chip reading "test".

    They were never wrong, only unreadable: across all 72 renderable rows `dd2` is exactly the
    warp-only set, `test` exactly the surface-only set and `Hybrid` exactly the mixed one, which is
    what `test_render_kind_agrees_with_the_source_technique_label` holds them to. So this is not a
    new claim, it is the same one said in words -- and derived from the pipeline rather than from a
    spreadsheet column, so a row whose steps change cannot keep a stale label.
    """
    warps = any(step.type == OpType.WARP_OP for step in procedure.pipeline)
    draws = draws_surface(procedure)
    if warps and draws:
        return "shape_surface"
    return "shape" if warps else "surface"


def draws_surface(procedure: "ProcedureSpec") -> bool:
    """True when this row paints pixels rather than only displacing them.

    The distinction is the whole basis for who gets refined. A warp resamples skin that was really
    photographed, so its output is already a photograph; the four surface primitives synthesise
    what they write, and a synthesised region is what reads as painted next to real skin.
    """
    return any(step.type != OpType.WARP_OP for step in procedure.pipeline)


def refine_plan(procedure: "ProcedureSpec") -> tuple[str, str] | None:
    """The hosted refinement this row asks for, or None when nothing was drawn to refine.

    Every OpenCV-drawn row gets one. The named plans win where a feature-specific prompt does
    better; everything else takes the preserving default, so a tone pass over a cheek is no longer
    left looking like a flat patch just because nobody wrote an entry for it.
    """
    return REFINE_PLANS.get(procedure.source_ref) or (
        DEFAULT_REFINE_PLAN if draws_surface(procedure) else None)


_FILLER_QUANTITIES = (
    "ประมาณ 0.5 - 1.0 cc", "ประมาณ 1.0 cc", "ประมาณ 1.5 - 2.0 cc",
    "ประมาณ 2.5 cc", "ประมาณ 3.5+ cc",
)
_BOTOX_QUANTITIES = ("ประมาณ 15u", "ประมาณ 25u", "ประมาณ 50u", "ประมาณ 65u", "ประมาณ 80+u")
_MILLIMETRE_QUANTITIES = (
    "ประมาณ 0.5 mm", "ประมาณ 1.0 mm", "ประมาณ 2.0 mm", "ประมาณ 3.0 mm", "ประมาณ 4.0+ mm",
)
QUANTITY_NOTES_TH = MappingProxyType({
    **{ref: _BOTOX_QUANTITIES for ref in ("3.1", "3.2", "3.4")},
    **{ref: _FILLER_QUANTITIES for ref in ("4.1", "4.2", "4.3", "4.4", "4.5", "4.6")},
    **{ref: _MILLIMETRE_QUANTITIES for ref in ("5.1", "5.2", "5.3", "5.6", "7.1", "7.2", "7.3", "7.4")},
})


def canonical_technique(raw: str) -> str:
    if raw == "N/A":
        return "N/A"
    if raw == "-":
        return "N/A"
    if raw == "dd2":
        return "dd2"
    if raw == "test":
        return "test"
    return "Hybrid"


@dataclass(frozen=True, slots=True)
class ProcedureSpec:
    id: str
    source_ref: str
    category: str
    name_th: str
    pipeline: tuple[Step, ...]
    views: tuple[str, ...] = ALL_VIEWS
    supported: bool = True
    unsupported_reason: str = ""
    intensity_mode: str = "discrete"
    quantity_notes_th: tuple[str, ...] = ()

    def public(self, include_pipeline: bool = False) -> dict:
        technique_raw = TECHNIQUE_BY_REF[self.source_ref]
        available = self.supported and technique_raw != "-"
        category_th, category_en = CATEGORIES[self.category]
        result = {
            "id": self.source_ref,
            "category_id": CATEGORY_NUMBERS[self.category],
            "category_name_th": category_th,
            "category_name_en": category_en,
            "name_th": self.name_th,
            # Falls back to the Thai rather than to an empty string or the slug: a client rendering
            # an English locale would otherwise show a blank row or `hifu-lift`, and a Thai name in
            # an English list is at least a name a clinic would recognise.
            "name_en": NAMES_EN.get(self.id, self.name_th),
            "technique_raw": technique_raw,
            "technique": canonical_technique(technique_raw),
            # What the renderer does, for the chip on the card. `technique` above answers the same
            # question in data.txt's own vocabulary and is kept for the audit against that file;
            # it is not a display string and reads as a bug when shown to a customer.
            "render_kind": render_kind(self) if self.pipeline else None,
            "available": available,
            "intensity_mode": self.intensity_mode if available else "unavailable",
            # Read from the row's own `unsupported_reason` first. The reason used to be inferred
            # from the technique column, which answers a different question and could only ever
            # produce one sentence: every unavailable row was "outside the scope of a face
            # photograph", including the ones retired because they have no visible effect *on* a
            # face, which is the opposite claim.
            "unavailable_reason": (
                UNAVAILABLE_REASONS.get(self.unsupported_reason)
                or ("ต้องระบุหัตถการย่อย" if technique_raw == "-" else None)
            ),
            # Which of the scan's three photographs this shows a change on. A chin projection or a
            # bridge height is a displacement along the face's forward axis: on a profile it is the
            # whole point, and from straight on the camera looks down that axis and sees almost
            # nothing move. The catalog has always recorded that in `views`; nothing read it, so a
            # client offered the procedure on the front view and rendered an identical picture.
            "views": [view for view in RENDERED_VIEWS if view in self.views],
            # The parts of the face this actually touches, in the order the pipeline touches them.
            # A client aiming a viewer at "the thing that is about to change" cannot get there from
            # the category: lip filler and cheek filler are both category 4, and pointing the camera
            # at the category's own area sends one of them to the wrong half of the face. These are
            # the renderer's own region names, not a display vocabulary -- deciding which of them is
            # worth looking at is the client's call.
            "regions": list(dict.fromkeys(step.region for step in self.pipeline)),
        }
        if available and self.intensity_mode == "variable":
            result["intensity_levels"] = [
                {
                    **dict(level),
                    "quantity_note_th": self.quantity_notes_th[index] if self.quantity_notes_th else None,
                }
                for index, level in enumerate(INTENSITY_LEVELS)
            ]
            result["quantity_note_th"] = self.quantity_notes_th[2] if self.quantity_notes_th else None
        if include_pipeline:
            result["pipeline"] = [step.public() for step in self.pipeline]
        return result


def _step(op: OpType, region: str, **params) -> Step:
    return Step(op, region, params)


def W(region: str, control: str, value: float) -> Step:
    return _step(OpType.WARP_OP, region, control=control, value=value)


def S(region: str, groove: float = .12, ridge: float = .07, **params) -> Step:
    return _step(OpType.SHADE_OP, region, groove_depth=groove, ridge_lift=ridge, **params)


def F(region: str, strength: float = .45, **params) -> Step:
    return _step(OpType.FLATTEN_OP, region, strength=strength, **params)


def T(region: str, strength: float = .4, **params) -> Step:
    return _step(OpType.TONE_OP, region, strength=strength, **params)


def I(region: str, mode: str = "remove", strength: float = .6, **params) -> Step:
    return _step(OpType.INPAINT_OP, region, mode=mode, strength=strength, **params)


# English names, keyed by the internal slug rather than the public numeric ref, because the slug is
# the stable half: `source_ref` is data.txt's numbering and moves if that document is renumbered.
#
# A side table rather than a fifth argument to `P()`: the ninety-two call sites below are the audit
# trail against data.txt, and widening their signature to carry a translation would put an editorial
# concern inside the record. `QUANTITY_NOTES_TH` is keyed off to the side for the same reason.
#
# Mostly recovered rather than translated -- the slug already encodes the English term, so the work
# is restoring the brand names the slug drops (อัลเทอร่า → Ultherapy, เทอร์มาจ → Thermage,
# อินโหมด → InMode, ออนดา → Onda, จูวีลุค → Juvelook). Clinical naming still deserves a review by
# someone who treats patients; the Thai column remains authoritative where the two disagree.
NAMES_EN = MappingProxyType({
    # lifting
    "hifu-lift": "Ultherapy / HIFU lift",
    "rf-tightening": "Thermage / InMode RF tightening",
    "laser-tightening": "Titanium laser tightening",
    "microwave-tightening": "Onda microwave tightening",
    "thread-lift": "Thread lift",
    "facelift": "Facelift surgery",
    "body-lift": "Body lifting",
    "body-proportion-lift": "Body proportion lifting",
    "other-face-tightening": "Other facial tightening",
    # skin
    "rejuran-skin-booster": "Rejuran skin booster",
    "collagen-booster": "Juvelook collagen booster",
    "ecm-booster": "ECM skin regeneration injection",
    "pigmentation-treatment": "Melasma, freckle and dark spot treatment",
    "pores-acne-scars": "Pore and acne scar reduction",
    "vascular-redness": "Redness and visible capillary treatment",
    "mole-wart-removal": "Laser removal of moles, warts and skin tags",
    "ldm-soothing": "LDM skin soothing",
    "facial-peel": "Facial chemical peel",
    "acne-treatment": "Acne treatment",
    "body-skin-tone": "Body skin tone treatment",
    # botox
    "facial-botox": "Masseter botulinum toxin (jaw slimming)",
    "wrinkle-botox": "Wrinkle botulinum toxin",
    "body-botox": "Body botulinum toxin",
    "dermotoxin": "Skin botulinum toxin (dermotoxin)",
    "sweat-botox": "Botulinum toxin for sweating",
    "allergy-botox": "Botulinum toxin for allergy",
    # filler
    "nasolabial-filler": "Nasolabial fold filler",
    "tear-trough-filler": "Tear trough filler",
    "temple-forehead-filler": "Temple and forehead filler",
    "lip-filler": "Lip filler",
    "chin-filler": "Chin filler",
    "aegyo-sal-filler": "Aegyo sal (under-eye) filler",
    "body-filler": "Body filler",
    "filler-dissolving": "Filler dissolving",
    # nose
    "nose-tip-plasty": "Nasal tip plasty",
    "nose-bridge-surgery": "Nasal bridge augmentation / hump reduction",
    "alar-reduction": "Alar base reduction",
    "revision-rhinoplasty": "Revision rhinoplasty",
    "septoplasty-visible": "Septoplasty for a deviated septum",
    "non-surgical-rhinoplasty": "Non-surgical rhinoplasty",
    # eyes
    "double-eyelid": "Double eyelid surgery",
    "hidden-eyelid-fold": "Hidden (inner) double eyelid fold",
    "ptosis-correction": "Ptosis correction",
    "epicanthoplasty": "Epicanthoplasty (inner corner)",
    "lateral-canthoplasty": "Lateral canthoplasty (outer corner)",
    "revision-eyelid": "Revision double eyelid surgery",
    "lower-blepharoplasty": "Lower blepharoplasty (under-eye bags)",
    "sub-brow-lift": "Sub-brow excision of excess upper eyelid skin",
    # contour
    "v-line-jaw": "V-line jaw reduction",
    "genioplasty": "Genioplasty (chin surgery)",
    "zygoma-reduction": "Zygoma (cheekbone) reduction",
    "two-jaw-surgery": "Two-jaw (orthognathic) surgery",
    "revision-facial-contour": "Revision facial contouring",
    "forehead-augmentation": "Forehead augmentation",
    "endotine-forehead-lift": "Endotine forehead and brow lift",
    "noble-surgery": "Nasolabial fold augmentation",
    "temple-augmentation": "Temple augmentation",
    "occipital-augmentation": "Occipital augmentation",
    # breast
    "breast-augmentation-lift": "Breast augmentation and lift",
    "revision-breast-surgery": "Revision breast surgery",
    "nipple-areola-surgery": "Nipple and areola surgery",
    "gynecomastia": "Gynecomastia treatment",
    # fat
    "meso-fat-face": "Mesotherapy fat dissolving for cheeks and double chin",
    "body-liposuction": "Body liposuction",
    "facial-liposuction": "Facial and submental liposuction",
    "facial-fat-grafting": "Facial fat grafting",
    "revision-liposuction": "Revision liposuction",
    "facial-fat-dissolving": "Targeted fat dissolving",
    "facial-weight-loss": "Weight loss programme",
    # hair
    "scalp-care": "Scalp care",
    "hairline-transplant": "Hair and hairline transplant",
    "facial-hair-transplant": "Moustache, beard and eyebrow transplant",
    "body-hair-transplant": "Body hair transplant",
    # hair_removal
    "body-hair-removal": "Body hair removal",
    "facial-hair-removal": "Facial laser hair removal",
    # traditional
    "korean-weight-herbs": "Korean herbal weight-loss medicine",
    "facial-acupuncture": "Cosmetic facial acupuncture",
    "korean-health-herbs": "Korean herbal skin tonic",
    # other
    "iv-vitamins": "IV vitamin skin drip",
    "tattoo-removal": "Tattoo and cosmetic brow tattoo removal",
    "cosmetic-tattoo": "Cosmetic brow and lip tattoo",
    "womens-surgery": "Women's surgery",
    "lip-lift": "Upper lip lift",
    "lip-surgery": "Lip surgery",
    "laser-vision-correction": "Laser vision correction",
    "dimpleplasty": "Dimpleplasty",
    "otoplasty": "Otoplasty (prominent ears)",
    "body-odour-hyperhidrosis": "Body odour and hyperhidrosis treatment",
    "body-contouring": "Body contouring surgery",
    "nerve-block-visible-relief": "Nerve block for jaw slimming",
    "mens-facial-surgery": "Men's facial surgery",
    "unspecified-other": "Other procedure",
})


# What an unavailable row says for itself, keyed by `ProcedureSpec.unsupported_reason`.
UNAVAILABLE_REASONS = MappingProxyType({
    "outside_face_image_scope": "หัตถการนอกขอบเขตใบหน้า",
    "no_visible_face_effect": "ไม่มีผลที่เห็นได้ในภาพถ่ายใบหน้า จึงไม่จำลองให้",
})


def P(id: str, ref: str, category: str, name: str, *pipeline: Step,
      views: tuple[str, ...] = ALL_VIEWS) -> ProcedureSpec:
    return ProcedureSpec(
        id, ref, category, name, tuple(pipeline), views,
        intensity_mode="variable" if ref in VARIABLE_PROCEDURE_REFS else "discrete",
        quantity_notes_th=QUANTITY_NOTES_TH.get(ref, ()),
    )


def X(id: str, ref: str, category: str, name: str, reason: str = "outside_face_image_scope") -> ProcedureSpec:
    return ProcedureSpec(id, ref, category, name, (), (), False, reason, "unavailable")


# The order is the order in data.txt. Similar treatments intentionally share identical step
# compositions; their different clinical names are metadata, not justification for new code.
PROCEDURES = (
    P("hifu-lift", "1.1", "lifting", "ยกกระชับอัลเทอร่า / ไฮฟู",
      W("jaw", "hifuLifting", 59), W("jaw", "jawDefinition", 34), F("nasolabial", 0.35)),
    P("rf-tightening", "1.2", "lifting", "ยกกระชับเทอร์มาจ / อินโหมด",
      W("lower_face", "cheekFiller", -34), F("lower_face", .32)),
    P("laser-tightening", "1.3", "lifting", "เลเซอร์ยกกระชับไทเทเนียม",
      F("face_skin", .28), T("face_skin", .24, l_delta=7)),
    P("microwave-tightening", "1.4", "lifting", "ยกกระชับออนดา คลื่นไมโครเวฟ",
      W("jaw", "jawDefinition", 36), F("lower_face", .30)),
    P("thread-lift", "1.5", "lifting", "ร้อยไหมยกกระชับ", W("jaw", "hifuLifting", 53)),
    P("facelift", "1.6", "lifting", "ผ่าตัดดึงหน้า",
      W("lower_face", "hifuLifting", 81), W("cheeks", "nasolabialLift", 53), F("lower_face", .35)),
    X("body-lift", "1.7", "lifting", "ยกกระชับร่างกาย"),
    X("body-proportion-lift", "1.8", "lifting", "ยกกระชับสัดส่วนร่างกาย"),
    P("other-face-tightening", "1.9", "lifting", "ยกกระชับใบหน้าแบบอื่น",
      W("jaw", "hifuLifting", 39), F("face_skin", .25)),

    P("rejuran-skin-booster", "2.1", "skin", "ฉีดสกินบูสเตอร์ รีจูราน",
      F("face_skin", .22), T("face_skin", .28, l_delta=8)),
    P("collagen-booster", "2.2", "skin", "ฉีดคอลลาเจนบูสเตอร์ จูวีลุค",
      F("face_skin", .34), T("face_skin", .22, l_delta=5)),
    P("ecm-booster", "2.3", "skin", "ฉีดฟื้นฟูผิว ECM", F("face_skin", .30)),
    P("pigmentation-treatment", "2.4", "skin", "รักษาฝ้า กระ จุดด่างดำ",
      T("face_skin", .42, selector="pigment", neutralize=True, l_delta=5)),
    P("pores-acne-scars", "2.5", "skin", "ลดรูขุมขนและรอยสิว", F("cheeks", .35)),
    P("vascular-redness", "2.6", "skin", "รักษาผิวแดง เส้นเลือดฝอย", T("cheeks", .46, selector="redness", a_delta=-14)),
    P("mole-wart-removal", "2.7", "skin", "เลเซอร์กำจัดไฝ หูด ติ่งเนื้อ", I("face_skin", strength=.45)),
    P("ldm-soothing", "2.8", "skin", "ฟื้นบำรุงผิว LDM", T("face_skin", .34, a_delta=-8)),
    P("facial-peel", "2.9", "skin", "ผลัดเซลล์ผิวหน้า", T("face_skin", .35, l_delta=12)),
    P("acne-treatment", "2.10", "skin", "รักษาสิว", I("face_skin", strength=.34), T("face_skin", .25, a_delta=-7)),
    X("body-skin-tone", "2.11", "skin", "ปรับสีผิวร่างกาย"),

    P("facial-botox", "3.1", "botox", "โบท็อกซ์ลดกราม",
      W("jaw", "jawBotox", 64), W("jaw", "hifuLifting", 28)),
    P("wrinkle-botox", "3.2", "botox", "โบท็อกซ์ลดริ้วรอย",
      F("forehead", 0.35), F("outer_eyes", 0.35)),
    X("body-botox", "3.3", "botox", "โบท็อกซ์ร่างกาย"),
    P("dermotoxin", "3.4", "botox", "สกินโบท็อกซ์", F("face_skin", .28)),
    X("sweat-botox", "3.5", "botox", "โบท็อกซ์ลดเหงื่อ"),
    X("allergy-botox", "3.6", "botox", "โบท็อกซ์ลดภูมิแพ้", "no_visible_face_effect"),

    P("nasolabial-filler", "4.1", "filler", "ฟิลเลอร์ร่องแก้ม", F("nasolabial", 0.35)),
    P("tear-trough-filler", "4.2", "filler", "ฟิลเลอร์ใต้ตา",
      F("under_eyes", 0.35), T("under_eyes", .20, l_delta=7)),
    P("temple-forehead-filler", "4.3", "filler", "ฟิลเลอร์ขมับและหน้าผาก",
      T("temples", .35, l_delta=8), T("forehead", .28, l_delta=5)),
    P("lip-filler", "4.4", "filler", "ฟิลเลอร์ริมฝีปาก",
      W("lips", "lipVolume", 59), S("lips", 0.09, 0.15)),
    P("chin-filler", "4.5", "filler", "ฟิลเลอร์คาง",
      W("chin", "chinLength", 36), W("chin", "chinProjection", 56), views=PROFILES),
    P("aegyo-sal-filler", "4.6", "filler", "ฟิลเลอร์ไข่มุกใต้ตา",
      S("aegyo_sal", 0.15, 0.18, offset_share=.006), views=FRONT),
    X("body-filler", "4.7", "filler", "ฟิลเลอร์ร่างกาย"),
    P("filler-dissolving", "4.8", "filler", "สลายฟิลเลอร์",
      F("face_skin", .22), W("lips", "lipVolume", -28)),

    P("nose-tip-plasty", "5.1", "nose", "ศัลยกรรมปลายจมูก",
      W("nose", "noseTipDrop", -53), views=PROFILES),
    P("nose-bridge-surgery", "5.2", "nose", "เสริมสันจมูก / ตะไบฮัมพ์",
      W("nose_bridge", "noseBridgeHeight", 62), S("nose_bridge", 0.075, 0.165), views=PROFILES),
    P("alar-reduction", "5.3", "nose", "ตัดปีกจมูก", W("nose_alar", "noseWingSlim", 59)),
    P("revision-rhinoplasty", "5.4", "nose", "ศัลยกรรมแก้จมูก",
      W("nose", "noseBridgeHeight", 42), F("nose", .30)),
    P("septoplasty-visible", "5.5", "nose", "ผ่าตัดแก้ผนังกั้นจมูกคด",
      W("nose_bridge", "noseWingSlim", 25), views=FRONT),
    P("non-surgical-rhinoplasty", "5.6", "nose", "เสริมจมูกไม่ผ่าตัด",
      W("nose_bridge", "noseBridgeHeight", 39), S("nose_bridge", 0.06, 0.135), views=PROFILES),

    P("double-eyelid", "6.1", "eyes", "ทำตาสองชั้น", S("eyelid_crease", 0.24, 0.12), views=FRONT),
    P("hidden-eyelid-fold", "6.2", "eyes", "ทำตาสองชั้น ชั้นในเตี้ย",
      S("eyelid_crease", 0.15, 0.075, offset_share=.003), views=FRONT),
    P("ptosis-correction", "6.3", "eyes", "แก้หนังตาตก", W("upper_eyelids", "eyeOpening", 48)),
    P("epicanthoplasty", "6.4", "eyes", "เปิดหัวตา", W("upper_eyelids", "eyeOpening", 31)),
    P("lateral-canthoplasty", "6.5", "eyes", "เปิดหางตา", W("outer_eyes", "canthalTiltLift", 45)),
    P("revision-eyelid", "6.6", "eyes", "ศัลยกรรมแก้ตาสองชั้น",
      F("upper_eyelids", 0.35), S("eyelid_crease", 0.195, 0.105), views=FRONT),
    P("lower-blepharoplasty", "6.7", "eyes", "ผ่าตัดถุงใต้ตา", F("under_eyes", 0.35)),
    P("sub-brow-lift", "6.8", "eyes", "ตัดหนังตาบนส่วนเกิน",
      W("brows", "browHeight", 31), F("upper_eyelids", 0.35)),

    P("v-line-jaw", "7.1", "contour", "ตัดกราม วีไลน์", W("jaw", "jawBotox", 87)),
    P("genioplasty", "7.2", "contour", "ศัลยกรรมคาง",
      W("chin", "chinProjection", 67), W("chin", "chinTaper", 56)),
    P("zygoma-reduction", "7.3", "contour", "ยุบโหนกแก้ม", W("cheeks", "cheekboneReduction", 73)),
    P("two-jaw-surgery", "7.4", "contour", "ศัลยกรรมขากรรไกร",
      W("jaw", "jawDefinition", 56), W("chin", "chinProjection", 50)),
    P("revision-facial-contour", "7.5", "contour", "ศัลยกรรมแก้โครงหน้า", W("lower_face", "jawDefinition", 48)),
    P("forehead-augmentation", "7.6", "contour", "เสริมหน้าผาก",
      W("forehead", "browHeight", 22), T("forehead", .30, l_delta=8)),
    P("endotine-forehead-lift", "7.7", "contour", "ดึงหน้าผากและคิ้ว", W("brows", "browHeight", 59)),
    P("noble-surgery", "7.8", "contour", "เสริมร่องแก้ม", F("nasolabial", 0.35)),
    P("temple-augmentation", "7.9", "contour", "เสริมขมับ",
      W("temples", "cheekFiller", 31), T("temples", .34, l_delta=9)),
    X("occipital-augmentation", "7.10", "contour", "เสริมท้ายทอย"),

    X("breast-augmentation-lift", "8.1", "breast", "เสริมหน้าอก"),
    X("revision-breast-surgery", "8.2", "breast", "ศัลยกรรมแก้ไขหน้าอก"),
    X("nipple-areola-surgery", "8.3", "breast", "ศัลยกรรมหัวนม"),
    X("gynecomastia", "8.4", "breast", "รักษาภาวะเต้านมโตในผู้ชาย"),

    P("meso-fat-face", "9.1", "fat", "ฉีดสลายไขมันแก้มและเหนียง", W("lower_face", "jawDefinition", 48)),
    X("body-liposuction", "9.2", "fat", "ดูดไขมันร่างกาย"),
    P("facial-liposuction", "9.3", "fat", "ดูดไขมันกรอบหน้าและเหนียง",
      W("lower_face", "jawDefinition", 64)),
    P("facial-fat-grafting", "9.4", "fat", "ฉีดไขมันเติมเต็มใบหน้า",
      W("cheeks", "cheekFiller", 53), T("cheeks", .26, l_delta=7)),
    P("revision-liposuction", "9.5", "fat", "ดูดไขมันแก้ไข", W("jaw", "jawDefinition", 39), F("lower_face", .30)),
    P("facial-fat-dissolving", "9.6", "fat", "สลายไขมันเฉพาะจุด", W("lower_face", "jawDefinition", 42)),
    P("facial-weight-loss", "9.7", "fat", "ลดน้ำหนัก", W("lower_face", "jawBotox", 48)),

    P("scalp-care", "10.1", "hair", "ดูแลหนังศีรษะ", T("hairline", .28, a_delta=-7)),
    P("hairline-transplant", "10.2", "hair", "ปลูกผมและไรผม", I("hairline", "hair", .72, density=.25)),
    P("facial-hair-transplant", "10.3", "hair", "ปลูกหนวด เครา คิ้ว",
      I("facial_hair", "hair", .68, density=.22, angle=1.2)),
    X("body-hair-transplant", "10.4", "hair", "ปลูกขนร่างกาย"),

    X("body-hair-removal", "11.1", "hair_removal", "กำจัดขนร่างกาย"),
    P("facial-hair-removal", "11.2", "hair_removal", "เลเซอร์กำจัดขนบนใบหน้า", I("facial_hair", strength=.50)),

    P("korean-weight-herbs", "12.1", "traditional", "ยาสมุนไพรเกาหลีลดน้ำหนัก", W("lower_face", "jawBotox", 36)),
    P("facial-acupuncture", "12.2", "traditional", "ฝังเข็มความงาม",
      W("jaw", "hifuLifting", 25), T("face_skin", .22, l_delta=5)),
    # Retired from the renderable set, with 2.24 below and 14.1 further down, because the tone it
    # asked for cannot be seen on any face. `tone_op` scales its delta by the step strength, so
    # .24 x 4 is a 0.96-unit lift in L -- under one step of a 0-100 channel, against a 3-step
    # threshold. Measured on two different scans it moved 72 pixels on one and none at all on the
    # other. Raising the number would have made it visible; nothing in the catalog says a herbal
    # skin tonic lightens a face by a measurable amount, so there is nothing to raise it to.
    X("korean-health-herbs", "12.3", "traditional", "ยาสมุนไพรเกาหลีบำรุงผิว", "no_visible_face_effect"),

    # Category 13 (ฟันและช่องปาก) is retired: the mouth interior is not something a face-landmark
    # mask can address honestly, and dentistry is outside what this product claims to simulate.

    # .18 x 4 = 0.72 units of L. Zero pixels cleared the visibility threshold on either scan
    # tested -- the render returned the photograph, spent a preview to do it, and the screen had
    # no way to tell that apart from a broken renderer. See 12.3 above.
    X("iv-vitamins", "14.1", "other", "ให้วิตามินผิวทางหลอดเลือด", "no_visible_face_effect"),
    P("tattoo-removal", "14.2", "other", "ลบรอยสักและสักคิ้ว", I("brows", strength=.58)),
    P("cosmetic-tattoo", "14.3", "other", "สักคิ้วและสักปาก",
      I("brows", "brow_hair", .64, density=.30), T("lips", .24, a_delta=7)),
    X("womens-surgery", "14.4", "other", "ศัลยกรรมสำหรับผู้หญิง"),
    P("lip-lift", "14.5", "other", "ยกริมฝีปากบน", W("lips", "cupidBowSharpness", 53)),
    P("lip-surgery", "14.6", "other", "ศัลยกรรมริมฝีปาก",
      W("lips", "cupidBowSharpness", 59), W("lips", "lipVolume", 34), S("lips", 0.09, 0.12)),
    X("laser-vision-correction", "14.7", "other", "แก้ไขสายตา", "no_visible_face_effect"),
    P("dimpleplasty", "14.8", "other", "ศัลยกรรมลักยิ้ม", S("dimples", 0.225, 0.12), views=FRONT),
    P("otoplasty", "14.9", "other", "ศัลยกรรมหูกาง", W("ears", "cheekboneReduction", 31)),
    X("body-odour-hyperhidrosis", "14.10", "other", "รักษาเหงื่อและกลิ่นตัว", "no_visible_face_effect"),
    X("body-contouring", "14.11", "other", "ศัลยกรรมปรับรูปร่าง"),
    P("nerve-block-visible-relief", "14.12", "other", "บล็อกเส้นประสาทลดกราม",
      W("jaw", "jawBotox", 48)),
    P("mens-facial-surgery", "14.13", "other", "ศัลยกรรมสำหรับผู้ชาย", W("jaw", "jawDefinition", 42), T("face_skin", .16, l_delta=3)),
    X("unspecified-other", "14.14", "other", "หัตถการอื่น ๆ", "procedure_not_specific_enough"),
)

BY_ID = MappingProxyType({procedure.id: procedure for procedure in PROCEDURES})
BY_SOURCE_REF = MappingProxyType({procedure.source_ref: procedure for procedure in PROCEDURES})

if len(PROCEDURES) != 92 or len(BY_ID) != 92 or len(BY_SOURCE_REF) != 92:
    raise RuntimeError("data.txt catalog must contain exactly 92 unique records")
if set(TECHNIQUE_BY_REF) != set(BY_SOURCE_REF):
    raise RuntimeError("data.txt technique map must cover all 92 records exactly")
if any(step.type not in PRIMITIVE_TYPES for procedure in PROCEDURES for step in procedure.pipeline):
    raise RuntimeError("procedure catalog contains a non-atomic operation")
if any(procedure.category not in CATEGORIES for procedure in PROCEDURES):
    raise RuntimeError("procedure catalog contains an unknown category")
if any(procedure.supported != bool(procedure.pipeline) for procedure in PROCEDURES):
    raise RuntimeError("supported procedure and pipeline closure failed")
if any(procedure.intensity_mode not in {"variable", "discrete", "unavailable"} for procedure in PROCEDURES):
    raise RuntimeError("unknown procedure intensity mode")
if any((procedure.intensity_mode == "unavailable") != (not procedure.supported) for procedure in PROCEDURES):
    raise RuntimeError("procedure intensity availability mismatch")
if any(procedure.quantity_notes_th and len(procedure.quantity_notes_th) != 5 for procedure in PROCEDURES):
    raise RuntimeError("procedure quantity notes must cover all five intensity levels")


# --------------------------------------------------------------------------------------------
# Which procedures move which measured proportion.
#
# THIS TABLE IS A CLINICAL MAPPING AND IS MEANT TO BE REVIEWED AS ONE. Everything else in this
# file describes what a procedure does to an image; this says what it does to a number a person
# was scored on, which is the step where a measurement turns into something a user reads as a
# suggestion. It is deliberately one table in one place rather than a field spread across
# `metric_catalog`, so reviewing it means reading eleven lines rather than auditing 85 rows.
#
# Only the twelve measurements `reference_scoring` has a published mean for can appear here — a
# procedure attached to a measurement with no reference has nothing to be "off" from.
#
# `direction` is which way the procedure moves the measurement, and it is why the rows are not
# simply "nose procedures for nose measurements": alar reduction only narrows, lip filler only
# adds. Offering a narrowing procedure to someone already below the reference is the specific
# mistake this field exists to prevent. "either" is for procedures that reshape in both
# directions depending on how they are performed.
#
# Seven of the twelve are absent on purpose. `midface_height`, `lower_face_height`,
# `upper_lip_length`, `intercanthal`, `nasofrontal_angle`, `nasolabial_angle` and
# `facial_convexity_angle` have nothing in this catalogue that moves them, and inventing a row
# so the screen looks complete would be inventing a treatment.
# --------------------------------------------------------------------------------------------

#: "lower" narrows/shortens the measurement, "raise" widens/lengthens it, "either" does both.
MEASUREMENT_PROCEDURES = MappingProxyType({
    "alar_width": (("5.3", "lower"), ("5.4", "either"), ("5.1", "either")),
    "eye_fissure": (("6.4", "raise"), ("6.5", "raise"), ("6.3", "raise")),
    "upper_vermillion": (("4.4", "raise"), ("14.5", "raise"), ("14.6", "either")),
    "lower_vermillion": (("4.4", "raise"), ("14.6", "either")),
    "chin_height": (("7.2", "either"), ("4.5", "raise")),
})

if any(ref not in BY_SOURCE_REF for refs in MEASUREMENT_PROCEDURES.values() for ref, _ in refs):
    raise RuntimeError("MEASUREMENT_PROCEDURES names a procedure that is not in the catalog")
if any(direction not in {"raise", "lower", "either"}
       for refs in MEASUREMENT_PROCEDURES.values() for _, direction in refs):
    raise RuntimeError("unknown direction in MEASUREMENT_PROCEDURES")

#: Whether the table above is allowed off the server. False, and false on purpose.
#
# The table is the one place in this codebase that says a named surgical or injectable procedure
# relates to a number a specific person was scored on, and no clinician has ever read it. That was
# survivable while nothing was sold. It is not survivable now: on a product a customer has paid
# for, a procedure printed beside their own measurement reads as advice no matter which caption
# sits under it, and the caption is the only thing currently standing between the two. So the rows
# stay on the server until a doctor has reviewed them and signed off.
#
# This is a product decision, not a bug and not a broken import. The table itself is intact, both
# consistency checks above still run against it every time this module loads, and the tests that
# describe its behaviour are skipped rather than deleted so they come straight back.
#
# To turn it back on after review: set this to True. Nothing else. `procedures_for_measurement`
# is the only reader, so the assessment findings and the development plan go dark together and
# come back together, and cannot end up disagreeing about whether the mapping is reviewed.
MEASUREMENT_PROCEDURES_REVIEWED_BY_CLINICIAN = False


def procedures_for_measurement(key: str, direction: str | None = None) -> tuple[ProcedureSpec, ...]:
    """The procedures that move one measured proportion, optionally only one way.

    `direction` is the way the measurement needs to go — "lower" for a value above the reference
    that should come down. A procedure marked "either" is offered whichever way is asked for.

    Answers with nothing at all while `MEASUREMENT_PROCEDURES_REVIEWED_BY_CLINICIAN` is False. The
    gate lives here rather than in the two callers, and here rather than in either client, because
    a client-side hide still ships the mapping in the JSON where anyone can read it — and because
    one gate cannot disagree with itself the way two would. Callers already handle an empty answer:
    it is the same answer the seven unmapped measurements have always produced.
    """
    if not MEASUREMENT_PROCEDURES_REVIEWED_BY_CLINICIAN:
        return ()
    rows = MEASUREMENT_PROCEDURES.get(key, ())
    return tuple(BY_SOURCE_REF[ref] for ref, moves in rows
                 if direction is None or moves in ("either", direction))


def resolve_procedure(procedure_id: object) -> ProcedureSpec | None:
    """Resolve the numeric public ID, with the retired slug retained as an input-only alias."""
    key = str(procedure_id or "").strip()
    return BY_SOURCE_REF.get(key) or BY_ID.get(key)


def facial_categories() -> tuple[str, ...]:
    """The categories that still have something to offer once body rows are dropped.

    Derived, not listed: a category is facial when any row in it can actually be rendered. Today
    that removes `breast` and nothing else, and it keeps working if a row's support changes.
    """
    return tuple(key for key in CATEGORIES
                 if any(p.category == key and p.supported for p in PROCEDURES))


def public_catalog(*, category: str | None = None, include_pipeline: bool = False,
                   include_unavailable: bool = False) -> list[dict]:
    """The catalog as a client sees it: by default, only what the simulator can render.

    The 92 rows stay in `PROCEDURES` whatever this returns. They are the audit trail against
    data.txt -- every row in the source document is present and accounted for, including the ones
    that are out of scope, and dropping them from the table would turn "we considered this and it
    is not a face" into "we never heard of it". The filter belongs here, at the boundary, where it
    is a presentation choice rather than a hole in the record.

    `include_unavailable=True` returns all 92 for that audit.
    """
    category_key = None
    if category is not None:
        raw = str(category).strip()
        category_key = next(
            (key for key, number in CATEGORY_NUMBERS.items() if raw in {key, str(number)}),
            None,
        )
        if category_key is None:
            raise ValueError("unknown_procedure_category")
    return [procedure.public(include_pipeline) for procedure in PROCEDURES
            if (category_key is None or procedure.category == category_key)
            and (include_unavailable or procedure.supported)]


def validate_procedure_selections(selections: object) -> tuple[ProcedureSpec, ...]:
    if not isinstance(selections, list) or not selections:
        raise ValueError("empty_selections")
    if len(selections) > 12:
        raise ValueError("too_many_selections")
    resolved: dict[str, ProcedureSpec] = {}
    for selection in selections:
        if (not isinstance(selection, dict)
                or set(selection) - {"procedure_id", "intensity_level"}
                or "procedure_id" not in selection):
            raise ValueError("invalid_selection")
        procedure = resolve_procedure(selection["procedure_id"])
        if procedure is None:
            raise ValueError("unknown_procedure")
        technique = TECHNIQUE_BY_REF[procedure.source_ref]
        if not procedure.supported or technique in {"N/A", "-"}:
            raise ValueError(f"procedure_out_of_scope:{procedure.source_ref}")
        resolved[procedure.source_ref] = procedure
    return tuple(resolved.values())


def compile_warp_sliders(procedures: Iterable[ProcedureSpec], levels: Iterable[int] | None = None) -> dict[str, float]:
    procedures = tuple(procedures)
    resolved_levels = tuple(levels) if levels is not None else (3,) * len(procedures)
    if len(resolved_levels) != len(procedures) or any(level not in range(1, 6) for level in resolved_levels):
        raise ValueError("invalid_intensity_level")
    sliders: dict[str, float] = {}
    for procedure, level in zip(procedures, resolved_levels):
        scale = INTENSITY_SCALES[level] if procedure.intensity_mode == "variable" else 1.0
        for step in procedure.pipeline:
            if step.type == OpType.WARP_OP:
                control = str(step.params["control"])
                sliders[control] = sliders.get(control, 0.0) + float(step.params["value"]) * scale
    return sliders


def surface_steps(procedures: Iterable[ProcedureSpec], view: str,
                  levels: Iterable[int] | None = None) -> tuple[Step, ...]:
    # Every accepted scan is a fixed front/left/right triplet. Surface masks are landmark-derived,
    # so they remain confined on profiles and must be evaluated for every returned view rather
    # than quietly handing a source photograph back unchanged.
    procedures = tuple(procedures)
    resolved_levels = tuple(levels) if levels is not None else (3,) * len(procedures)
    if len(resolved_levels) != len(procedures) or any(level not in range(1, 6) for level in resolved_levels):
        raise ValueError("invalid_intensity_level")
    result = []
    for procedure, level in zip(procedures, resolved_levels):
        scale = INTENSITY_SCALES[level] if procedure.intensity_mode == "variable" else 1.0
        for step in procedure.pipeline:
            if step.type == OpType.WARP_OP:
                continue
            params = dict(step.params)
            params["strength"] = float(params.get("strength", 1.0)) * scale
            result.append(Step(step.type, step.region, params))
    return tuple(result)

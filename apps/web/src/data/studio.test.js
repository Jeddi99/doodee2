import assert from 'node:assert/strict';
import {
  applyStudioPreset,
  buildDemoAnalysis,
  createStudioSession,
  getMobileCategoryIds,
  getProfilePresetBlend,
  lockStudioPreset,
  nextSheetSnap,
  orderRecommendationsForAngle,
  rankStudioRecommendations,
  resetStudioCategory,
  STUDIO_CATEGORIES,
  setStudioAdjustment,
  snapSheetAfterDrag,
  startOnboardingScan,
  ZERO_ADJUSTMENTS,
} from './studio.js';
import { PROFILE_DEMO_ASSETS } from './mockData.js';

assert.equal(STUDIO_CATEGORIES.length, 13);
assert.equal(STUDIO_CATEGORIES.every(({ tests }) => tests.length >= 3 && tests.length <= 5), true);
assert.equal(STUDIO_CATEGORIES.every(({ label, labelEn, tests }) => label && labelEn && tests.every(({ th, en }) => th && en)), true);

const nose = STUDIO_CATEGORIES.find(({ id }) => id === 'nose');
const withBrow = { ...ZERO_ADJUSTMENTS, browArch: 25 };
const nosePreview = applyStudioPreset(withBrow, nose, { ...nose.presets[0][2], browArch: 99 });
assert.equal(nosePreview.browArch, 25);
assert.equal(resetStudioCategory(nosePreview, nose).noseBridgeHeight, 0);
const noseLocked = { ...createStudioSession(), ...lockStudioPreset(createStudioSession(), nose, nose.presets[0]) };
assert.equal(noseLocked.profilePresetOrigins.nose, 'nose-natural');
assert.equal(getProfilePresetBlend('nose', noseLocked.adjustments, 'nose-natural'), 1);

const faceShape = STUDIO_CATEGORIES.find(({ id }) => id === 'faceShape');
assert.equal(applyStudioPreset(ZERO_ADJUSTMENTS, faceShape, faceShape.presets[0][2]).jawBotox, 46);
const faceLocked = { ...createStudioSession(), ...lockStudioPreset(createStudioSession(), faceShape, faceShape.presets[0]) };
assert.equal(faceLocked.lockedPresets.jaw, 'faceShape');
const jaw = STUDIO_CATEGORIES.find(({ id }) => id === 'jaw');
const jawEdited = setStudioAdjustment(faceLocked, jaw, 'jawDefinition', 67);
assert.equal(jawEdited.lockedPresets.jaw, 'custom');
assert.deepEqual(jawEdited.compositeOrigin.overrides, ['jaw']);
assert.equal(nextSheetSnap('peek'), 'half');
assert.equal(snapSheetAfterDrag('half', -220, 800), 'full');
assert.deepEqual(getMobileCategoryIds('general', [{ categoryId: 'skin' }, { categoryId: 'brows' }], { jaw: 'custom' }), ['general', 'skin', 'brows', 'jaw']);
assert.deepEqual(getMobileCategoryIds('general', [], {}, 5, 'left'), ['general', 'nose', 'chin', 'jaw', 'neck']);
assert.deepEqual(orderRecommendationsForAngle([{ categoryId: 'eyes' }, { categoryId: 'jaw' }, { categoryId: 'nose' }], 'right').map(({ categoryId }) => categoryId), ['nose', 'jaw', 'eyes']);
assert.equal(Object.keys(buildDemoAnalysis()).length, 13);
assert.equal(Object.keys(PROFILE_DEMO_ASSETS.female.left.presets.nose).length, 6);
assert.match(PROFILE_DEMO_ASSETS.male.right.presets.chin['chin-taper'], /profile-male-right-chin-chin-taper\.webp$/);

const adult = createStudioSession().intake;
assert.equal(rankStudioRecommendations(adult).length, 3);
assert.equal(rankStudioRecommendations({ ...adult, age: 'under18' }).every(({ level }) => level === 'self-care'), true);

const onboardingScan = startOnboardingScan(
  createStudioSession(),
  { age: 'under18', gender: 'male', background: 'east-asian' },
  [{ id: 'female', gender: 'female' }, { id: 'male', gender: 'male' }],
);
assert.equal(onboardingScan.phase, 'scan');
assert.equal(onboardingScan.scanStep, 0);
assert.equal(onboardingScan.model.id, 'male');
assert.equal(onboardingScan.intake.age, 'under18');
assert.equal(onboardingScan.intake.demographic, 'east-asian-male');

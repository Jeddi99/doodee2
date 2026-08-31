import type { MetricKey } from "@/types";
import type { Category } from "@/lib/scoring";
import type { Tier } from "@/lib/scoring/tier";

export interface Citation {
  description: string;
  source: string;
}

export interface Translations {
  brand: {
    name: string;
    tagline: string;
  };
  nav: {
    scan: string;
    methodology: string;
    history: string;
    hairColor: string;
    lipstick: string;
    eyeColor: string;
    tryOn: string;
    surgery: string;
  };
  history: {
    title: string;
    subtitle: string;
    empty: string;
    emptyHeadline: string;
    emptyBody: string;
    emptyScanCta: string;
    emptySampleCta: string;
    emptyPasteCta: string;
    clearAll: string;
    exportAll: string;
    importAll: string;
    importOk: string;
    importErr: string;
    fromPrevious: string;
    compareMode: string;
    compare: string;
    comparePrompt: string;
    cancel: string;
    deleteRow: string;
    deleteConfirm: string;
    trendLabel: string;
    trendEmpty: string;
    bestLabel: string;
    qualityBadLabel: string;
    qualityWarnLabel: string;
    qualityHint: string;
    compareWithLink: string;
    detailTitle: string;
  };
  historyDashboard: {
    header: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    stats: {
      aria: string;
      total: string;
      totalUnit: string;
      localOnly: string;
      highest: string;
      latest: string;
      average: string;
      deltaVsFirst: string;
    };
    trend: {
      title: string;
      info: string;
      ranges: Record<"7d" | "30d" | "90d" | "all", string>;
      legendScore: string;
      average: string;
      empty: string;
      scanCta: string;
    };
    recent: {
      title: string;
      subtitle: string;
      empty: string;
      viewAll: string;
      frontOnly: string;
      frontSide: string;
      normal: string;
      quality: {
        excellent: string;
        good: string;
        fair: string;
      };
      actions: {
        share: string;
        copy: string;
        delete: string;
      };
    };
    radar: {
      title: string;
      subtitle: string;
      empty: string;
    };
    best: {
      title: string;
      empty: string;
      cta: string;
    };
    compare: {
      title: string;
      subtitle: string;
      vs: string;
      start: string;
      needTwo: string;
    };
    empty: {
      title: string;
      body: string;
      scanCta: string;
      sampleCta: string;
      pasteCta: string;
    };
  };
  historyTabs: {
    scans: string;
    previews: string;
  };
  previewsHistory: {
    eyebrow: string;
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptySubtitle: string;
    emptyCta: string;
    viewAll: string;
  };
  paste: {
    title: string;
    subtitle: string;
    urlLabel: string;
    placeholder: string;
    invalid: string;
    cancel: string;
    compare: string;
  };
  compare: {
    title: string;
    subtitle: string;
    earlier: string;
    later: string;
    overallLabel: string;
    categoriesLabel: string;
    calibrationMismatch: string;
  };
  landing: {
    headline: string;
    sub1: string;
    sub2: string;
    cta: string;
    featuresTitle: string;
    features: { title: string; body: string }[];
    howTitle: string;
    steps: { title: string; body: string }[];
    privacyTitle: string;
    privacyBody: string;
    finalCta: string;
    learnMore: string;
    // Redesigned hero
    heroEyebrow: string;
    heroTitle: string;
    heroSub: string;
    heroCta: string;
    heroSecondaryCta: string;
    badges: string[];
    // Preview mock
    previewLabel: string;
    previewOverall: string;
    previewTier: string;
    previewTierTag: string;
    previewOutOf: string;
    previewRadar: { label: string; score: number }[];
    previewPlan: string;
    previewPlanItems: string[];
    // Why different
    whyTitle: string;
    whyItems: { title: string; body: string }[];
    // Phase 73: try-on preset discovery
    discoverEyebrow: string;
    discoverTitle: string;
    discoverSubtitle: string;
    discoverCta: string;
    discoverFullLook: string;
    discoverPartialLook: string;
    discoverYourLooks: string;
    discoverSavedLook: string;
    // Pricing
    pricingTitle: string;
    pricingSub: string;
    pricingPlans: {
      key: "free" | "plus" | "pro";
      name: string;
      price: string;
      cadence: string;
      tagline: string;
      perks: string[];
      cta: string;
      badge?: string;
    }[];
    // Final CTA
    finalEyebrow: string;
    finalSub: string;
    finalSafetyNote: string;
    // Stats strip
    statsEyebrow: string;
    stats: { value: string; label: string }[];
    // Metrics marquee
    marqueeLabel: string;
    // Trust line under hero CTA
    trustLine: string;
    // Checkout fallback toast (when Stripe links aren't configured)
    checkoutSoonTitle: string;
    checkoutSoonBody: string;
  };
  landingV2: {
    conversion: {
      heroEyebrow: string;
      heroTitle: string;
      heroSubtitle: string;
      heroCta: string;
      heroMicrocopy: string;
      heroBadges: string[];
      howEyebrow: string;
      howTitle: string;
      howSteps: { title: string; body: string }[];
      reportEyebrow: string;
      reportTitle: string;
      reportBody: string;
      reportItems: { title: string; body: string }[];
      beforeLabel: string;
      afterLabel: string;
      visualCaption: string;
      painEyebrow: string;
      painTitle: string;
      painItems: { title: string; body: string }[];
      solutionEyebrow: string;
      solutionTitle: string;
      solutionBody: string;
      solutionPoints: string[];
      useCasesEyebrow: string;
      useCasesTitle: string;
      useCases: { title: string; body: string }[];
      privacyEyebrow: string;
      privacyTitle: string;
      privacyBody: string;
      privacyItems: { title: string; body: string }[];
      proofEyebrow: string;
      proofTitle: string;
      proofItems: { value: string; label: string; body: string }[];
      offerEyebrow: string;
      offerTitle: string;
      offerBody: string;
      offerHighlight: string;
      offerPlans: { name: string; price: string; body: string }[];
      comparisonEyebrow: string;
      comparisonTitle: string;
      comparisonFeatureLabel: string;
      comparisonAlternativeLabel: string;
      comparisonRows: { label: string; doodee: string; alternative: string }[];
      ctaTitle: string;
      ctaBody: string;
      cta: string;
      faqEyebrow: string;
      faqTitle: string;
      faq: { q: string; a: string }[];
    };
    nav: {
      methodology: string;
      pricing: string;
      history: string;
      blog: string;
      faq: string;
      login: string;
    };
    hero: {
      eyebrow: string;
      titleLine1: string;
      titleLine2: string;
      subtitle: string;
      primaryCta: string;
      secondaryCta: string;
    };
    trust: {
      items: { title: string; body: string }[];
    };
    aesthetics: {
      eyebrow: string;
      title: string;
      viewAll: string;
      details: string;
      procedures: { title: string; description: string; rating: string }[];
    };
  };
  photoQuality: {
    titleBad: string;
    titleWarn: string;
    retake: string;
    fix: {
      blurry: string;
      tooDark: string;
      tooBright: string;
      flatLight: string;
      facePose: string;
      tooFar: string;
      tooClose: string;
      eyesClosed: string;
      mouthOpen: string;
      extremeSmile: string;
      hairCoversFace: string;
      unevenLight: string;
    };
  };
  scan: {
    title: string;
    titleMeta: string;
    subtitle: string;
    dropPrompt: string;
    dropSide: string;
    chooseFile: string;
    takePhoto: string;
    privateNote: string;
    loadingModel: string;
    processing: string;
    processingSide: string;
    noFace: string;
    failed: string;
    tryAnother: string;
    scanAnother: string;
    calibration: string;
    tryOnCtaEyebrow: string;
    tryOnCtaTitle: string;
    tryOnCtaBody: string;
    tryOnCtaCta: string;
    addSideTitle: string;
    addSideBadge: string;
    addSideDescription: string;
    sideAdded: string;
    tipsLabel: string;
    tip1: string;
    tip2: string;
    tip3: string;
    tip4: string;
    sampleLink: string;
  };
  scanCockpit: {
    title: string;
    subtitle: string;
    smartOn: string;
    smartOff: string;
    smartChecking: string;
    inProgress: string;
    metrics: {
      sharpness: string;
      light: string;
      headAngle: string;
      quality: string;
    };
    qualityLabels: {
      good: string;
      warn: string;
      bad: string;
    };
    progress: {
      processing: string;
      aiAnalyzing: string;
      etaLabel: string;
      unit: string;
    };
    tipsHeader: string;
    tips: {
      light: string;
      lookStraight: string;
      noObstruction: string;
      distance: string;
    };
    bestPractices: {
      header: string;
      a: string;
      b: string;
      c: string;
      d: string;
    };
    cancel: string;
    historyHeader: string;
    historyViewAll: string;
    historyEmpty: string;
    historyDetail: string;
    whyHeader: string;
    why: {
      a: { title: string; body: string };
      b: { title: string; body: string };
      c: { title: string; body: string };
      d: { title: string; body: string };
    };
  };
  scanProgress: {
    ariaLabelPrefix: string;
    doneLabel: string;
    aiNote: string;
    steps: {
      detecting: { label: string; hint: string };
      computing: { label: string; hint: string };
      ai: { label: string; hint: string };
    };
  };
  scanConfirm: {
    reviewBeforeScan: string;
    lookStraight: string;
    changePhoto: string;
    confirmScan: string;
    retryScan: string;
  };
  auth: {
    gateRedirect: string;
    gateChecking: string;
  };
  adminNav: {
    dashboard: string;
    users: string;
    coupons: string;
    payments: string;
    audit: string;
    health: string;
    subscriptions: string;
    usage: string;
    signOut: string;
    sidebarTitle: string;
    sidebarEyebrow: string;
  };
  adminGate: {
    checking: string;
    loadFailed: string;
  };
  adminDashboard: {
    eyebrow: string;
    title: string;
    refresh: string;
    loadFailedTitle: string;
    loadFailedUnknown: string;
    kpiMrr: string;
    kpiMrrSub: string;
    kpiTotalUsers: string;
    kpiTotalUsersSub: string;
    kpiPayingCustomers: string;
    kpiPayingCustomersSub: string;
    kpiRevenue30: string;
    kpiRevenue30Sub: string;
    kpiDauMau: string;
    kpiDauMauSub: string;
    funnelEyebrow: string;
    funnelTitle: string;
    funnelStat: string;
    funnelSignup: string;
    funnelFirstScan: string;
    funnelUpgrade: string;
    tiersEyebrow: string;
    dailyEyebrow: string;
    signupsTitle: string;
    churnTitle: string;
    revenueTitle: string;
    today: string;
    last7: string;
    last30: string;
    last90: string;
    last60: string;
    topByCost: string;
    topByUsage: string;
    usageUnit: string;
    noMembers: string;
    noData: string;
  };
  dataTable: {
    page: string;
    previous: string;
    next: string;
  };
  calibration: {
    male: string;
    female: string;
    universal: string;
    asian: string;
  };
  profilePrefs: {
    ageRangeLabel: string;
    goalLabel: string;
    aestheticReferenceLabel: string;
    age18_24: string;
    age25_34: string;
    age35_44: string;
    age45Plus: string;
    goalSkin: string;
    goalHair: string;
    goalFaceBalance: string;
    goalPreClinic: string;
    goalOverall: string;
    refNaturalClean: string;
    refKBeauty: string;
    refWesternModel: string;
    refThaiEveryday: string;
    refNoPreference: string;
  };
  multiFrame: {
    label: string;
    title: string;
    body: string;
    addPrompt: string;
    maxed: string;
  };
  redeem: {
    title: string;
    subtitle: string;
    inputLabel: string;
    inputPlaceholder: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successCta: string;
    newPlanLabel: string;
    activeUntilLabel: string;
    currentPlanLabel: string;
    expiresLabel: string;
    noCodeCta: string;
    errors: {
      COUPON_NOT_FOUND: string;
      COUPON_DISABLED: string;
      COUPON_EXPIRED: string;
      COUPON_DEPLETED: string;
      COUPON_ALREADY_REDEEMED: string;
      COUPON_NO_SUBSCRIPTION: string;
      COUPON_STRIPE_ONLY: string;
      COUPON_BAD_GRANT_TIER: string;
      COUPON_BAD_GRANT_DAYS: string;
      INVALID_CODE_FORMAT: string;
      UNAUTHORIZED: string;
      NETWORK: string;
      UNKNOWN: string;
    };
    grantedDuration: string;
    grantedDays: string;
    grantedScans: string;
    grantedScansUnit: string;
    grantedPreviews: string;
    grantedPreviewsUnit: string;
    bonusScans: string;
    bonusPreviews: string;
  };
  onboarding: {
    skip: string;
    next: string;
    start: string;
    slides: { title: string; body: string }[];
    wizard: {
      skip: string;
      next: string;
      back: string;
      genderQuestion: string;
      genderHint: string;
      ageQuestion: string;
      ageHint: string;
      goalQuestion: string;
      goalHint: string;
      referenceQuestion: string;
      referenceHint: string;
      s1Title: string;
      s1Subtitle: string;
      s1GenderLabel: string;
      s1AgeLabel: string;
      s1GoalLabel: string;
      s1ReferenceLabel: string;
      s2Title: string;
      s2Subtitle: string;
      s2Bullet1Title: string;
      s2Bullet1Body: string;
      s2Bullet2Title: string;
      s2Bullet2Body: string;
      s2Bullet3Title: string;
      s2Bullet3Body: string;
      s3Title: string;
      s3Subtitle: string;
      s3ScanLabel: string;
      s3ScanBody: string;
      s3TryOnLabel: string;
      s3TryOnBody: string;
      s3UpgradeLabel: string;
      s3UpgradeBody: string;
      male: string;
      female: string;
      age18_24: string;
      age25_34: string;
      age35_44: string;
      age45Plus: string;
      goalSkin: string;
      goalHair: string;
      goalFaceBalance: string;
      goalPreClinic: string;
      goalOverall: string;
      refNaturalClean: string;
      refKBeauty: string;
      refWesternModel: string;
      refThaiEveryday: string;
      refNoPreference: string;
    };
  };
  camera: {
    title: string;
    subtitle: string;
    capture: string;
    flip: string;
    cancel: string;
    denied: string;
    unsupported: string;
    failed: string;
    open: string;
    qualityOk: string;
    qualityWarn: string;
    qualityBad: string;
  };
  result: {
    overall: string;
    outOf: string;
    overview: string;
    hint: string;
    yourMeasurement: string;
    idealRange: string;
    score: string;
    measured: string;
    ideal: string;
    metricDetail: string;
    source: string;
    percentile: string;
    overallDistribution: string;
    metricDistribution: string;
    evidenceResearch: string;
    evidenceApproximated: string;
    flaggedLabel: string;
    flaggedTitle: string;
    flaggedMessage: string;
    implicationsLabel: string;
    aboutLabel: string;
    howCalculatedLabel: string;
    howCalculatedExplanation: string;
    categoryAverage: string;
    yourStrengths: string;
    improvementAreas: string;
    bestMetric: string;
    worstMetric: string;
    radarLabel: string;
    viewAllTiers: string;
    tipLabel: string;
    share: string;
    download: string;
    shareTitle: string;
    shareText: string;
    planTab: string;
    planHeading: string;
    planSubtitle: string;
    planEmpty: string;
    populationLabel: string;
    populationPercentileLine: string;
    lowConfidence: string;
    percentileTooltip: string;
    confidenceTooltip: string;
    geometricShort: string;
    secondOpinionShort: string;
    learnedShort: string;
    learnedAnalyzing: string;
    blendTooltip: string;
  };
  status: {
    good: string;
    borderline: string;
    poor: string;
  };
  category: Record<Category, string>;
  categoryDescription: Record<Category, string>;
  metric: Record<MetricKey, string>;
  metricNote: Record<MetricKey, string>;
  metricTip: Record<MetricKey, string>;
  citation: Record<MetricKey, Citation>;
  tier: Record<Tier, string>;
  tierDescription: Record<Tier, string>;
  lang: {
    th: string;
    en: string;
    toggleAria: string;
  };
  dialog: {
    close: string;
  };
  footer: {
    privacy: string;
    settings: string;
    pricing: string;
  };
  settings: {
    eyebrow: string;
    title: string;
    subtitle: string;
    calibrationTitle: string;
    calibrationBody: string;
    languageTitle: string;
    languageBody: string;
    historyTitle: string;
    historyBody: string;
    clearHistory: string;
    confirmClear: string;
    tryOnDataTitle: string;
    tryOnDataBody: string;
    clearTryOnData: string;
    confirmClearTryOn: string;
    exportLooks: string;
    importLooks: string;
    importOk: string;
    importErr: string;
    guestTitle: string;
    guestBody: string;
    resetGuest: string;
    confirmReset: string;
    privacyTitle: string;
    privacyBody: string;
    privacyLink: string;
    tourTitle: string;
    tourBody: string;
    tourReplay: string;
    tourReset: string;
    // Phase 174 — Profile + theme + subscription sections
    signOut: string;
    activeUntil: string;
    subscriptionTitle: string;
    subscriptionBody: string;
    viewPlans: string;
    redeemCode: string;
    usage: string;
    themeTitle: string;
    themeBody: string;
    themeDark: string;
    themeLight: string;
    themeActive: string;
  };
  privacy: {
    eyebrow: string;
    title: string;
    intro: string;
    s1Title: string;
    s1Body: string;
    s2Title: string;
    s2Body: string;
    s3Title: string;
    s3Body: string;
    s4Title: string;
    s4Body: string;
    updated: string;
  };
  skin: {
    heading: string;
    note: string;
    uniformity: string;
    clarity: string;
    glow: string;
    privacyNote: string;
  };
  aiSummary: {
    title: string;
    subtitle: string;
    generate: string;
    generating: string;
    clear: string;
    poweredBy: string;
    poweredByTemplate: string;
    errorPrefix: string;
  };
  hairColor: {
    eyebrow: string;
    title: string;
    subtitle: string;
    uploadPrompt: string;
    paletteLabel: string;
    intensity: string;
    reset: string;
    save: string;
    saved: string;
    saveErr: string;
    original: string;
    compareHold: string;
    changePhoto: string;
    privacyNote: string;
    canvasAriaOriginal: string;
    canvasAriaApplied: string;
  };
  lipstick: {
    eyebrow: string;
    title: string;
    subtitle: string;
    uploadPrompt: string;
    paletteLabel: string;
    intensity: string;
    reset: string;
    save: string;
    saved: string;
    saveErr: string;
    original: string;
    compareHold: string;
    changePhoto: string;
    privacyNote: string;
    canvasAriaOriginal: string;
    canvasAriaApplied: string;
  };
  eyeColor: {
    eyebrow: string;
    title: string;
    subtitle: string;
    uploadPrompt: string;
    paletteLabel: string;
    intensity: string;
    reset: string;
    save: string;
    saved: string;
    saveErr: string;
    original: string;
    compareHold: string;
    changePhoto: string;
    privacyNote: string;
    canvasAriaOriginal: string;
    canvasAriaApplied: string;
  };
  tryOn: {
    eyebrow: string;
    title: string;
    subtitle: string;
    uploadPrompt: string;
    intensity: string;
    resetAll: string;
    save: string;
    saved: string;
    saveErr: string;
    original: string;
    compareHold: string;
    changePhoto: string;
    privacyNote: string;
    activeCount: string;
    recent: string;
    looks: string;
    surprise: string;
    shareLook: string;
    shareCopied: string;
    shareErr: string;
    sharedLookHint: string;
    saveLook: string;
    saveLookFull: string;
    saveLookTitle: string;
    saveLookBody: string;
    saveLookPlaceholder: string;
    saveLookCancel: string;
    saveLookConfirm: string;
    deleteLook: string;
    saveComparison: string;
    unifiedHubBanner: string;
    unifiedHubCta: string;
    shareLookNativeTitle: string;
    shareLookNativeText: string;
    canvasAriaOriginal: string;
    canvasAriaApplied: string;
    tabs: {
      hair: string;
      eyes: string;
      lips: string;
      blush: string;
    };
  };
  tryOnV2: {
    eyebrow: string;
    title: string;
    subtitle: string;
    privacyFooter: string;
    stage: {
      prompt: string;
      choose: string;
      camera: string;
      hint: string;
      preparing: string;
      loadingModel: string;
      detecting: string;
      rendering: string;
      refiningHair: string;
    };
    tabs: Record<"hair" | "eyes" | "lips" | "blush", string>;
    controls: {
      intensity: string;
      activeLayers: string;
      clearAll: string;
    };
    compare: {
      title: string;
      before: string;
      after: string;
    };
    actions: {
      download: string;
      saved: string;
      saveErr: string;
      saving: string;
      reset: string;
      changePhoto: string;
    };
    layerCards: Record<
      "hair" | "eyes" | "lips" | "blush",
      { title: string; description: string; cta: string }
    >;
  };
  share: {
    eyebrow: string;
    invalidTitle: string;
    invalidBody: string;
    startYourOwn: string;
    privacyNote: string;
    copyLink: string;
    copied: string;
    copyError: string;
    copyFallback: string;
    vsYou: string;
    shareScan: string;
    nativeTitle: string;
    nativeText: string;
  };
  annotated: {
    download: string;
    rendering: string;
    saved: string;
    subtitle: string;
  };
  offline: {
    banner: string;
    retry: string;
  };
  a11y: {
    skipToContent: string;
    primaryNav: string;
    primaryNavMobile: string;
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    termsEyebrow: string;
    termsTitle: string;
    termsItems: { label: string; body: string }[];
    comparisonEyebrow: string;
    comparisonTitle: string;
    comparisonPoints: { label: string; body: string }[];
    faqEyebrow: string;
    faqTitle: string;
    faq: { q: string; a: string }[];
    finalCtaTitle: string;
    finalCtaBody: string;
    finalCtaPrimary: string;
    finalCtaSecondary: string;
  };
  upgrade: {
    hero: {
      privacyChip: string;
      titleLine1: string;
      titleLine2Prefix: string;
      titleLine2Accent: string;
      titleLine2Suffix: string;
      subtitle: string;
    };
    sidebar: {
      analyzerLabel: string;
      scan: string;
      tryOn: string;
      history: string;
      plan: string;
      methodology: string;
      aiAdvice: string;
      settings: string;
      privacy: string;
      guestName: string;
      signedOutTitle: string;
      signedOutBody: string;
      creditsRemaining: string;
      scansRemaining: string;
      previewsRemaining: string;
      daysLeftLabel: string;
      daysLeftLabelOne: string;
      daysLeftToday: string;
      daysLeftExpired: string;
      expiresOn: string;
      upgradeProTitle: string;
      upgradeProBody: string;
      themeToggle: string;
      themeDarkLabel: string;
      themeLightLabel: string;
      pinSidebar: string;
      unpinSidebar: string;
      version: string;
      tierFree: string;
      tierPlus: string;
      tierPro: string;
    };
    bottomBar: {
      comparePrompt: string;
      compareLink: string;
      assistant: string;
    };
    // Phase 192r — payment-method chooser on the plan card (card
    // subscription vs one-time PromptPay).
    payment: {
      label: string;
      card: string;
      cardHint: string;
      promptpay: string;
      promptpayHint: string;
      promptpayNote: string;
      promptpayDisabled: string;
    };
  };
  // Phase 192u — Global paywall gate dialog. Shown when an AI action is
  // blocked by quota exhaustion (scans/previews) or by a feature locked at
  // the user's tier, with a CTA into /upgrade.
  paywall: {
    outOfScansTitle: string;
    outOfPreviewsTitle: string;
    featureLockedTitle: string;
    bodyFree: string;
    bodyPaid: string;
    viewPlans: string;
    later: string;
  };
  login: {
    title: string;
    subtitle: string;
    continueGoogle: string;
    continueEmail: string;
    or: string;
    skip: string;
    toastTitle: string;
    toastBody: string;
    privacyBadge: string;
    noAccountNote: string;
    soonNote: string;
    backToLanding: string;
  };
  pwa: {
    install: string;
    dismiss: string;
  };
  analysisSteps: {
    step1: string;
    step2: string;
    step3: string;
    step4: string;
  };
  scanPaywall: {
    title: string;
    subtitle: string;
    cta: string;
    metrics: string;
    aiComplete: string;
    reportReady: string;
  };
}

import type { Translations } from "./types";

export const en: Translations = {
  brand: {
    name: "DOODEE",
    tagline: "Facial aesthetics reports calibrated for Asian features",
  },
  nav: {
    scan: "Assessment",
    methodology: "Methodology",
    history: "History",
    hairColor: "Hair Color",
    lipstick: "Lipstick",
    eyeColor: "Eye Color",
    tryOn: "Try-on",
    surgery: "Protocol",
  },
  history: {
    title: "Assessment history",
    subtitle:
      "Your 20 most recent assessments, with storage boundaries shown clearly.",
    empty: "No assessment history yet — start your first face assessment.",
    emptyHeadline: "Your assessment history will live here",
    emptyBody:
      "Start an assessment to build a trendline, or open an example report to review the format. Server-side features are described before use.",
    emptyScanCta: "Start your first report",
    emptySampleCta: "Open an example report",
    emptyPasteCta: "Compare with a shared link",
    clearAll: "Clear all history",
    exportAll: "Export as JSON",
    importAll: "Import JSON",
    importOk: "Imported · {added} added, {skipped} skipped",
    importErr: "Import failed — file unreadable or wrong format",
    fromPrevious: "previous",
    compareMode: "Compare two reports",
    compare: "Compare",
    comparePrompt: "Pick 2 scans · {n} selected",
    cancel: "Cancel",
    deleteRow: "Delete report",
    deleteConfirm: "Delete this report? This can't be undone.",
    trendLabel: "Overall trend",
    trendEmpty: "Take at least two assessments to see your trend.",
    bestLabel: "Highest",
    qualityBadLabel: "Low quality",
    qualityWarnLabel: "Suboptimal",
    qualityHint: "This report had {n} photo-quality issue(s) — confidence is lower than usual.",
    compareWithLink: "Compare with share link",
    detailTitle: "Report details",
  },
  historyDashboard: {
    header: {
      eyebrow: "FACE JOURNAL",
      title: "Face Journal",
      subtitle:
        "Your latest {count} Face Profile entries are saved locally on this device.",
    },
    stats: {
      aria: "Assessment history summary",
      total: "Total reports",
      totalUnit: "reports",
      localOnly: "Stored on this device",
      highest: "Highest",
      latest: "Latest",
      average: "Average",
      deltaVsFirst: "vs first {delta}",
    },
    trend: {
      title: "Score trend",
      info: "Hover the chart to inspect the score and date for each report.",
      ranges: {
        "7d": "7d",
        "30d": "30d",
        "90d": "90d",
        all: "All",
      },
      legendScore: "Overall score",
      average: "Average {value}",
      empty: "No assessment history yet. Start your first report.",
      scanCta: "Start assessment",
    },
    recent: {
      title: "Journal entries",
      subtitle: "Open an entry for details, or select two entries to compare.",
      empty: "No reports in this range.",
      viewAll: "View all history",
      frontOnly: "Front",
      frontSide: "Front + side",
      normal: "Normal",
      quality: {
        excellent: "Excellent",
        good: "Good",
        fair: "Fair",
      },
      actions: {
        share: "Share link",
        copy: "Copy link",
        delete: "Delete report",
      },
    },
    radar: {
      title: "Insights",
      subtitle: "Latest face report",
      empty: "No radar data yet.",
    },
    best: {
      title: "Your highest-scoring report",
      empty: "Your highest-scoring report will appear here once you have history.",
      cta: "View details",
    },
    compare: {
      title: "Compare reports",
      subtitle: "Pick two reports to compare scores and changes.",
      vs: "VS",
      start: "Start comparing",
      needTwo: "You need at least two reports.",
    },
    empty: {
      title: "Your assessment history will live here",
      body:
        "Start your first report to build a trendline and track changes on this device.",
      scanCta: "Start your first report",
      sampleCta: "Open an example report",
      pasteCta: "Compare with a shared link",
    },
  },
  historyTabs: {
    scans: "Reports",
    previews: "References",
  },
  previewsHistory: {
    eyebrow: "PRE-CONSULT REFERENCES",
    title: "Your saved references",
    subtitle:
      "Every reference is saved locally on this device — up to 10 of the most recent.",
    emptyTitle: "No saved references yet",
    emptySubtitle:
      "References from pre-consult planning show up here, up to 10 of the most recent.",
    emptyCta: "Plan before consult",
    viewAll: "View all",
  },
  paste: {
    title: "Compare with a shared report",
    subtitle:
      "Paste a /share?d=... URL or the encoded report blob. We'll line it up against your selected report.",
    urlLabel: "Shared report URL",
    placeholder: "https://doodee.app/share?d=…",
    invalid:
      "Couldn't read that link. Check the URL — it should start with /share?d= and end with the encoded report.",
    cancel: "Cancel",
    compare: "Compare",
  },
  compare: {
    title: "Compare reports",
    subtitle: "Side-by-side diff across overall, tier, and each category.",
    earlier: "Earlier",
    later: "Later",
    overallLabel: "Overall",
    categoriesLabel: "By category",
    calibrationMismatch:
      "Note: these reports used different gender or ethnicity calibration. Direct comparison may be misleading.",
  },
  landing: {
    headline: "DOODEE",
    sub1: "Facial aesthetics reports built first for Thai and Asian features.",
    sub2: "Core assessment in your browser. Optional visual references are separate.",
    cta: "Start assessment",
    featuresTitle: "What the report covers",
    features: [
      {
        title: "60+ measurements, 6 areas",
        body: "Harmony, angularity, dimorphism, eye area, features, symmetry.",
      },
      {
        title: "Research-informed ranges",
        body: "Metrics cite sources such as Bashour, Farkas, Ricketts, Wang, Jayaratne, Hwang, Kim, and others.",
      },
      {
        title: "Asian-context calibration",
        body: "Starts with Asian facial references where available, with room to broaden calibration as the product grows.",
      },
    ],
    howTitle: "How the assessment works",
    steps: [
      {
        title: "1. Upload a clear front photo",
        body: "Use even light, a neutral expression, and keep eyes, nose, mouth, and chin visible.",
      },
      {
        title: "2. Check proportions privately",
        body: "The core assessment runs in your browser. Paid visual-reference features are separate and available on paid plans.",
      },
      {
        title: "3. Read a practical report",
        body: "See overall score, category breakdown, confidence notes, and next steps for photo quality, grooming, skincare, or consult prep.",
      },
    ],
    privacyTitle: "Privacy boundaries",
    privacyBody:
      "The core assessment is designed to run in your browser. Account, quota, payment, and optional server-side features follow the privacy policy; share links never include your original photo.",
    finalCta: "Start assessment",
    learnMore: "Methodology",
    heroEyebrow: "Doodee · facial analysis for Thai and Asian users",
    heroTitle: "Understand your face before you spend.",
    heroSub:
      "Get a private, readable report on facial balance, skin signal, and photo quality before choosing skincare, styling, or a clinic consult.",
    heroCta: "Start assessment",
    heroSecondaryCta: "View Methodology",
    badges: [
      "Core assessment in browser",
      "60+ measurements",
      "Thai and Asian context",
      "Clear next steps",
    ],
    previewLabel: "Example report view",
    previewOverall: "Overall",
    previewTier: "Tier",
    previewTierTag: "Example range",
    previewOutOf: "10.0",
    previewRadar: [
      { label: "Overall", score: 8.2 },
      { label: "Structure", score: 7.5 },
      { label: "Jaw balance", score: 7.8 },
      { label: "Definition", score: 8.1 },
      { label: "Eye area", score: 6.9 },
      { label: "Cheekbones", score: 8.5 },
    ],
    previewPlan: "Next-step priorities",
    previewPlanItems: [
      "Photo quality",
      "Skin clarity",
      "Facial balance",
    ],
    whyTitle: "Why DOODEE is different",
    whyItems: [
      {
        title: "Thai and Asian context first",
        body: "Calibration starts with Asian facial references and Thai user needs, with a structure that can expand as more validated regional data is added.",
      },
      {
        title: "Evidence level stays visible",
        body: "Metrics cite sources such as Bashour, Farkas, Wang, Ricketts, Jayaratne, Hwang, and Kim, with evidence strength shown in the report.",
      },
      {
        title: "Clear privacy boundaries",
        body: "The main measurement flow runs in your browser. Account, payment, and optional visual-reference features are handled under the privacy policy.",
      },
      {
        title: "Photo-quality context",
        body: "Blur, lighting, face angle, and eye openness are flagged so you know when to retake a photo before trusting the numbers.",
      },
    ],
    discoverEyebrow: "Appearance references",
    discoverTitle: "Review styling options on your photo",
    discoverSubtitle:
      "Upload a clear photo and compare restrained hair, eye, lip, and blush references processed on your device.",
    discoverCta: "Review this reference",
    discoverFullLook: "Complete reference · hair, eyes, blush, lips",
    discoverPartialLook: "Light reference · {n} effects",
    discoverYourLooks: "Your saved references",
    discoverSavedLook: "Saved on this device",
    pricingTitle: "Pricing",
    pricingSub:
      "Start with the basic plan. PromptPay is one-time 30-day access; cards are monthly subscriptions.",
    pricingPlans: [
      {
        key: "free",
        name: "Basic",
        price: "0",
        cadence: "THB",
        tagline: "Start with one private assessment",
        perks: [
          "1 face assessment",
          "No visual references",
          "Report guidance and consult-prep suggestions",
        ],
        cta: "Use basic plan",
      },
      {
        key: "plus",
        name: "Plus",
        price: "149",
        cadence: "THB / month",
        tagline: "PromptPay 30-day access or monthly card",
        perks: [
          "10 assessments / month",
          "5 visual references",
          "Makeup, hair, eye, and blush preview tools",
        ],
        cta: "Start Plus",
        badge: "Recommended",
      },
      {
        key: "pro",
        name: "Pro",
        price: "299",
        cadence: "THB / month",
        tagline: "Higher monthly quota, PDF, and comparison tools",
        perks: [
          "30 assessments / month",
          "20 visual references",
          "PDF report + saved guidance + multi-photo",
        ],
        cta: "Start Pro",
      },
    ],
    finalEyebrow: "Ready when useful",
    finalSub: "Start with a basic report, then choose Plus or Pro when it fits real use.",
    finalSafetyNote:
      "Core photo analysis runs in your browser. Account, payment, and server-side features are handled under the privacy policy.",
    statsEyebrow: "What the product is built around",
    stats: [
      { value: "60+", label: "Facial measurements" },
      { value: "478", label: "Facial reference points" },
      { value: "1", label: "Basic report" },
      { value: "Thai/Asian", label: "Thai and Asian context" },
    ],
    marqueeLabel: "What the report reads",
    trustLine: "Account required for quota · Core assessment runs in your browser",
    checkoutSoonTitle: "Checkout unavailable",
    checkoutSoonBody:
      "Checkout is unavailable right now. You can keep using the basic plan and return later.",
  },
  landingV2: {
    conversion: {
      heroEyebrow: "Pre-consult face report for Thai and Asian users",
      heroTitle: "Understand your options before you spend.",
      heroSubtitle:
        "Upload one front-facing photo to review facial balance, skin signals, photo quality, and pre-consult context before choosing a clinic or plan.",
      heroCta: "Start assessment",
      heroMicrocopy: "Your report is framed as decision support, not a diagnosis or guaranteed outcome.",
      heroBadges: [
        "Know before spending",
        "Thai and Asian context",
        "Decision support, not medical claims",
      ],
      howEyebrow: "How it works",
      howTitle: "A short assessment flow for real-life decisions.",
      howSteps: [
        {
          title: "Upload one clear front photo",
          body: "Use even light, a neutral expression, and a face-forward angle. DOODEE checks quality before you rely on the report.",
        },
        {
          title: "Measure structure and skin",
          body: "The browser reads facial reference points, proportions, symmetry, skin signals, and image quality so the report stays explainable.",
        },
        {
          title: "Read next-step context",
          body: "You get strengths, areas to review, confidence notes, and practical next steps instead of a generic score.",
        },
      ],
      reportEyebrow: "Report format",
      reportTitle: "Built to reduce guessing, not create pressure.",
      reportBody:
        "The report is concise enough for mobile reading and detailed enough to show confidence, photo-quality limits, and review priorities.",
      reportItems: [
        {
          title: "Overall score and tier",
          body: "A clear starting point for the report, with confidence context when the input photo is not optimal.",
        },
        {
          title: "Category breakdown",
          body: "Harmony, angularity, dimorphism, eye area, features, symmetry, and skin are separated so one number does not hide the pattern.",
        },
        {
          title: "Photo-quality notes",
          body: "Blur, lighting, pose, face size, and eye openness are flagged before they distort interpretation.",
        },
        {
          title: "Strengths and review areas",
          body: "The report highlights what is already working and which areas may be worth reviewing first.",
        },
        {
          title: "Practical next steps",
          body: "Guidance stays grounded: retake a better photo, refine grooming or skincare, compare over time, or prepare questions for a licensed clinician.",
        },
        {
          title: "Share and history",
          body: "Saved scans, comparisons, and share links help you track changes without saving the original photo in the URL.",
        },
      ],
      beforeLabel: "Before",
      afterLabel: "Visual reference",
      visualCaption: "Visual reference only. It is not a promised result.",
      painEyebrow: "Before a consult",
      painTitle: "Better decisions start with clearer context.",
      painItems: [
        {
          title: "Opinions need structure",
          body: "Comments from friends or forums rarely separate proportions, skin, lighting, and photo quality.",
        },
        {
          title: "Edited images rarely explain the reason",
          body: "A retouched image can look different without showing whether the change is skin, balance, jaw, eyes, or lighting.",
        },
        {
          title: "Clinic decisions deserve context",
          body: "Before booking a clinic visit, understand the facial structure and input quality you are starting from.",
        },
      ],
      solutionEyebrow: "Report overview",
      solutionTitle: "Read the key facial signals without overcomplicating it.",
      solutionBody:
        "See facial balance, skin signal, photo quality, and Thai/Asian context in one clear view before choosing your next step.",
      solutionPoints: [
        "60+ facial measurements grouped into readable categories",
        "Skin and photo-quality checks before interpreting the result",
        "Practical guidance instead of vague compliments or fear",
        "Designed for mobile reading and quick decisions",
      ],
      useCasesEyebrow: "Use cases",
      useCasesTitle: "Useful before you commit time or money.",
      useCases: [
        {
          title: "Retake better photos",
          body: "See when blur, lighting, or angle is lowering confidence before you compare results.",
        },
        {
          title: "Plan skincare or grooming",
          body: "Separate skin signal, facial balance, and styling context so your next habit is easier to choose.",
        },
        {
          title: "Prepare for clinic consults",
          body: "Bring clearer questions about balance, proportions, and priorities instead of starting from guesswork.",
        },
        {
          title: "Track changes over time",
          body: "Compare scans after sleep, skincare, weight change, or treatment with the same photo-quality checks.",
        },
      ],
      privacyEyebrow: "Privacy and trust",
      privacyTitle: "Face analysis should feel private and grounded.",
      privacyBody:
        "DOODEE is a decision aid, not a medical promise. The core assessment stays as close to your device as practical, while visual-reference and account features follow clear privacy boundaries.",
      privacyItems: [
        {
          title: "Core assessment on your device",
          body: "The main facial assessment runs in your browser. Visual references may use server-side processing only when that feature requires it.",
        },
        {
          title: "No diagnostic claims",
          body: "The report is educational and directional. It is not a diagnosis, treatment plan, or replacement for licensed clinical advice.",
        },
        {
          title: "Account-based quota",
          body: "Sign-in ties basic and paid quotas to your account, preventing reset abuse and keeping plan access consistent.",
        },
      ],
      proofEyebrow: "Boundaries",
      proofTitle: "Clear scope, practical guidance.",
      proofItems: [
        {
          value: "60+",
          label: "facial measurements",
          body: "Measures proportion, symmetry, skin, and key facial regions.",
        },
        {
          value: "Thai/Asian",
          label: "Thai and Asian context",
          body: "Built around Thai and Asian users first, with room for broader regional calibration as validation grows.",
        },
        {
          value: "Quality",
          label: "photo quality",
          body: "Flags blur, lighting, face angle, face size, and eye openness.",
        },
      ],
      offerEyebrow: "Start here",
      offerTitle: "Start with the basic plan. Upgrade when you want to keep going.",
      offerBody:
        "The basic report shows the assessment format before you choose a plan. Paid plans add more assessment quota, PDF export, and visual references with clear payment terms.",
      offerHighlight: "Start your first report now",
      offerPlans: [
        { name: "Basic", price: "0 THB", body: "Start with a basic report and review the assessment format." },
        { name: "Plus", price: "149 THB/mo", body: "PromptPay 30-day access or monthly card subscription." },
        { name: "Pro", price: "299 THB/mo", body: "Higher monthly quota for assessments, visual references, and PDF export." },
      ],
      comparisonEyebrow: "Comparison",
      comparisonTitle: "A calmer alternative to filters, comments, and guesswork.",
      comparisonFeatureLabel: "Need",
      comparisonAlternativeLabel: "Common alternative",
      comparisonRows: [
        {
          label: "Understand the starting point",
          doodee: "Structured scores, categories, and photo-confidence context",
          alternative: "Comments without context or a single unexplained rating",
        },
        {
          label: "Know what changed",
          doodee: "History, comparison, and repeatable photo-quality checks",
          alternative: "Different lighting or filters make progress hard to read",
        },
        {
          label: "Prepare next steps",
          doodee: "Practical guidance for photo, skincare, style, or consult prep",
          alternative: "Decisions before priorities are clear",
        },
      ],
      ctaTitle: "Start with one photo. Decide with more context.",
      ctaBody: "Use a front-facing photo in even light. Sign-in keeps your quota and paid plan access tied to your account.",
      cta: "Start assessment",
      faqEyebrow: "FAQ",
      faqTitle: "Questions before assessment",
      faq: [
        {
          q: "Do I need to sign in?",
          a: "Yes. Signing in attaches quota and plan access to your account so access stays consistent and verifiable.",
        },
        {
          q: "Where does the main analysis happen?",
          a: "The core assessment runs in your browser. Features that require server-side processing are tied to quota and described before use.",
        },
        {
          q: "What happens if I pay by PromptPay or card?",
          a: "PromptPay is a one-time 30-day grant and does not auto-renew. Card checkout creates a monthly subscription until you cancel.",
        },
        {
          q: "Can I get a refund?",
          a: "Unused paid plans can be refunded within 7 days if no assessment or visual-reference quota has been used after payment. Contact hello@doodee.app or Line @doodee.",
        },
        {
          q: "Is this medical advice?",
          a: "No. DOODEE is an educational facial-analysis report, not a diagnosis, treatment plan, or replacement for a licensed clinician.",
        },
        {
          q: "Why can two photos score differently?",
          a: "Lighting, blur, face angle, distance, and expression affect assessment quality. DOODEE warns you when the photo is likely to reduce confidence.",
        },
      ],
    },
    nav: {
      methodology: "Methodology",
      pricing: "Pricing",
      history: "My reports",
      blog: "Articles",
      faq: "FAQ",
      login: "Log in",
    },
    hero: {
      eyebrow: "FACIAL AESTHETICS REPORT",
      titleLine1: "Read facial proportions",
      titleLine2: "in context",
      subtitle:
        "A private report on proportion, symmetry, photo quality, and pre-consult direction in an Asian facial context.",
      primaryCta: "Start assessment",
      secondaryCta: "How we measure",
    },
    trust: {
      items: [
        { title: "Core assessment runs", body: "in your browser" },
        { title: "Checks", body: "60+ facial metrics" },
        { title: "Calibrated for", body: "Asian features" },
      ],
    },
    aesthetics: {
      eyebrow: "DOODEE AESTHETICS",
      title: "Review 4 improvement paths",
      viewAll: "All procedures",
      details: "Details",
      procedures: [
        {
          title: "Skin quality",
          description: "Improve clarity, texture, and visible fatigue",
          rating: "4.8",
        },
        {
          title: "Volume balance",
          description: "Understand where facial volume affects harmony",
          rating: "4.7",
        },
        {
          title: "Face contour",
          description: "Review jaw, cheek, and lower-face definition",
          rating: "4.6",
        },
        {
          title: "Photo quality",
          description: "Reduce blur, angle, and lighting issues before judging",
          rating: "4.6",
        },
      ],
    },
  },
  photoQuality: {
    titleBad: "Readable, but confidence is lower",
    titleWarn: "Photo works, but could be steadier",
    retake: "Retake if you want",
    fix: {
      blurry: "Focus is a bit soft. Retake only if you want a steadier reading",
      tooDark: "Lighting is a bit low. Retake near soft light if needed",
      tooBright: "Lighting is strong. Retake away from direct light if needed",
      flatLight: "Lighting is uneven. Soft front light can make results steadier",
      facePose: "The angle can affect some measurements, but a clear face is still usable",
      tooFar: "Face is a little far. Move closer only if you retake",
      tooClose: "Face is close to the edge. Move back only if you retake",
      eyesClosed: "Eyes look partly closed. Retake with natural open eyes if needed",
      mouthOpen: "Mouth is open. Closed mouth gives steadier proportions if you retake",
      extremeSmile: "A large smile can shift some ratios. Relaxed expression is steadier if you retake",
      hairCoversFace: "Hair may be covering part of the forehead. Pull hair back from the face if you retake",
      unevenLight: "Light is falling unevenly on both sides. Face the light straight-on if you retake",
    },
  },
  scan: {
    title: "Assessment",
    titleMeta: "Assessment — DOODEE",
    subtitle:
      "Front-facing photo, neutral expression. Core measurements run locally; online features ask before use.",
    dropPrompt: "Drop a front-facing photo, or",
    dropSide: "Drop a side profile, or",
    chooseFile: "Choose photo",
    takePhoto: "Take photo",
    privateNote: "Processed in your browser. Not uploaded.",
    loadingModel: "Setting up the analyzer (one-time, ~3 MB)…",
    processing: "Reading facial structure…",
    processingSide: "Processing side profile…",
    noFace: "No face detected. Try a clearer front-facing photo.",
    failed: "Failed to process photo.",
    tryAnother: "Try another photo",
    scanAnother: "Assess another photo",
    calibration: "Calibration:",
    tryOnCtaEyebrow: "Optional style reference",
    tryOnCtaTitle: "Review hair, lip, eye, and blush options on your photo.",
    tryOnCtaBody:
      "Compare restrained styling references on one canvas. Processing stays in your browser.",
    tryOnCtaCta: "Open reference hub",
    addSideTitle: "Add a side profile",
    addSideBadge: "+3 metrics",
    addSideDescription:
      "Adds nasolabial angle, facial convexity, and lip position vs Ricketts E-line.",
    sideAdded: "✓ Side profile processed",
    tipsLabel: "For sharper analysis",
    tip1: "Face the camera head-on. A tilted head can make the jaw look flared and drop reading confidence.",
    tip2: "Even, frontal light. Side-lit photos can throw off measurements around the eyes.",
    tip3: "No hand / hair / eyewear covering eyebrows, eyes, or mouth corners.",
    tip4: "Higher-resolution photos give better skin analysis (forehead + cheek + chin patches).",
    sampleLink: "View an example report first",
  },
  scanCockpit: {
    title: "Facial assessment",
    subtitle:
      "Review facial proportions, visual references, and consult-ready next steps from your report.",
    smartOn: "Guidance: On",
    smartOff: "Guidance: Off",
    smartChecking: "Checking system...",
    inProgress: "Reading facial structure...",
    metrics: {
      sharpness: "Sharpness",
      light: "Lighting",
      headAngle: "Head angle",
      quality: "Quality",
    },
    qualityLabels: {
      good: "Excellent",
      warn: "Good",
      bad: "Fair",
    },
    progress: {
      processing: "Processing",
      aiAnalyzing: "Preparing report",
      etaLabel: "Estimated time remaining",
      unit: "seconds",
    },
    tipsHeader: "Assessment tips",
    tips: {
      light: "Use bright, even light",
      lookStraight: "Look straight without tilting",
      noObstruction: "No eyewear / hat / mask",
      distance: "Keep about 40-60 cm from the camera",
    },
    bestPractices: {
      header: "Recommended assessment setup",
      a: "Look straight - keep your face centered",
      b: "Enough light - stand in a bright, even space",
      c: "No obstruction - avoid hats, eyewear, or masks",
      d: "Still and clear - keep your face steady while scanning",
    },
    cancel: "Cancel assessment",
    historyHeader: "Report history",
    historyViewAll: "View all",
    historyEmpty: "No history yet - start your first report",
    historyDetail: "Details",
    whyHeader: "What DOODEE helps with",
    why: {
      a: {
        title: "Measurement-based report",
        body: "The system reads facial reference points and proportions to create a report you can trace back to measurements.",
      },
      b: {
        title: "Readable results",
        body: "Overall score, category scores, photo quality, and next steps are separated so the report is easier to use.",
      },
      c: {
        title: "Decision-support references",
        body: "Use visual references as early context before choosing a direction or speaking with a clinician.",
      },
      d: {
        title: "Privacy-aware by design",
        body: "The core assessment runs in your browser, and stored data stays within the limits described in the privacy policy.",
      },
    },
  },
  calibration: {
    male: "Male",
    female: "Female",
    universal: "Universal",
    asian: "Asian",
  },
  profilePrefs: {
    ageRangeLabel: "Age range",
    goalLabel: "Main goal",
    aestheticReferenceLabel: "Aesthetic reference",
    age18_24: "18-24",
    age25_34: "25-34",
    age35_44: "35-44",
    age45Plus: "45+",
    goalSkin: "Skin",
    goalHair: "Hair",
    goalFaceBalance: "Facial balance",
    goalPreClinic: "Before clinic",
    goalOverall: "Overall look",
    refNaturalClean: "Natural / clean",
    refKBeauty: "K-beauty inspired",
    refWesternModel: "Western model inspired",
    refThaiEveryday: "Thai everyday look",
    refNoPreference: "No preference",
  },
  redeem: {
    title: "Redeem a code",
    subtitle:
      "Enter a code from DOODEE to upgrade your plan or claim bonus credits.",
    inputLabel: "Code (3–64 characters)",
    inputPlaceholder: "e.g.  PRO7DAYS",
    submit: "Redeem",
    submitting: "Checking…",
    successTitle: "Redeemed!",
    successCta: "Start assessment",
    newPlanLabel: "New plan",
    activeUntilLabel: "Active until",
    currentPlanLabel: "Current plan",
    expiresLabel: "Expires",
    noCodeCta: "No code? See available plans",
    errors: {
      COUPON_NOT_FOUND: "Code not found — check the spelling.",
      COUPON_DISABLED: "This code has been disabled.",
      COUPON_EXPIRED: "This code has expired.",
      COUPON_DEPLETED: "All redemptions for this code have been used.",
      COUPON_ALREADY_REDEEMED:
        "You have already used this code — it can only be redeemed once.",
      COUPON_NO_SUBSCRIPTION:
        "No subscription record yet — try refreshing the page.",
      COUPON_STRIPE_ONLY:
        "This is a Stripe discount code — enter it at checkout in /upgrade instead.",
      COUPON_BAD_GRANT_TIER:
        "Code is misconfigured — please contact an admin.",
      COUPON_BAD_GRANT_DAYS:
        "This code has no duration set — please ask an admin to fix it.",
      INVALID_CODE_FORMAT:
        "Codes are 3–64 letters, digits, hyphens, or underscores.",
      UNAUTHORIZED: "Your session expired — please sign in again.",
      NETWORK: "Network issue — try again.",
      UNKNOWN: "Unexpected error — try again.",
    },
    grantedDuration: "Duration",
    grantedDays: "days",
    grantedScans: "Assessments",
    grantedScansUnit: "assessments",
    grantedPreviews: "References",
    grantedPreviewsUnit: "references",
    bonusScans: "Bonus assessments",
    bonusPreviews: "Bonus references",
  },
  onboarding: {
    skip: "Skip",
    next: "Next",
    start: "Get started",
    slides: [
      {
        title: "Upload one head-on photo",
        body: "Use a clear, head-on photo in even light. Core measurements run in your browser; online features are shown before use.",
      },
      {
        title: "We measure 60+ facial proportions",
        body: "Per-metric scoring with ideal ranges, percentile vs population, head-pose confidence, and skin analysis from forehead/cheeks/chin patches.",
      },
      {
        title: "Tap any metric for the breakdown",
        body: "See what was measured, the reference range, confidence context, and care-level options (self-care / cosmetic / clinician consult).",
      },
      {
        title: "Preview a hair color",
        body: "Choose a hair color for your photo, process it on your device, and save a PNG.",
      },
      {
        title: "Private by design",
        body: "Photos and the measurements drawn from them stay on this device. History lives in your browser only. Read the privacy page for full details.",
      },
    ],
    wizard: {
      skip: "Skip for now",
      next: "Continue",
      back: "Back",
      genderQuestion: "Which gender should this report use for context?",
      genderHint:
        "Used only to tune report context. You can change it later in settings.",
      ageQuestion: "What age range are you in?",
      ageHint: "Used as Day 1 Face Profile context, not as a judgment.",
      goalQuestion: "What do you want to improve first?",
      goalHint: "This helps prioritize your report and recommendations.",
      referenceQuestion: "Which look reference should we compare with?",
      referenceHint:
        "Used as style context only, not as race or ethnicity calibration.",
      s1Title: "Welcome to DOODEE",
      s1Subtitle:
        "Create a lightweight Face Profile so your Day 1 report starts with the right context.",
      s1GenderLabel: "Gender you identify as",
      s1AgeLabel: "Age range",
      s1GoalLabel: "Main goal",
      s1ReferenceLabel: "Aesthetic reference",
      s2Title: "How it works",
      s2Subtitle: "Facial analysis with privacy in mind.",
      s2Bullet1Title: "60+ measurements on this device",
      s2Bullet1Body:
        "The system measures core facial proportions in your browser. Online report features are shown before use.",
      s2Bullet2Title: "Scores with context",
      s2Bullet2Body:
        "The report blends facial proportions, photo quality, skin signals, and any enabled model, then shows confidence context.",
      s2Bullet3Title: "History stays in your browser",
      s2Bullet3Body:
        "All scans, photos, and scores live in your local storage. You can wipe them anytime from the history page.",
      s3Title: "Ready — where do you want to begin?",
      s3Subtitle:
        "Choose the first tool based on your goal. You can switch anytime from the bottom navigation.",
      s3ScanLabel: "Run your first assessment",
      s3ScanBody:
        "Upload or take a front-facing photo to receive a structured report with confidence notes.",
      s3TryOnLabel: "Preview a look",
      s3TryOnBody:
        "Change lip, eye, hair, and blush colours in-browser. No quota used.",
      s3UpgradeLabel: "See the plans",
      s3UpgradeBody:
        "Basic starts with one face assessment. Upgrade when you need more quota, visual references, and reporting tools.",
      male: "Male",
      female: "Female",
      age18_24: "18-24",
      age25_34: "25-34",
      age35_44: "35-44",
      age45Plus: "45+",
      goalSkin: "Skin",
      goalHair: "Hair",
      goalFaceBalance: "Facial balance",
      goalPreClinic: "Before clinic",
      goalOverall: "Overall look",
      refNaturalClean: "Natural / clean",
      refKBeauty: "K-beauty inspired",
      refWesternModel: "Western model inspired",
      refThaiEveryday: "Thai everyday look",
      refNoPreference: "No preference",
    },
  },
  multiFrame: {
    label: "More stable reading",
    title: "Average multiple photos",
    body: "Facial measurements carry about 1-3% jitter. Add 2-4 more head-on photos of the same face — scores will be re-computed from the averaged readings, reducing noise by roughly √n.",
    addPrompt: "Add photo",
    maxed: "Averaged across {n} photos — that's the max.",
  },
  camera: {
    title: "Live camera",
    subtitle:
      "Align your face within the frame and look at the lens. Capture stays in your browser.",
    capture: "Capture",
    flip: "Flip",
    cancel: "Cancel",
    denied:
      "Camera access denied. Allow permission in your browser settings to use live capture.",
    unsupported:
      "This browser doesn't support camera access. Try Chrome, Safari, or Firefox.",
    failed: "Capture failed. Try again or upload a file instead.",
    open: "Open camera",
    qualityOk: "Looks good",
    qualityWarn: "Hold steady",
    qualityBad: "Adjust lighting or focus",
  },
  result: {
    overall: "Overall harmony score",
    outOf: "out of 10.0",
    overview: "Overview",
    hint: "Tap any metric for the source, reference-range comparison, and a detail view.",
    yourMeasurement: "Your measurement",
    idealRange: "Reference range",
    score: "Score",
    measured: "measured",
    ideal: "reference",
    metricDetail: "Metric detail",
    source: "Source",
    percentile: "{pct}th percentile",
    overallDistribution: "Overall score distribution",
    metricDistribution: "Metric distribution",
    evidenceResearch: "Research-backed",
    evidenceApproximated: "Approximated",
    flaggedLabel: "Not confident",
    flaggedTitle: "Measurement not reliable enough to score",
    flaggedMessage:
      "The reading falls outside the range of any plausible human face — almost always a measurement issue rather than a real outlier (caused by pose, lighting, or something covering the face). This metric is excluded from the category and overall scores. Try a clearer head-on photo in even light with no hand, hair, or eyewear on key points.",
    implicationsLabel: "May indicate",
    aboutLabel: "About this metric",
    howCalculatedLabel: "How the score is calculated",
    howCalculatedExplanation:
      "Values inside the reference range score higher. Outside that range, the score gradually tapers based on distance from the range, then compares against a population-style benchmark.",
    categoryAverage: "Category average",
    yourStrengths: "Your strengths",
    improvementAreas: "Areas to improve",
    bestMetric: "Highest",
    worstMetric: "Lowest",
    radarLabel: "Per-category radar",
    viewAllTiers: "View all tiers",
    tipLabel: "What you can do",
    share: "Share",
    download: "Save",
    shareTitle: "My doodee score",
    shareText: "My DOODEE report: {score} ({tier}). View your own private assessment.",
    planTab: "Plan",
    planHeading: "Metrics to prioritize",
    planSubtitle:
      "The 5 metrics to read first, ordered by impact, with care-level options (self-care → cosmetic → clinician consult).",
    planEmpty:
      "No priority issue is clear from this photo.",
    populationLabel: "vs population",
    populationPercentileLine: "Top {pct}% in the population",
    lowConfidence:
      "Photo quality / pose lowered the analysis confidence to {pct}%. Try a head-on shot in even light for sharper results.",
    percentileTooltip:
      "Percentile compares your score with DOODEE's reference range. Higher means you are in a higher-scoring band.",
    confidenceTooltip:
      "How reliable this measurement is given the head pose. Sub-100% pulls the score toward a neutral 5.5 to avoid over-confident judgements.",
    geometricShort: "G",
    secondOpinionShort: "S",
    learnedShort: "L",
    learnedAnalyzing: "L: processing…",
    blendTooltip:
      "Final score combines measured proportions, skin and photo quality, and model review when available, so the result does not depend on a single number.",
  },
  status: {
    good: "Good",
    borderline: "Borderline",
    poor: "Below ideal",
  },
  category: {
    harmony: "Harmony",
    angularity: "Angularity",
    dimorphism: "Dimorphism",
    "eye-area": "Eye Area",
    features: "Features",
    symmetry: "Symmetry",
  },
  categoryDescription: {
    harmony:
      "Classical facial proportions — golden ratio, facial thirds, distances between eye/nose/mouth. Faces close to canonical ratios feel balanced and natural.",
    angularity:
      "Sharpness of facial bones — jaw angle, eye and brow tilt. Higher values feel firm, masculine, or chiseled; softer values feel gentler.",
    dimorphism:
      "Sex-typical features — jaw width, midface proportions, chin height, mouth-corner tilt. Ideal ranges differ between male and female.",
    "eye-area":
      "The eye region — size, shape, position, tilt, symmetry. The most attention-grabbing area in facial attractiveness judgments.",
    features:
      "Side-profile facial features — nose dorsum, lip thickness, chin position. Measured from the profile photo.",
    symmetry:
      "Left/right symmetry of the eyes, mouth, brows, nose, and jaw. Shown for context and not directly weighted into the overall score.",
  },
  metric: {
    "canthal-tilt": "Canthal Tilt",
    fwhr: "Face Width-to-Height Ratio",
    "gonial-angle": "Gonial Angle",
    "golden-ratio": "Golden Ratio",
    "facial-thirds": "Facial Thirds",
    "eye-spacing-ratio": "Eye Spacing Ratio",
    "nose-mouth-ratio": "Nose–Mouth Ratio",
    "upper-lower-lip-ratio": "Upper–Lower Lip Ratio",
    "philtrum-chin-ratio": "Philtrum–Chin Ratio",
    "lower-third-ratio": "Lower-Third Ratio",
    "inter-pupillary-ratio": "Inter-Pupillary Ratio",
    "lip-fullness": "Lip Fullness",
    "nasolabial-angle": "Nasolabial Angle",
    "facial-convexity": "Facial Convexity",
    "lip-e-line": "Lip Position (E-line)",
    "palpebral-fissure-aspect": "Palpebral Fissure Aspect",
    "eyebrow-eye-distance": "Eyebrow-Eye Distance",
    "brow-tilt": "Brow Tilt",
    "eye-width-to-face": "Eye Width / Face Width",
    "eye-symmetry": "Eye Symmetry",
    "jaw-width-to-cheek-ratio": "Jaw-to-Cheek Width Ratio",
    "midface-ratio": "Midface Ratio",
    "chin-height-ratio": "Chin Height",
    "mouth-corner-tilt": "Mouth-Corner Tilt",
    "mouth-width-to-face": "Mouth Width / Face Width",
    "mouth-symmetry": "Mouth Symmetry",
    "nose-symmetry": "Nose Symmetry",
    "brow-symmetry": "Brow Symmetry",
    "jaw-symmetry": "Jaw Symmetry",
    "mentolabial-angle": "Mentolabial Angle",
    "forehead-inclination": "Forehead Inclination",
    "nasal-dorsum-angle": "Nasal Dorsum Angle",
    "chin-projection": "Chin Projection (side)",
    "upper-lip-protrusion-side": "Upper-Lip Protrusion (side)",
    "right-canthal-tilt": "Right Canthal Tilt",
    "interbrow-distance": "Interbrow Distance",
    "eye-mouth-distance-ratio": "Eye-Mouth Distance",
    "lower-face-height-ratio": "Lower-Face Height",
    "lower-lip-protrusion-side": "Lower-Lip Protrusion (side)",
    "alar-base-width": "Alar Base Width",
    "nose-tip-angle": "Nose Tip Angle",
    "cupids-bow-height": "Cupid's Bow Height",
    "forehead-width-ratio": "Forehead Width Ratio",
    "eye-tilt-symmetry": "Eye Tilt Symmetry",
    "nose-length-ratio": "Nose Length",
    "mouth-chin-distance-ratio": "Mouth-to-Chin Distance",
    "brow-arch-height": "Brow Arch Height",
    "upper-lid-show": "Upper Lid Show",
    "philtrum-length-ratio": "Philtrum Length",
    "mouth-tilt": "Mouth Tilt",
    "eye-aspect-ratio": "Eye Aspect Ratio",
    "mouth-aspect-ratio": "Mouth Aspect Ratio",
    "bizygomatic-width-ratio": "Cheek-to-Forehead Width",
    "chin-width-ratio": "Chin Width",
    "nasal-bridge-width": "Nasal Bridge Width",
    "brow-thickness-symmetry": "Brow Thickness Symmetry",
    "eye-vertical-symmetry": "Eye Height Symmetry",
    "forehead-height-ratio": "Forehead Height",
    "eyebrow-arch-position": "Brow Arch Position",
    "lip-corner-tilt": "Lip Corner Tilt",
  },
  metricNote: {
    "canthal-tilt":
      "Upward-tilted outer canthus (positive tilt) signals youth and alertness; downward tilt may indicate fatigue, aging, or a sleepy/sad appearance.",
    fwhr:
      "High width-to-height ratio correlates with perceived dominance in males (Carré & McCormick 2008). Low values suggest a longer, narrower face which reads softer.",
    "gonial-angle":
      "A narrow angle is a sharp, masculine jaw (male ideal). A wider angle is softer, or can indicate age-related tissue laxity.",
    "golden-ratio":
      "Face height ÷ width near phi (1.618) is the classical ratio. Lower values look wider; higher values look elongated.",
    "facial-thirds":
      "The face should divide into three equal thirds (forehead / midface / lower). A short upper third makes the face feel unbalanced.",
    "eye-spacing-ratio":
      "Inter-canthal distance = one eye width (~1.0). Wider (hyperteleorism) feels off; closer (hypoteleorism) creates a tense look.",
    "nose-mouth-ratio":
      "Mouth ~1.5× wider than the nose base is the classical ratio. Smaller looks unremarkable; wider looks disproportionate.",
    "upper-lower-lip-ratio":
      "Lower lip should be fuller than upper (~0.6-0.7). Higher ratios look unnatural (top-heavy).",
    "philtrum-chin-ratio":
      "Philtrum should be about half the chin segment. Off-balance ratios make the lower face look elongated.",
    "lower-third-ratio":
      "In the lower face third: upper lip 1 part, lower lip + chin 2 parts.",
    "inter-pupillary-ratio":
      "Inter-pupillary distance ~46% of face width. Off values make eyes appear too wide or too close.",
    "lip-fullness":
      "Fuller lips signal youth and femininity. Thinner lips may indicate age (vermillion atrophy).",
    "nasolabial-angle":
      "Wider angle = upturned nose tip; narrower angle = drooping or aging nose tip.",
    "facial-convexity":
      "Gently convex profile (165-178°) looks natural. Flat (~180°) looks expressionless; very convex (<165°) protrudes.",
    "lip-e-line":
      "Upper lip slightly behind the Ricketts E-line (Caucasian ≈ -4 mm, Asian ≈ -2 mm). Excessive protrusion suggests lip or jaw skeletal issues.",
    "palpebral-fissure-aspect":
      "Higher height/width ratio = wide-open, expressive eyes. Lower values may indicate eyelid hooding, sleepiness, or age-related changes.",
    "eyebrow-eye-distance":
      "Higher brow-eye gap = lifted brow look. Low gap may indicate low brow, hooded eyelids, or age-related brow ptosis.",
    "brow-tilt":
      "A lifted outer brow can make the eye area look more open and defined. A flat or drooping brow can look tired. Men usually carry less arch than women.",
    "eye-width-to-face":
      "Eye width around 0.20 of face width is the classical reference. Smaller eyes can reduce visual emphasis in the eye area; larger eyes can look disproportionate.",
    "eye-symmetry":
      "Left/right canthi should mirror across the midline. 2 mm of asymmetry is the perception threshold — eyes are the most sensitive feature.",
    "jaw-width-to-cheek-ratio":
      "High jaw-to-cheek ratio = squarer masculine face; low = tapered feminine. Ideal differs by sex.",
    "midface-ratio":
      "Midface height ÷ upper face. Women tend toward a slightly longer midface than men.",
    "chin-height-ratio":
      "Taller chin segment = masculine; shorter = feminine. Low values in men may indicate a weak jaw / microgenia.",
    "mouth-corner-tilt":
      "A slight upturn looks friendly and approachable. Downturned corners suggest sadness, fatigue, or age-related mouth droop.",
    "mouth-width-to-face":
      "Wider mouth is a signal of evolutionary selectivity; smaller looks reserved. Women trend slightly wider than men.",
    "mouth-symmetry":
      "Left/right corners should be symmetric. An uneven smile is highly visible — 3 mm perception threshold.",
    "nose-symmetry":
      "Left/right alars should be symmetric. Nasal-tip deviation can indicate trauma or genetics — 4 mm threshold.",
    "brow-symmetry":
      "Left/right brows should be symmetric — visible when raising brows. 3.5 mm threshold.",
    "jaw-symmetry":
      "Left/right jaw angles should be symmetric. The most-tolerated landmark for asymmetry — 6 mm threshold.",
    "mentolabial-angle":
      "Optimal angle (120-140°) looks natural. Too wide = chin juts out; too narrow = chin appears short.",
    "forehead-inclination":
      "A slight backward slope reads masculine. A vertical forehead looks more youthful. Excessive slope suggests a strong brow ridge.",
    "nasal-dorsum-angle":
      "A perpendicular dorsum (25-45°) = projecting nose. Asians tend flatter (22-40°). Very low values = flat bridge.",
    "chin-projection":
      "Moderate chin projection makes a strong profile. A retrognathic (set-back) chin reads as a weak appearance — common in age-related jaw atrophy.",
    "upper-lip-protrusion-side":
      "A slightly projected upper lip can balance the side profile. Excessive projection may relate to lip, dental, or jaw proportions.",
    "right-canthal-tilt":
      "Right-eye tilt should match the left. Large differences indicate eye-region asymmetry.",
    "interbrow-distance":
      "Moderate inter-brow gap. Too close = intense; too far = vacant. Asians trend wider.",
    "eye-mouth-distance-ratio":
      "Eye-to-mouth distance ~1/3 of face height. Shorter = compressed face; longer = elongated.",
    "lower-face-height-ratio":
      "Lower face ~1/3 of total height. Higher = elongated lower face (more male-typed); lower = compressed.",
    "lower-lip-protrusion-side":
      "A slightly supported lower lip can improve side-profile balance. Excessive projection may come from jaw or bite structure.",
    "alar-base-width":
      "Width of the nasal base relative to the face. Higher = wider nose, lower = narrower. Asian populations are anatomically wider than Caucasian.",
    "nose-tip-angle":
      "A sharper tip angle reads as a more defined, refined nose. A very wide angle suggests a bulbous tip or broad alar base.",
    "cupids-bow-height":
      "A defined cupid's bow above the mouth-corner line reads youthful and feminine. A flat upper lip can read androgynous or aged.",
    "forehead-width-ratio":
      "A wider forehead reads more masculine; a tapered upper face reads more feminine. Departures from canon can read off-balance.",
    "eye-tilt-symmetry":
      "Left and right canthal tilts should match. Differences above ~3° are visible as one eye 'looking sleepier' than the other.",
    "nose-length-ratio":
      "Nose ~1/3 of face height is the classical canon. Longer = elongated midface (often age-related); shorter = compressed.",
    "mouth-chin-distance-ratio":
      "Lower-lip-to-chin span balances the lower lower-third. Too short reads as a weak chin; too long as an elongated lower face.",
    "brow-arch-height":
      "A clear arch reads sculpted and feminine in women; flatter brows read more masculine in men.",
    "upper-lid-show":
      "Gap between the upper lid and the brow apex. A smaller gap suggests hooded eyes or low brow — common with age.",
    "philtrum-length-ratio":
      "A short philtrum reads youthful and feminine. Elongation is a well-known aging marker (loss of upper-lip support).",
    "mouth-tilt":
      "The mouth-corner line should sit close to the eye line. Visible tilt can reflect expression or uneven mouth-corner lift; consult a clinician if it appears suddenly.",
    "eye-aspect-ratio":
      "Open, alert eyes drive the bulk of perceived youth + engagement. Low EAR signals fatigue, hooded lids, or natural Asian monolid morphology.",
    "mouth-aspect-ratio":
      "Fuller, more vertically-developed lips read youthful. Very thin lips lose the cupid's-bow definition and age the lower face.",
    "bizygomatic-width-ratio":
      "Cheekbones equal to forehead = oval face (universally well-received). Cheekbones much wider = diamond/heart (striking, can be feminine). Narrower = long/oblong.",
    "chin-width-ratio":
      "Wider chin reads more masculine and grounded. Pointier chin reads more feminine and youthful. Surgery shifts the morphology either way.",
    "nasal-bridge-width":
      "Narrower bridge = defined / aquiline. Wider/flatter = anatomically common in Asian faces — the Asian-calibrated range tolerates this without penalty.",
    "brow-thickness-symmetry":
      "Both brows should have similar vertical extent. Asymmetry suggests uneven grooming or congenital ptosis.",
    "eye-vertical-symmetry":
      "Both eyes should sit at the same height. Vertical offset is a subtle aging marker (uneven brow drop, hooded lid asymmetry).",
    "forehead-height-ratio":
      "The Vitruvian thirds put forehead at ~33%. High forehead reads more masculine; very low can suggest receding hairline or proportions skewed toward the lower face.",
    "eyebrow-arch-position":
      "Westmore 1974: peak at the lateral 2/3 of the brow. Centered apex reads flat. Outer-2/3 lift reads classically feminine.",
    "lip-corner-tilt":
      "Resting smile lift reads approachable and youthful. Downturned corners (~Lower than cupid's bow) read stern or aged.",
  },
  metricTip: {
    "canthal-tilt":
      "Start with sleep, reduced puffiness, and eye styling. For lasting changes, discuss options with a licensed specialist.",
    fwhr:
      "fWHR is skeletal — hard to change behaviorally. Lose weight / cool sculpt around the cheeks for sharper structure. Final option: buccal fat removal.",
    "gonial-angle":
      "Jaw muscle work (mewing / chewing gum) helps slightly (Tier 1). Too wide: masseter botox. Too narrow: jaw filler / implant (Tier 3).",
    "golden-ratio":
      "Skeletal proportion — hard to change. Hair styling and makeup contouring help disguise.",
    "facial-thirds":
      "Hair styling is the easiest lever (Tier 1). Hairline tattoo for short forehead (Tier 2). Brow lift / forehead reduction for severe cases (Tier 3).",
    "eye-spacing-ratio":
      "Genetics — eye-contouring makeup can shift the apparent spacing as a quick fix.",
    "nose-mouth-ratio":
      "Lip filler widens the mouth (Tier 2); rhinoplasty alar reduction narrows the nose base (Tier 3).",
    "upper-lower-lip-ratio":
      "Lip filler adjusts the ratio directly — add to lower if too thin, add to upper if too thin.",
    "philtrum-chin-ratio":
      "Chin filler / implant lengthens the chin segment; lip lift shortens an overly long philtrum.",
    "lower-third-ratio":
      "Lip filler + chin augmentation rebalance the lower-third proportions.",
    "inter-pupillary-ratio":
      "Genetics — eye-makeup contouring shifts apparent eye spacing.",
    "lip-fullness":
      "Hydrate + lip plumper (Tier 1); hyaluronic-acid lip filler at a clinic (Tier 2-3).",
    "nasolabial-angle":
      "Rhinoplasty (tip rotation) is the primary option — droopy tip can be lifted; upturned tip can be lowered.",
    "facial-convexity":
      "Orthognathic evaluation for severe cases; clinician-led chin contouring and rhinoplasty evaluation for milder profile concerns.",
    "lip-e-line":
      "Three-point adjustment: rhinoplasty (nose), lip work (lips), chin augmentation (chin) — must be planned together.",
    "palpebral-fissure-aspect":
      "Sleep + reduce swelling + caffeine eye cream (Tier 1); double-eyelid tape / glue (Tier 2); blepharoplasty / double-eyelid surgery / ptosis correction (Tier 3).",
    "eyebrow-eye-distance":
      "Botox brow lift (Tier 2); surgical brow lift / forehead lift (Tier 3); microblading higher to lift the apparent brow line.",
    "brow-tilt":
      "Brow shaping / threading / microblading adjust the angle (Tier 1-2); permanent brow lift (Tier 3).",
    "eye-width-to-face":
      "Genetics — eye makeup can widen / narrow the apparent eye.",
    "eye-symmetry":
      "Eye-makeup contouring + lash differences (Tier 1); upper blepharoplasty correction for unilateral ptosis (Tier 3).",
    "jaw-width-to-cheek-ratio":
      "Weight loss / masseter botox to narrow a wide jaw (Tier 2); jaw filler / mandibular reduction (Tier 3).",
    "midface-ratio":
      "Cheek filler / malar implant to add midface height (Tier 3).",
    "chin-height-ratio":
      "Chin filler / implant / genioplasty — extends chin length directly.",
    "mouth-corner-tilt":
      "Corner-of-mouth exercise (Tier 1); botox at depressor anguli oris to prevent downturn (Tier 2); corner-of-mouth lift surgery (Tier 3).",
    "mouth-width-to-face":
      "Genetics — lip filler can widen the mouth slightly; lip-line tattoo can extend the apparent shape.",
    "mouth-symmetry":
      "Practice balanced smiling and compare relaxed expressions. If asymmetry appears suddenly, consult a clinician.",
    "nose-symmetry":
      "Rhinoplasty for a deviated nose (trauma- or genetics-related).",
    "brow-symmetry":
      "Brow grooming / microblading (Tier 1-2) — one of the easiest features to symmetrize.",
    "jaw-symmetry":
      "Orthodontics if from a malocclusion (Tier 2); orthognathic surgery for severe cases (Tier 3).",
    "mentolabial-angle":
      "Chin filler / implant adjusts the mentolabial sulcus angle.",
    "forehead-inclination":
      "Genetics — bangs can disguise an overly sloped forehead.",
    "nasal-dorsum-angle":
      "Augmentation rhinoplasty (silicone/cartilage implant) raises the dorsum — the most common procedure for Asian patients seeking a taller bridge.",
    "chin-projection":
      "Chin filler / implant / genioplasty (sliding genioplasty for severe cases).",
    "upper-lip-protrusion-side":
      "Orthodontics for protrusive teeth; lip reduction / lip lift for the lip itself.",
    "right-canthal-tilt":
      "Same as canthal-tilt — rest + canthopexy / canthoplasty.",
    "interbrow-distance":
      "Genetics — brow grooming can shift the apparent gap.",
    "eye-mouth-distance-ratio":
      "Skeletal proportion — disguise via contouring / hair styling.",
    "lower-face-height-ratio":
      "Orthognathic surgery for severely long / short lower face; chin augmentation for minor adjustments.",
    "lower-lip-protrusion-side":
      "Orthodontics for protrusive teeth; lip filler / lip reduction for the lip itself.",
    "alar-base-width":
      "Alar base reduction (rhinoplasty) to narrow a wide nose base (Tier 3) — a common request in Asian rhinoplasty.",
    "nose-tip-angle":
      "Tip-refining rhinoplasty can reshape the tip; alar reduction can tighten the base. A clinician should assess the nasal structure before choosing an approach.",
    "cupids-bow-height":
      "Lip lift sharpens the bow + shortens the philtrum (Tier 3); microblading the lip line or lip filler with bow-emphasis adds shape (Tier 2).",
    "forehead-width-ratio":
      "Skeletal — disguise via hairline / hairstyle (Tier 1). Tier 3 fronto-temporal contouring is rare and risky.",
    "eye-tilt-symmetry":
      "Asymmetric eye-makeup contouring (Tier 1); unilateral canthopexy / blepharoplasty for genuine skeletal-soft-tissue asymmetry (Tier 3).",
    "nose-length-ratio":
      "Rhinoplasty (tip-rotation, dorsum shortening) for a long nose; chin augmentation to balance overall vertical proportions (Tier 3).",
    "mouth-chin-distance-ratio":
      "Chin filler / implant / genioplasty extends the chin segment; lip lift shortens long lower lip area (Tier 2-3).",
    "brow-arch-height":
      "Brow shaping / microblading / threading sets the arch (Tier 1-2). Surgical brow lift or arch-creating browlift for permanent change (Tier 3).",
    "upper-lid-show":
      "Caffeine eye cream + sleep + reduce swelling (Tier 1); botox brow lift (Tier 2); upper blepharoplasty / browlift for hooded eyes (Tier 3).",
    "philtrum-length-ratio":
      "Lip lift (subnasale lift) shortens the philtrum directly — the most common procedure for upper-lip aging (Tier 3).",
    "mouth-tilt":
      "Practice balanced smiling and compare relaxed expressions. If the tilt appears suddenly, consult a clinician.",
    "eye-aspect-ratio":
      "Sleep + caffeine eye cream (Tier 1); double-eyelid tape / temporary lash lift (Tier 2); blepharoplasty / ptosis correction / canthoplasty (Tier 3).",
    "mouth-aspect-ratio":
      "Lip-care (exfoliation + hydration) + plumping gloss (Tier 1); hyaluronic-acid lip filler (Tier 2); lip lift surgery (Tier 3).",
    "bizygomatic-width-ratio":
      "Hairstyle to widen/narrow forehead silhouette (Tier 1); cheek filler for prominence OR buccal-fat removal for taper (Tier 2-3).",
    "chin-width-ratio":
      "Jaw-line training + facial massage (Tier 1); chin filler to widen OR fat dissolve to slim (Tier 2); genioplasty (Tier 3).",
    "nasal-bridge-width":
      "Contouring makeup can change apparent width (Tier 1); a rhinoplasty consultation can assess bridge augmentation or osteotomy for structural change (Tier 3).",
    "brow-thickness-symmetry":
      "Brow microblading / shaping to balance thickness (Tier 1-2); brow transplant if a brow is congenitally sparse (Tier 3).",
    "eye-vertical-symmetry":
      "Strengthen periorbital muscles + sleep (Tier 1); botox brow lift on the lower side (Tier 2); ptosis correction surgery (Tier 3).",
    "forehead-height-ratio":
      "Hairstyle (bangs / fringe) shifts apparent forehead height (Tier 1); hairline lowering surgery / forehead reduction (Tier 3).",
    "eyebrow-arch-position":
      "Brow shaping / threading to lift the arch laterally (Tier 1-2); brow lift surgery for stronger lateral arch (Tier 3).",
    "lip-corner-tilt":
      "Massage + facial yoga (Tier 1); botox to depressor anguli oris muscle to lift drooping corners (Tier 2); corner-lift surgery (Tier 3).",
  },
  citation: {
    "canthal-tilt": {
      description:
        "Angle of the palpebral fissure. Positive tilt (outer canthus higher than inner) signals youth and is broadly preferred across cultures.",
      source:
        "Bashour 2007 — 93% of subjects preferred positive tilt; Choi et al. 2020, Arch Craniofac Surg (Korean n=76) confirms mean 8.4°±3.5°.",
    },
    fwhr: {
      description:
        "Bizygomatic width over upper-face height. Correlates with perceived dominance; the ideal range trends slightly higher in male faces.",
      source: "Carré & McCormick 2008, Proc. R. Soc. B 275(1651).",
    },
    "gonial-angle": {
      description:
        "Mandibular angle at the gonion (Ar-Go-Me), measured tragion → gonion → menton. Wider ⇒ softer jawline; tighter ⇒ more angular and (in male faces) more masculine-typed.",
      source:
        "Classical orthognathic literature; cephalometric norms; Korean 3D-CT cohort reports 131-134° (matches the ranges).",
    },
    "golden-ratio": {
      description:
        "Face height ÷ width compared against phi (1.618). Modern meta-analyses dispute universality, but it remains a useful balance check.",
      source:
        "Marquardt mask; cf. 2024 meta-analyses critiquing universal application.",
    },
    "facial-thirds": {
      description:
        "Upper third (hairline → brow) as a fraction of total face height. Classical proportion places it near 1/3.",
      source: "Da Vinci canon; Marquardt mask.",
    },
    "eye-spacing-ratio": {
      description:
        "Inter-canthal distance ÷ single-eye width. Classical canon places the distance equal to one eye width.",
      source: "Farkas anthropometric norms.",
    },
    "nose-mouth-ratio": {
      description:
        "Mouth width ÷ alar (nose-base) width. Classical proportion places the mouth ~1.5× the nose base.",
      source: "Da Vinci canon; aesthetic surgery cephalometry.",
    },
    "upper-lower-lip-ratio": {
      description:
        "Upper-lip vermillion height ÷ lower-lip vermillion height. Lower lip should be the fuller of the two; female ideal skews slightly higher than male.",
      source: "Lip-aesthetic cephalometric norms.",
    },
    "philtrum-chin-ratio": {
      description:
        "Philtrum height ÷ chin height. A balanced lower face places the philtrum at roughly half the chin segment.",
      source: "Farkas anthropometric norms.",
    },
    "lower-third-ratio": {
      description:
        "Upper-lip portion of the lower third. Classical proportion places the upper lip at ~1/3, lower-lip + chin at ~2/3.",
      source: "Da Vinci canon; lower-face cephalometric ratios.",
    },
    "inter-pupillary-ratio": {
      description:
        "Distance between estimated pupil centers ÷ bizygomatic face width. Marquardt-mask canon places this near 0.46.",
      source: "Farkas anthropometric norms; Marquardt mask references.",
    },
    "lip-fullness": {
      description:
        "Vermillion-only summed height (upper + lower) ÷ face height. Higher = fuller. Asian populations are anthropometrically fuller-lipped than Caucasian.",
      source:
        "Coleman & Grover 2006 (universal); Jayaratne et al. — Hong Kong Chinese: vermillion sum 18.88mm (F), 21.18mm (M).",
    },
    "nasolabial-angle": {
      description:
        "Angle at subnasale between columella tangent and upper-lip tangent, measured from a profile photo. Ideal 90–100° (male), 100–110° (female).",
      source:
        "Powell & Humphreys 1984; cephalometric norms; Hwang et al. 2002 Angle Orthod — Korean mean ~91–92°.",
    },
    "facial-convexity": {
      description:
        "Angle at the nose tip formed by glabella–tip–chin in profile. Straight = 180°; gently convex profiles fall 165–178°.",
      source: "Steiner / Ricketts cephalometric norms.",
    },
    "lip-e-line": {
      description:
        "Signed perpendicular offset of the upper lip from the Ricketts E-line (nose tip → chin), normalized by face height. Caucasian ideal ~ -4 mm; Asian ideal closer to the line at ~ -2 mm.",
      source:
        "Ricketts 1968 (universal); Hwang et al. 2002 Angle Orthod — Korean (n=60) upper lip -2.08 mm.",
    },
    "palpebral-fissure-aspect": {
      description:
        "Eye height ÷ eye width. Higher = wider-open eyes. Hong Kong Chinese data shows Asian aspect ratios are actually higher than the older Caucasian-baselined estimates.",
      source:
        "Farkas anthropometric norms (universal); Jayaratne et al. 2013 BioMed Res Int — Hong Kong Chinese (n=103) M 0.418, F 0.459.",
    },
    "eyebrow-eye-distance": {
      description:
        "Vertical gap from the brow apex to the upper eyelid, normalized by face height. Higher = lifted brow. Female ideal sits slightly higher than male.",
      source:
        "Farkas anthropometric norms; Gao et al. 2025 (Chinese n=46) — brow-to-upper-lid central 10–11 mm.",
    },
    "brow-tilt": {
      description:
        "Slope of the eyebrow from inner to outer tip. Positive = arched (outer end higher). Korean women trend more arched than the universal estimate per Kim 2018.",
      source:
        "Aesthetic surgery references; Kim et al. 2018 J Craniofac Surg (Korean women n=99) — mean TOA 12°±5.2°, preferred 10°.",
    },
    "eye-width-to-face": {
      description:
        "Single eye width ÷ bizygomatic face width. Classical canon places this near 0.20.",
      source: "Farkas anthropometric norms; classical canon.",
    },
    "eye-symmetry": {
      description:
        "Positional symmetry of the outer canthi across the face midline (1.0 = perfectly mirrored). Eyelid position is the most sensitive feature for asymmetry detection — observers reliably notice asymmetries of 2 mm or more.",
      source: "Wang et al. 2017, Aesthetic Surgery J 37(4):375-385.",
    },
    "jaw-width-to-cheek-ratio": {
      description:
        "Bigonial width ÷ bizygomatic width. Higher = squarer / more masculine; lower = tapered. Asian range trends slightly higher than universal.",
      source: "Cephalometric dimorphism literature.",
    },
    "midface-ratio": {
      description:
        "Midface vertical span (eye line → mouth) ÷ upper-face span (forehead → eye line). Female ideal sits slightly higher.",
      source: "Cephalometric dimorphism literature.",
    },
    "chin-height-ratio": {
      description:
        "Chin region height (lower lip → chin) as a fraction of total face height. Higher = taller chin (more masculine).",
      source: "Cephalometric dimorphism literature.",
    },
    "mouth-corner-tilt": {
      description:
        "Vertical offset of mouth corners from the lip center. Positive = corners slightly upturned (subtle smile). Female ideal trends positive.",
      source: "Aesthetic dimorphism literature.",
    },
    "mouth-width-to-face": {
      description:
        "Mouth width (corner to corner) ÷ bizygomatic face width. Female ideal trends slightly larger.",
      source: "Cephalometric dimorphism literature.",
    },
    "mouth-symmetry": {
      description:
        "How closely left and right mouth corners mirror across the face midline. Observers reliably detect oral-commissure asymmetries of 3 mm or more.",
      source: "Wang et al. 2017, Aesthetic Surgery J 37(4):375-385.",
    },
    "nose-symmetry": {
      description:
        "Left and right alar bases mirrored across the midline. Nasal-tip deviation detection threshold is ~4 mm.",
      source: "Wang et al. 2017, Aesthetic Surgery J 37(4):375-385.",
    },
    "brow-symmetry": {
      description:
        "Left and right brow apex points mirrored across the midline. Brow-position detection threshold is ~3.5 mm.",
      source: "Wang et al. 2017, Aesthetic Surgery J 37(4):375-385.",
    },
    "jaw-symmetry": {
      description:
        "Left and right gonion (jaw angle) points mirrored across the midline. Chin/jaw deviation is the most-tolerated feature — observers only reliably notice asymmetries of 6 mm or more.",
      source: "Wang et al. 2017, Aesthetic Surgery J 37(4):375-385.",
    },
    "mentolabial-angle": {
      description:
        "Angle at the mentolabial sulcus (crease between lower lip and chin). Ideal 120–140°.",
      source: "Cephalometric norms.",
    },
    "forehead-inclination": {
      description:
        "Angle of the forehead from vertical (apex 10 → glabella 6). Low = vertical, higher = slope-back. Ideal 5–20°.",
      source: "Classical orthognathic profile literature.",
    },
    "nasal-dorsum-angle": {
      description:
        "Angle of the nose dorsum (glabella → tip) from vertical in profile. Higher = nose projects more forward. Asian range trimmed (flatter dorsum typical).",
      source: "Rhinoplasty cephalometric literature.",
    },
    "chin-projection": {
      description:
        "Signed horizontal offset of chin from subnasale, normalized by face height. Positive = chin in front of subnasale; negative = retrognathic.",
      source: "Steiner / Holdaway cephalometric norms.",
    },
    "upper-lip-protrusion-side": {
      description:
        "Signed offset of upper lip from a sn-vertical (subnasale dropped straight down), normalized by face height. Distinct from Ricketts E-line.",
      source: "Cephalometric norms.",
    },
    "right-canthal-tilt": {
      description:
        "Right-eye canthal tilt (mirror of canthal-tilt). Same ideal range; surfaces left-vs-right asymmetry.",
      source: "Bashour 2007.",
    },
    "interbrow-distance": {
      description:
        "Gap between the inner ends of the two eyebrows ÷ bizygomatic face width. Asian range trends slightly higher.",
      source: "Farkas anthropometric norms.",
    },
    "eye-mouth-distance-ratio": {
      description:
        "Vertical distance from the eye line to the mouth line ÷ face height. Classical canon ~1/3.",
      source: "Da Vinci canon; rule of thirds.",
    },
    "lower-face-height-ratio": {
      description:
        "Subnasale → chin distance ÷ total face height. Male ideal trends higher (longer lower face).",
      source: "Cephalometric norms; dimorphism literature.",
    },
    "lower-lip-protrusion-side": {
      description:
        "Signed offset of lower lip from a sn-vertical, normalized by face height. Sibling of upper-lip-protrusion-side.",
      source: "Cephalometric norms.",
    },
    "alar-base-width": {
      description:
        "Alar-to-alar width ÷ bizygomatic face width. Classical ratio ~0.25. Asian populations trend wider anatomically.",
      source: "Rhinoplasty / aesthetic surgery norms; Farkas ethnic-comparison data.",
    },
    "nose-tip-angle": {
      description:
        "Front-view angle at the nasal tip between the two alars. Sharper angle = more defined / narrower tip.",
      source: "Aesthetic rhinoplasty cephalometry; Farkas ethnic-comparison norms.",
    },
    "cupids-bow-height": {
      description:
        "Vertical rise of the philtral peak (cupid's bow) above the mouth-corner line, normalized to face height.",
      source: "Lip-aesthetic anthropometric norms; Coleman & Grover 2006.",
    },
    "forehead-width-ratio": {
      description:
        "Outer-brow span ÷ bizygomatic face width. Classical 0.85–0.95. Female ideal trends slightly narrower.",
      source: "Farkas anthropometric norms; classical cephalometric ratios.",
    },
    "eye-tilt-symmetry": {
      description:
        "Absolute difference between left and right canthal-tilt angles. Observers detect differences above ~3° as a 'sleepy / awake' asymmetry.",
      source: "Wang et al. 2017 + Bashour 2007 (canthal-tilt perception).",
    },
    "nose-length-ratio": {
      description:
        "Sellion → subnasale span (face-frame projected) divided by total face height. Da Vinci canon ~1/3.",
      source: "Da Vinci canon; Farkas anthropometric norms.",
    },
    "mouth-chin-distance-ratio": {
      description:
        "Lower-lip-bottom → chin span / face height. Cephalometric norms place this at ~0.10–0.16.",
      source: "Lower-face cephalometric ratios; Farkas norms.",
    },
    "brow-arch-height": {
      description:
        "Perpendicular distance from the brow apex to the inner–outer brow line, normalized to inter-canthal distance.",
      source: "Aesthetic brow literature; Westmore 1974 brow position rules.",
    },
    "upper-lid-show": {
      description:
        "Upper-lid-margin → brow apex vertical span (face-frame), normalized by face height.",
      source: "Oculoplastic / aging-face literature.",
    },
    "philtrum-length-ratio": {
      description:
        "Subnasale → upper-lip top span (face-frame projected) divided by total face height. Lengthens with age.",
      source: "Farkas anthropometric norms; lip-lift surgical literature.",
    },
    "mouth-tilt": {
      description:
        "Absolute tilt of the mouth-corner line vs the inter-canthal axis (degrees). Roll-invariant.",
      source: "Aesthetic dimorphism literature; smile-symmetry references.",
    },
    "eye-aspect-ratio": {
      description:
        "EAR = (|p2-p6| + |p3-p5|) / (2·|p1-p4|) — 6-point eye hexagon, averaged across both eyes.",
      source: "Soukupová & Čech 2016, ICCV Workshop on Real-Time Eye Blink Detection.",
    },
    "mouth-aspect-ratio": {
      description:
        "Mouth height (upper-lip top → lower-lip bottom) divided by mouth width (outer corners). Captures lip volume distinct from upper/lower thickness ratio.",
      source: "Aesthetic lip-volume literature; rhinoplasty / lip-lift consultation norms.",
    },
    "bizygomatic-width-ratio": {
      description:
        "Cheekbone width (zygion-to-zygion) divided by temple width (bitemporal). Face-shape classifier: oval ~1.0, heart >1.05, oblong <0.95.",
      source: "Farkas anthropometric atlas; Hwang et al. 2012 Korean cohort; Wang et al. 2019 Chinese cohort.",
    },
    "chin-width-ratio": {
      description:
        "Chin base width (148 ↔ 377) divided by face width (preauricular 234 ↔ 454). Wider chin = more square / male; pointier = more feminine.",
      source: "FACE3D anthropometric atlas; ideal jaw morphology in Hwang et al. 2012.",
    },
    "nasal-bridge-width": {
      description:
        "Nasal bridge narrowest width (193 ↔ 417) divided by alar base width (98 ↔ 327). Asian-calibrated range allows wider bridges typical of the population.",
      source: "Rhinoplasty consultation norms; Hwang & Park 2012 Korean rhinometric study.",
    },
    "brow-thickness-symmetry": {
      description:
        "min(leftSpan, rightSpan) / max(leftSpan, rightSpan), where span = vertical extent across (inner, apex, outer) brow landmarks per side.",
      source: "Aesthetic brow literature; approximated.",
    },
    "eye-vertical-symmetry": {
      description:
        "|leftEyeY − rightEyeY| / interPupillaryDistance, projected onto the face-vertical axis for roll invariance.",
      source: "Periorbital symmetry literature; approximated.",
    },
    "forehead-height-ratio": {
      description:
        "Vertical distance from forehead apex (10) to brow midpoint, divided by total face height (forehead → chin). Vitruvian thirds ideal at ~0.33.",
      source: "Vitruvian thirds canon; Farkas anthropometric atlas.",
    },
    "eyebrow-arch-position": {
      description:
        "Distance from brow inner to apex divided by inner-to-outer span, averaged across both brows. Westmore 1974 places ideal at lateral 2/3.",
      source: "Westmore 1974 brow position rules.",
    },
    "lip-corner-tilt": {
      description:
        "Mouth-corner Y minus cupid's-bow Y on the face-vertical axis. Positive = corners above cupid's bow (resting smile); negative = corners below (frown/aged).",
      source: "Aesthetic mouth-positioning literature; approximated.",
    },
  },
  tier: {
    gigachad: "Exceptional",
    chad: "Very high",
    chadlite: "High",
    goddess: "Exceptional",
    stacy: "Very high",
    stacylite: "High",
    htn: "Above average",
    mtn: "Average",
    ltn: "Below average",
  },
  tierDescription: {
    gigachad: "Top 1-5% — unusually strong measured facial proportions.",
    chad: "Top 10-15% — strong measured proportions across several categories.",
    chadlite: "Top 20-30% — clearly above the reference average.",
    goddess: "Top 1-5% — unusually strong measured facial proportions.",
    stacy: "Top 10-15% — strong measured proportions across several categories.",
    stacylite: "Top 20-30% — clearly above the reference average.",
    htn: "Top 30-50% — above the reference average.",
    mtn: "Top 50-70% — within the reference-average range.",
    ltn: "Bottom 30% — below the reference average, with several improvable areas.",
  },
  lang: {
    th: "Thai",
    en: "English",
    toggleAria: "Switch language",
  },
  dialog: {
    close: "Close",
  },
  footer: {
    privacy: "Privacy",
    settings: "Settings",
    pricing: "Pricing",
  },
  settings: {
    eyebrow: "Preferences",
    title: "Settings",
    subtitle:
      "Usage preferences stay on this device. Account and plan access are tied to your membership.",
    calibrationTitle: "Face Profile defaults",
    calibrationBody:
      "The assessment flow remembers your gender, goal, age range, and aesthetic reference. Ethnicity is not collected here.",
    languageTitle: "Language",
    languageBody: "Switch between Thai and English at any time.",
    historyTitle: "Face Journal",
    historyBody: "{n} journal entries saved in your browser. Clearing wipes them all immediately.",
    clearHistory: "Clear all history",
    confirmClear: "Tap again to confirm",
    tryOnDataTitle: "Try-on data",
    tryOnDataBody:
      "{saved} saved looks · {recent} recent color picks. Clearing removes both immediately — curated presets are unaffected.",
    clearTryOnData: "Clear try-on data",
    confirmClearTryOn: "Tap again to confirm",
    exportLooks: "Export saved looks",
    importLooks: "Import saved looks",
    importOk: "Imported · {added} added, {skipped} skipped",
    importErr: "Import failed — file unreadable or wrong format",
    guestTitle: "Guest mode",
    guestBody: "Active since {date}. Reset returns you to the welcome screen.",
    resetGuest: "Reset guest mode",
    confirmReset: "Tap again to confirm",
    privacyTitle: "Privacy",
    privacyBody:
      "Core assessment runs locally. Account, payment, and optional online features use only the data needed to work.",
    privacyLink: "Read the privacy policy",
    tourTitle: "Onboarding tour",
    tourBody:
      "Reset the welcome tour so it shows again on the next assessment visit.",
    tourReplay: "Replay tour",
    tourReset: "Reset — visit assessment to see it",
    signOut: "Sign out",
    activeUntil: "Active until",
    subscriptionTitle: "Your subscription",
    subscriptionBody:
      "You're on the {tier} plan. Browse other options or apply a code to upgrade.",
    viewPlans: "View plans",
    redeemCode: "Redeem a code",
    usage: "Usage",
    themeTitle: "Theme",
    themeBody:
      "Switch between dark and light at any time. Preference is stored in your browser only.",
    themeDark: "Dark",
    themeLight: "Light",
    themeActive: "Active",
  },
  privacy: {
    eyebrow: "Privacy by design",
    title: "Clear data boundaries.",
    intro:
      "DOODEE separates the core browser-based assessment from account, payment, and optional online features, so you know what each part uses.",
    s1Title: "What we process",
    s1Body:
      "Core assessment loads the photo in your browser, reads facial reference points, and computes proportions on your device. Account, quota, payment, report-summary, and visual-reference features process only the data they need through DOODEE systems.",
    s2Title: "What we do not do",
    s2Body:
      "We do not run face recognition, match identities, or sell your data. Optional online features use the minimum data needed for sign-in, plans, report summaries, or visual references.",
    s3Title: "What stays on your device",
    s3Body:
      "Local items such as report history, language, and saved preferences can be cleared in Settings or browser site data. Account, plan, receipt, and entitlement records are stored server-side so your membership can be verified across sessions and devices.",
    s4Title: "Contact",
    s4Body:
      "If anything in this policy is unclear, or you'd like us to clarify a specific behavior, email contact@doodee.app. We'll respond within 5 working days.",
    updated: "Last updated 2026-05-13.",
  },
  skin: {
    heading: "Skin",
    note: "Sampled from 4 patches at forehead, both cheeks, and chin. Scores reflect tone uniformity, surface texture, and luminance balance — not skin tone itself.",
    uniformity: "Tone uniformity",
    clarity: "Clarity",
    glow: "Glow",
    privacyNote:
      "Pixel sampling runs in your browser. No image data is uploaded.",
  },
  aiSummary: {
    title: "Personal report summary",
    subtitle: "A 100-word personalized recap grounded in your scores.",
    generate: "Prepare summary",
    generating: "Preparing…",
    clear: "Clear",
    poweredBy: "Prepared from your report",
    poweredByTemplate: "Standard summary · set access to receive a personalized write-up",
    errorPrefix: "Summary error",
  },
  hairColor: {
    eyebrow: "Hair color · on-device reference",
    title: "Review a hair color reference",
    subtitle:
      "Upload a front-facing photo and compare 12 hair-color references while preserving natural highlights.",
    uploadPrompt: "Drop a front-facing photo, or",
    paletteLabel: "Pick a color",
    intensity: "Mix",
    reset: "Reset",
    save: "Save image",
    saved: "Saved",
    saveErr: "Save failed",
    original: "Original photo",
    compareHold: "Hold to see original",
    changePhoto: "Change photo",
    privacyNote:
      "This recoloring tool runs locally in your browser and does not upload photos automatically.",
    canvasAriaOriginal: "Hair color preview · showing original photo",
    canvasAriaApplied: "Hair color preview · {name} applied",
  },
  lipstick: {
    eyebrow: "Lipstick · on-device reference",
    title: "Review lipstick references",
    subtitle:
      "Upload a clear face photo and compare 13 lip-color references while preserving natural shading.",
    uploadPrompt: "Drop a portrait photo, or",
    paletteLabel: "Pick a shade",
    intensity: "Mix",
    reset: "Reset",
    save: "Save image",
    saved: "Saved",
    saveErr: "Save failed",
    original: "Original photo",
    compareHold: "Hold to see original",
    changePhoto: "Change photo",
    privacyNote:
      "This recoloring tool runs locally in your browser and does not upload photos automatically.",
    canvasAriaOriginal: "Lipstick preview · showing original photo",
    canvasAriaApplied: "Lipstick preview · {name} applied",
  },
  eyeColor: {
    eyebrow: "Eye color · on-device reference",
    title: "Review an iris-color reference",
    subtitle:
      "Upload a clear face photo and compare 15 iris-color references, from natural tones to stronger editorial shades, while preserving pupil and catchlight detail.",
    uploadPrompt: "Drop a close-up photo, or",
    paletteLabel: "Pick a color",
    intensity: "Mix",
    reset: "Reset",
    save: "Save image",
    saved: "Saved",
    saveErr: "Save failed",
    original: "Original photo",
    compareHold: "Hold to see original",
    changePhoto: "Change photo",
    privacyNote:
      "This recoloring tool runs locally in your browser and does not upload photos automatically.",
    canvasAriaOriginal: "Eye color preview · showing original photo",
    canvasAriaApplied: "Eye color preview · {name} applied",
  },
  tryOn: {
    eyebrow: "Style reference studio · on-device",
    title: "Layered style references",
    subtitle:
      "Upload one photo and compare hair color, iris color, blush, and lipstick on one canvas. Processing stays in your browser.",
    uploadPrompt: "Drop a portrait photo, or",
    intensity: "Mix",
    resetAll: "Reset all",
    save: "Save reference",
    saved: "Saved",
    saveErr: "Save failed",
    original: "Original photo",
    compareHold: "Hold to see original",
    changePhoto: "Change photo",
    privacyNote:
      "These style effects run locally in your browser and do not upload photos automatically.",
    activeCount: "{n} active",
    recent: "Recent",
    looks: "References",
    surprise: "Suggest a reference",
    shareLook: "Share reference",
    shareCopied: "Link copied",
    shareErr: "Copy failed",
    sharedLookHint:
      "A reference was shared with you — upload your photo to review it on your own image.",
    saveLook: "Save reference",
    saveLookFull: "Maximum 12 saved references — delete one first.",
    saveLookTitle: "Name this reference",
    saveLookBody:
      "Saved references appear next to the preset options and stay on this device.",
    saveLookPlaceholder: "e.g., neutral day reference, evening reference",
    saveLookCancel: "Cancel",
    saveLookConfirm: "Save",
    deleteLook: "Delete saved reference",
    saveComparison: "Save before/after",
    unifiedHubBanner:
      "Open the unified reference hub for hair, eyes, blush, and lips on one canvas, with saved references and share links.",
    unifiedHubCta: "Open hub",
    shareLookNativeTitle: "Preview this reference on DOODEE",
    shareLookNativeText:
      "I created a DOODEE style reference — open the link to preview it on your own photo.",
    canvasAriaOriginal: "Try-on preview · showing original photo",
    canvasAriaApplied: "Try-on preview · {n} effects applied",
    tabs: {
      hair: "Hair",
      eyes: "Eyes",
      lips: "Lips",
      blush: "Blush",
    },
  },
  tryOnV2: {
    eyebrow: "STYLE REFERENCE STUDIO · On-device processing",
    title: "Layered style reference studio",
    subtitle:
      "Upload one photo and compare hair color, eye color, blush, and lipstick together. Everything runs in your browser.",
    privacyFooter:
      "● Processed on your device · Photo not stored · Nothing leaves the browser",
    stage: {
      prompt: "Drop a front-facing photo here, or",
      choose: "Choose photo",
      camera: "Open camera",
      hint: "Supports JPG and PNG. Recommended resolution 1024×1024 or higher.",
      preparing: "Preparing photo…",
      loadingModel: "Loading face analysis model…",
      detecting: "Reading facial landmarks…",
      rendering: "Updating preview…",
      refiningHair: "Refining hair mask…",
    },
    tabs: {
      hair: "Hair",
      eyes: "Eyes",
      lips: "Lips",
      blush: "Blush",
    },
    controls: {
      intensity: "Color intensity",
      activeLayers: "Active layers",
      clearAll: "Clear all",
    },
    compare: {
      title: "Compare",
      before: "Before",
      after: "After",
    },
    actions: {
      download: "Save & download",
      saved: "Saved",
      saveErr: "Save failed",
      saving: "Saving…",
      reset: "Reset all",
      changePhoto: "Change photo",
    },
    layerCards: {
      hair: {
        title: "Hair color",
        description:
          "Try a range of hair colors, from natural tones to fashion looks.",
        cta: "Choose hair",
      },
      eyes: {
        title: "Eye color",
        description:
          "Preview eye colors that add character across different moods.",
        cta: "Choose eyes",
      },
      lips: {
        title: "Lips",
        description:
          "Explore lipstick shades and find the tone that fits you.",
        cta: "Choose lips",
      },
      blush: {
        title: "Blush",
        description:
          "Add a healthy natural flush and more dimension to your face.",
        cta: "Choose blush",
      },
    },
  },
  pricing: {
    eyebrow: "Plans",
    title: "Choose a plan with clear payment terms",
    subtitle:
      "Start with the basic plan. PromptPay is one-time 30-day access; card checkout is a monthly subscription.",
    termsEyebrow: "Payment terms",
    termsTitle: "Know exactly what happens at checkout",
    termsItems: [
      {
        label: "PromptPay 30-day access",
        body: "PromptPay is one payment for 30 days of plan access. It does not auto-renew or save a card.",
      },
      {
        label: "Card subscriptions",
        body: "Credit and debit cards start a monthly subscription for the selected plan and renew until canceled.",
      },
      {
        label: "Refund window",
        body: "Unused paid plans are refundable within 7 days if no assessment or visual-reference quota was used after payment.",
      },
      {
        label: "Private by design",
        body: "The core assessment runs in the browser. Server-side features are quota-gated and covered by the privacy policy.",
      },
    ],
    comparisonEyebrow: "How DOODEE is different",
    comparisonTitle: "Asian-calibrated analysis with a privacy-first core assessment",
    comparisonPoints: [
      {
        label: "Asian-calibrated metrics",
        body: "60+ metrics use reference ranges informed by Asian-face research, including Hwang, Wang, and Kim.",
      },
      {
        label: "Core assessment in the browser",
        body: "The main measurement flow runs client-side. Results, account records, and server-side features follow the privacy policy.",
      },
      {
        label: "Explainable score blend",
        body: "The score combines geometric metrics, skin signal, photo quality, and any enabled model, with confidence context shown in the report.",
      },
    ],
    faqEyebrow: "FAQ",
    faqTitle: "Common questions",
    faq: [
      {
        q: "Can I start without entering a card?",
        a: "You can start on the basic plan after signing in, without entering a card. Paid plans add assessment quota, visual references, and PDF export according to each plan's terms.",
      },
      {
        q: "Where do my photos go?",
        a: "The core assessment runs in your browser. Features that require server-side processing are tied to quota and handled under the privacy policy; shared links never include the original photo.",
      },
      {
        q: "Do paid plans auto-renew?",
        a: "PromptPay is one-time 30-day access and does not auto-renew. Card checkout is a monthly subscription and renews until canceled.",
      },
      {
        q: "What is the refund policy?",
        a: "Unused paid plans can be refunded within 7 days if you have not used assessment or visual-reference quota after payment. Contact hello@doodee.app or Line @doodee.",
      },
      {
        q: "How reliable are the scores?",
        a: "The report shows the main score, review score, and model score when enabled, plus confidence context. Photo quality, lighting, and face angle can change the result.",
      },
      {
        q: "What does Asian-calibrated mean?",
        a: "Reference ranges for canthal tilt, gonial angle, brow tilt, etc. differ between populations. DOODEE uses ranges sourced from Asian-face research so Western norms are not the only frame.",
      },
      {
        q: "Why is my score different on a different photo?",
        a: "Lighting, pose, focus, and expression all affect reliability. DOODEE flags when photo quality lowers confidence — use a well-lit, head-on photo for more comparable results.",
      },
    ],
    finalCtaTitle: "Start your first report",
    finalCtaBody:
      "Sign in, use a front-facing photo in even light, and read the report in a few steps.",
    finalCtaPrimary: "Start assessment",
    finalCtaSecondary: "Read the methodology",
  },
  upgrade: {
    hero: {
      privacyChip: "Core assessment runs in your browser",
      titleLine1: "Choose a plan",
      titleLine2Prefix: "Match it to ",
      titleLine2Accent: "your usage",
      titleLine2Suffix: "",
      subtitle:
        "Add assessments, visual references, PDF export, and multi-photo comparison based on the plan you choose.",
    },
    sidebar: {
      analyzerLabel: "FACE AESTHETICS",
      scan: "Assessment",
      tryOn: "Try on looks",
      history: "My reports",
      plan: "Plans",
      methodology: "Methodology",
      aiAdvice: "Visual references and guidance",
      settings: "Settings",
      privacy: "Privacy",
      guestName: "DOODEE user",
      signedOutTitle: "Sign in",
      signedOutBody: "Sign in to view assessment credits, visual references, and plan controls.",
      creditsRemaining: "Credits remaining",
      scansRemaining: "Assessment credits",
      previewsRemaining: "References",
      // Phase 182c — countdown copy that surfaces the period_end so the
      // user can see when their plan / grant ends.
      daysLeftLabel: "{days} days left",
      daysLeftLabelOne: "1 day left",
      daysLeftToday: "Expires today",
      daysLeftExpired: "Expired",
      expiresOn: "Expires {date}",
      upgradeProTitle: "Upgrade to PRO",
      upgradeProBody: "Add multi-photo compare and higher assessment quotas for regular use.",
      themeToggle: "Light mode",
      themeDarkLabel: "Dark",
      themeLightLabel: "Light",
      pinSidebar: "Pin sidebar",
      unpinSidebar: "Unpin sidebar",
      version: "v1.0.0",
      tierFree: "Basic",
      tierPlus: "Plus",
      tierPro: "Pro",
    },
    bottomBar: {
      comparePrompt: "Not sure?",
      compareLink: "Compare plan differences",
      assistant: "Plan details",
    },
    payment: {
      label: "Payment method",
      card: "Card (auto-renew monthly)",
      cardHint: "Monthly subscription until canceled",
      promptpay: "PromptPay (one-time, 30 days)",
      promptpayHint: "No auto-renewal",
      promptpayNote: "PromptPay grants 30 days of access with one payment and does not auto-renew.",
      promptpayDisabled:
        "PromptPay isn't available yet — please use a card, or contact the team to enable it.",
    },
  },
  // Phase 192u — Global paywall gate dialog copy.
  paywall: {
    outOfScansTitle: "Out of assessment credits",
    outOfPreviewsTitle: "Out of visual references",
    featureLockedTitle: "This feature needs a plan",
    bodyFree:
      "You've used the allowance for your current plan. Pick a plan to continue assessing photos and creating visual references within the listed quotas.",
    bodyPaid:
      "You've used the allowance for the current period. Renew or upgrade your plan to get more assessments and visual references.",
    viewPlans: "View plans",
    later: "Later",
  },
  share: {
    eyebrow: "Shared report",
    invalidTitle: "Couldn't read this report",
    invalidBody:
      "The link is incomplete or uses an older format. Start your own face assessment to view the latest report format.",
    startYourOwn: "Start your own report",
    privacyNote:
      "Shared reports embed scores in the URL — the original photo is not included. Anyone with this link can see the numbers.",
    copyLink: "Copy share link",
    copied: "Link copied",
    copyError: "Couldn't copy",
    copyFallback: "Copy this link to share your report:",
    vsYou: "your latest",
    shareScan: "Share report",
    nativeTitle: "My DOODEE report",
    nativeText: "My facial aesthetics report: {score}/10 — view yours on DOODEE.",
  },
  annotated: {
    download: "Download annotated face",
    rendering: "Rendering…",
    saved: "Saved",
    subtitle: "",
  },
  offline: {
    banner:
      "You're offline — assessment still works on this device, but report summaries and shared links may not load.",
    retry: "Retry",
  },
  a11y: {
    skipToContent: "Skip to main content",
    primaryNav: "Primary navigation",
    primaryNavMobile: "Primary navigation (mobile)",
  },
  login: {
    title: "Sign in to DOODEE",
    subtitle:
      "Facial proportion reports calibrated for Asian features, with quotas tied to your account.",
    continueGoogle: "Continue with Google",
    continueEmail: "Continue with Email",
    or: "or",
    skip: "Continue later",
    toastTitle: "Sign-in unavailable",
    toastBody: "Please use another sign-in method or try again later.",
    privacyBadge: "Core assessment in browser",
    noAccountNote: "Sign in to keep credits and report history attached to your account.",
    soonNote: "Sign in to keep quota, reports, and plan access tied to your account.",
    backToLanding: "Back",
  },
  pwa: {
    install: "Install app",
    dismiss: "Dismiss install prompt",
  },
  // Phase 192f — Assessment-progress step labels + done state + report note.
  scanProgress: {
    ariaLabelPrefix: "Assessing",
    doneLabel: "Done",
    aiNote: "Summarizing the face context — takes 2-5 seconds, then your report appears.",
    steps: {
      detecting: {
        label: "Reading facial structure",
        hint: "Locating hundreds of key landmarks",
      },
      computing: {
        label: "Measuring proportions",
        hint: "Processing 60+ metrics across balance and skin",
      },
      ai: {
        label: "Report summary",
        hint: "Structuring the measured context into a readable report",
      },
    },
  },
  // Phase 192f — Pre-assessment confirmation card.
  scanConfirm: {
    reviewBeforeScan: "Review photo before assessment",
    lookStraight: "Make sure your face is straight and well lit before confirming.",
    changePhoto: "Change photo",
    confirmScan: "Confirm assessment",
    retryScan: "Retry assessment",
  },
  // Phase 192f — AuthGate fallback labels.
  auth: {
    gateRedirect: "Redirecting to login…",
    gateChecking: "Checking authorization…",
  },
  // Phase 192f — Admin shell navigation.
  adminNav: {
    dashboard: "Overview",
    users: "Users",
    coupons: "Coupons",
    payments: "Payments",
    audit: "Audit log",
    health: "System health",
    subscriptions: "Paid subscribers",
    usage: "Usage",
    signOut: "Sign out",
    sidebarTitle: "Admin",
    sidebarEyebrow: "DOODEE v2",
  },
  // Phase 192f — Admin auth gate messages.
  adminGate: {
    checking: "Verifying admin access…",
    loadFailed: "Could not load admin page",
  },
  // Phase 192f — Admin business overview dashboard.
  adminDashboard: {
    eyebrow: "Overview",
    title: "Business status right now",
    refresh: "Refresh",
    loadFailedTitle: "Failed to load data",
    loadFailedUnknown: "Unknown cause",
    kpiMrr: "Monthly recurring revenue (MRR)",
    kpiMrrSub: "Annual revenue",
    kpiTotalUsers: "Total users",
    kpiTotalUsersSub: "Signed up today +{today}",
    kpiPayingCustomers: "Active paying customers",
    kpiPayingCustomersSub: "Total {total} · {pct}% paying",
    kpiRevenue30: "Last 30-day revenue",
    kpiRevenue30Sub: "Today {today}",
    kpiDauMau: "Daily / monthly active users",
    kpiDauMauSub: "Cost / 30-day active user",
    funnelEyebrow: "Customer funnel",
    funnelTitle: "Sign up → First report → Pay",
    funnelStat: "Activation {activation}% · Conversion {conversion}%",
    funnelSignup: "Signed up",
    funnelFirstScan: "Completed at least one report",
    funnelUpgrade: "Upgraded to paid",
    tiersEyebrow: "Share by plan",
    dailyEyebrow: "Daily signups (last 30 days)",
    signupsTitle: "Signups",
    churnTitle: "Cancellations",
    revenueTitle: "Revenue",
    today: "Today",
    last7: "Last 7 days",
    last30: "Last 30 days",
    last90: "Last 90 days",
    last60: "Last 60 days",
    topByCost: "Highest-cost users (30 days)",
    topByUsage: "Most-active users (30 days)",
    usageUnit: "ops",
    noMembers: "No members yet",
    noData: "No data yet",
  },
  // Phase 192f — Admin DataTable primitive labels.
  dataTable: {
    page: "Page {n}",
    previous: "Previous",
    next: "Next",
  },
  analysisSteps: {
    step1: "Preparing photo for assessment...",
    step2: "Reading facial reference points...",
    step3: "Checking photo quality and skin signals...",
    step4: "Preparing your summary report...",
  },
  scanPaywall: {
    title: "Report ready",
    subtitle: "Your facial aesthetics report is ready.",
    cta: "Choose a plan to unlock this face report",
    metrics: "60+ metrics analyzed",
    aiComplete: "Scoring complete",
    reportReady: "Report ready",
  },
};

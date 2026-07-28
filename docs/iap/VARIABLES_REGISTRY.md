# **VARIABLES_REGISTRY**

## **System Purpose**

Canonical reference for all IAP variable codes used in creative testing, analysis, and performance attribution. This registry provides structured definitions for concept types (CN_), messaging angles (angle variables), and ensures consistent tagging across the IAP ecosystem.

---

## **Master Concept Variables (CN_ Codes)**

### **Schema Structure**

```json
{
  "concept_code": "CN_XXX",
  "label": "Human-readable name",
  "definition": "Structural definition of narrative approach",
  "common_elements": ["Visual element 1", "Copy element 2", "CTA pattern"],
  "strategic_role": "Purpose in customer journey",
  "typical_formats": ["Static", "Video", "Carousel"],
  "best_funnel_stage": ["TOFU", "MOFU", "BOFU"],
  "typical_angle_pairings": ["FW_XXX", "TN_XXX"]
}
```

### **Concept Registry**

```json
{
  "concepts": [
    {
      "concept_code": "CN_Testimonial",
      "label": "Testimonial",
      "definition": "A story or quote from a customer highlighting results or satisfaction",
      "common_elements": [
        "Quote overlay text",
        "Face-forward UGC footage",
        "Real People framing",
        "Before/after states",
        "Specific outcome metrics"
      ],
      "strategic_role": "Builds social proof and relatability",
      "typical_formats": ["Video", "Static with quote card"],
      "best_funnel_stage": ["MOFU", "BOFU"],
      "typical_angle_pairings": ["PR_Testimonial", "TN_Emotional", "HK_Story"]
    },
    {
      "concept_code": "CN_FounderStory",
      "label": "Founder Story",
      "definition": "A narrative about the brand's origin, mission, or personal motivation",
      "common_elements": [
        "Talking-head format",
        "Direct-to-camera delivery",
        "Meet the Founder CTA",
        "Origin narrative",
        "Mission-driven framing"
      ],
      "strategic_role": "Drives authority and trust",
      "typical_formats": ["Video", "Carousel with founder journey"],
      "best_funnel_stage": ["TOFU", "MOFU"],
      "typical_angle_pairings": ["FW_StoryBrand", "TN_Assertive", "HK_Story"]
    },
    {
      "concept_code": "CN_ProductDemo",
      "label": "Product Demo",
      "definition": "Visual explanation of how the product functions and delivers benefit",
      "common_elements": [
        "Sequential walkthrough",
        "Over-the-shoulder view",
        "See It Work CTA",
        "Product in use",
        "Feature callouts"
      ],
      "strategic_role": "Offers clarity and builds belief through proof",
      "typical_formats": ["Video", "Carousel", "GIF"],
      "best_funnel_stage": ["MOFU", "BOFU"],
      "typical_angle_pairings": ["FW_FAB", "PR_VisualDemo", "TN_Rational"]
    },
    {
      "concept_code": "CN_ProductSpecs",
      "label": "Product Specs",
      "definition": "Feature breakdown with emphasis on what and why it matters",
      "common_elements": [
        "Side-by-side feature cards",
        "Bullet point overlays",
        "Why It's Different CTA",
        "Comparison tables",
        "Technical details"
      ],
      "strategic_role": "Appeals to rational decision-making",
      "typical_formats": ["Static", "Carousel"],
      "best_funnel_stage": ["MOFU"],
      "typical_angle_pairings": ["FW_FAB", "TN_Rational", "PR_DataDriven"]
    },
    {
      "concept_code": "CN_Comparison",
      "label": "Comparison",
      "definition": "Direct comparison to alternatives, old habits, or competitors",
      "common_elements": [
        "Comparison tables",
        "Checklists",
        "Vs. visuals",
        "Upgrade Now CTA",
        "Before state emphasis"
      ],
      "strategic_role": "Supports objection handling and differentiation",
      "typical_formats": ["Static", "Carousel", "Video"],
      "best_funnel_stage": ["MOFU", "BOFU"],
      "typical_angle_pairings": ["FW_BAB", "TN_Assertive", "HK_Problem"]
    },
    {
      "concept_code": "CN_ValueStack",
      "label": "Value Stack",
      "definition": "Presentation of all included benefits, bonuses, or cost savings",
      "common_elements": [
        "Bundle graphic",
        "Pricing overlay",
        "Countdown timer",
        "Claim My Offer CTA",
        "Value breakdown"
      ],
      "strategic_role": "Maximizes conversion intent",
      "typical_formats": ["Static", "Video"],
      "best_funnel_stage": ["BOFU"],
      "typical_angle_pairings": ["FW_AIDA", "TN_Assertive", "HP_Money"]
    },
    {
      "concept_code": "CN_Lifestyle",
      "label": "Lifestyle Outcome",
      "definition": "Focus on emotional or practical outcomes in the user's day-to-day life",
      "common_elements": [
        "Aspirational imagery",
        "Lifestyle framing",
        "Identity-based messaging",
        "Wake Up Smarter style CTA",
        "Emotional outcome focus"
      ],
      "strategic_role": "Drives desire and identity-based appeal",
      "typical_formats": ["Static", "Video", "Carousel"],
      "best_funnel_stage": ["TOFU", "MOFU"],
      "typical_angle_pairings": ["FW_BAB", "TN_Aspirational", "HK_Benefit"]
    },
    {
      "concept_code": "CN_BehaviorShift",
      "label": "Behavior Change",
      "definition": "Demonstrates transformation in routine, mindset, or user habits",
      "common_elements": [
        "Before-after frames",
        "Repeatable systems",
        "Change How You Start CTA",
        "Habit formation language",
        "Transformation journey"
      ],
      "strategic_role": "Effective for habit-focused categories",
      "typical_formats": ["Video", "Carousel"],
      "best_funnel_stage": ["MOFU"],
      "typical_angle_pairings": ["FW_BAB", "TN_Aspirational", "HK_Problem"]
    },
    {
      "concept_code": "CN_ConditionSupport",
      "label": "Condition Support",
      "definition": "Addresses specific health, emotional, or sensory challenges. NOTE: This is an avatar-specific application rather than a distinct structural format - can be combined with any narrative structure (testimonial, demo, etc.) when targeting condition-specific audiences.",
      "common_elements": [
        "Calm tone",
        "Expert quotes",
        "Sensory-safe visuals",
        "Explore Relief CTA",
        "Empathetic framing"
      ],
      "strategic_role": "Tailors messaging to niche or high-empathy verticals",
      "typical_formats": ["Video", "Static"],
      "best_funnel_stage": ["TOFU", "MOFU"],
      "typical_angle_pairings": ["TN_Emotional", "PR_Expert", "HK_Problem"]
    },
    {
      "concept_code": "CN_EnvironmentHack",
      "label": "Environment Improvement",
      "definition": "Shows how product enhances relational, social, or shared environments. NOTE: This is an avatar-specific application rather than a distinct structural format - can be combined with any narrative structure when emphasizing interpersonal benefits.",
      "common_elements": [
        "Co-living visuals",
        "No more disruptions copy",
        "Sleep In Peace CTA",
        "Relationship harmony focus",
        "Shared benefit framing"
      ],
      "strategic_role": "Emphasizes external tension relief and interpersonal benefit",
      "typical_formats": ["Video", "Static"],
      "best_funnel_stage": ["TOFU", "MOFU"],
      "typical_angle_pairings": ["TN_Emotional", "HP_Overwhelm", "HK_Problem"]
    }
  ]
}
```

### **Avatar-Specific vs Structural Concepts**

Most concept codes (CN_Testimonial, CN_ProductDemo, CN_Comparison) represent
STRUCTURAL FORMATS - the way the creative is built.

Two concept codes are AVATAR-SPECIFIC APPLICATIONS:
- CN_ConditionSupport: Targets audience with specific condition/challenge
- CN_EnvironmentHack: Targets audience focused on shared/relational impact

These can be combined with structural concepts:
- "Condition Support Testimonial" = CN_ConditionSupport + CN_Testimonial
- "Environment Hack Product Demo" = CN_EnvironmentHack + CN_ProductDemo

OR used standalone when the avatar focus IS the primary structural approach.

Best Practice: When both apply, prioritize the structural format as primary
concept code and indicate avatar focus through ICP targeting or secondary tagging.
---

## **Master Angle Variables**

### **Variable Type Categories**

Angles are tagged with 4-6 variable codes per the following structure:

REQUIRED VARIABLES (4):
1. CN_ (Concept) - structural narrative format
2. FW_ (Framework) - persuasive structure
3. TN_ (Tonality) - communication style
4. HK_ (Hook Type) - opening strategy

OPTIONAL VARIABLES (0-2):
5. ST_ (Funnel Stage) - when funnel position is key test variable
6. AW_ (Awareness Level) - when awareness state is key test variable
7. HP_ (Pain Point) - when specific pain is key test variable
8. PR_ (Proof Type) - when proof mechanism is key test variable
9. CTA_ (CTA Type) - when CTA strategy is key test variable

Selection Logic:
- Start with 4 required variables
- Add 0-2 optional variables based on test hypothesis
- Typical total: 4-5 variables (5 is most common)
- Maximum total: 6 variables (rare, use only when necessary)

Examples:
- Minimum viable stack: CN_Testimonial + FW_PAS + TN_Emotional + HK_Problem (4 vars)
- Common stack: CN_ProductDemo + FW_FAB + TN_Rational + HK_Benefit + PR_VisualDemo (5 vars)
- Maximum stack: CN_Comparison + FW_AIDA + TN_Assertive + HK_Problem + HP_Money + PR_DataDriven (6 vars)

### **Schema Structure**

```json
{
  "variable_code": "XX_YYY",
  "variable_type": "framework|tonality|funnel_stage|awareness_level|pain_point|proof_type|hook_type",
  "label": "Human-readable name",
  "description": "Detailed definition",
  "strategic_role": "When and why to use",
  "typical_pairings": ["Other codes that work well with this"],
  "performance_indicators": ["Metrics that signal success"],
  "best_for_concepts": ["CN_XXX codes this pairs with"]
}
```

### **Framework Variables (FW_)**

```json
{
  "frameworks": [
    {
      "variable_code": "FW_PAS",
      "variable_type": "framework",
      "label": "PAS (Problem-Agitate-Solution)",
      "description": "Opens with problem, agitates pain, presents solution",
      "strategic_role": "Ideal for pain-led scroll-stopping and TOFU delivery",
      "typical_pairings": ["TN_Emotional", "HK_Problem", "ST_TOFU"],
      "performance_indicators": ["High CTR", "Strong ATC rate", "Problem-aware audience response"],
      "best_for_concepts": ["CN_Comparison", "CN_BehaviorShift"]
    },
    {
      "variable_code": "FW_AIDA",
      "variable_type": "framework",
      "label": "AIDA (Attention-Interest-Desire-Action)",
      "description": "Builds curiosity, creates interest, drives desire, prompts action",
      "strategic_role": "Good for longer BOFU journeys or value-based breakdowns",
      "typical_pairings": ["TN_Rational", "ST_BOFU", "PR_DataDriven"],
      "performance_indicators": ["Strong CVR", "Low drop-off", "Complete funnel engagement"],
      "best_for_concepts": ["CN_ValueStack", "CN_ProductDemo", "CN_ProductSpecs"]
    },
    {
      "variable_code": "FW_FAB",
      "variable_type": "framework",
      "label": "FAB (Feature-Advantage-Benefit)",
      "description": "What it does, why it matters, what you gain",
      "strategic_role": "MOFU format used for demonstrating technical utility",
      "typical_pairings": ["TN_Rational", "ST_MOFU", "PR_VisualDemo"],
      "performance_indicators": ["Solution-aware audience engagement", "High consideration metrics"],
      "best_for_concepts": ["CN_ProductDemo", "CN_ProductSpecs", "CN_Comparison"]
    },
    {
      "variable_code": "FW_BAB",
      "variable_type": "framework",
      "label": "BAB (Before-After-Bridge)",
      "description": "Current state, desired state, how to get there",
      "strategic_role": "Strong for transformational/lifestyle messaging",
      "typical_pairings": ["TN_Aspirational", "HK_Benefit", "ST_MOFU"],
      "performance_indicators": ["Identity-shift audience response", "Aspirational engagement"],
      "best_for_concepts": ["CN_Lifestyle", "CN_BehaviorShift", "CN_Comparison"]
    },
    {
      "variable_code": "FW_StoryBrand",
      "variable_type": "framework",
      "label": "StoryBrand",
      "description": "Hero's journey with brand as the guide",
      "strategic_role": "Great for founder story, longform, or testimonial-narrative blends",
      "typical_pairings": ["TN_Emotional", "HK_Story", "PR_Testimonial"],
      "performance_indicators": ["High engagement time", "Emotional resonance", "Brand recall"],
      "best_for_concepts": ["CN_FounderStory", "CN_Testimonial", "CN_BehaviorShift"]
    }
  ]
}
```

### **Tonality Variables (TN_)**

```json
{
  "tonalities": [
    {
      "variable_code": "TN_Emotional",
      "variable_type": "tonality",
      "label": "Emotional",
      "description": "Empathetic, heartfelt, identity-driven messaging",
      "strategic_role": "Drives connection and relatability",
      "typical_pairings": ["FW_PAS", "FW_StoryBrand", "HK_Story", "HK_Problem"],
      "performance_indicators": ["High engagement", "Social sharing", "Comments/reactions"],
      "best_for_concepts": ["CN_Testimonial", "CN_FounderStory", "CN_ConditionSupport"]
    },
    {
      "variable_code": "TN_Rational",
      "variable_type": "tonality",
      "label": "Rational",
      "description": "Logical, data-led, benefit-focused messaging",
      "strategic_role": "Good for awareness-aware users, especially BOFU",
      "typical_pairings": ["FW_FAB", "FW_AIDA", "PR_DataDriven", "ST_BOFU"],
      "performance_indicators": ["High CVR", "Low CPA", "Solution-aware conversions"],
      "best_for_concepts": ["CN_ProductSpecs", "CN_ProductDemo", "CN_Comparison"]
    },
    {
      "variable_code": "TN_Playful",
      "variable_type": "tonality",
      "label": "Playful",
      "description": "Irreverent, witty, humor-driven tone",
      "strategic_role": "Scroll-stopping and challenger brand use",
      "typical_pairings": ["HK_Shock", "HK_Curiosity", "ST_TOFU"],
      "performance_indicators": ["Very high CTR", "Viral potential", "Young audience engagement"],
      "best_for_concepts": ["CN_Comparison"]
    },
    {
      "variable_code": "TN_Assertive",
      "variable_type": "tonality",
      "label": "Assertive",
      "description": "Confident, direct, credibility-led messaging",
      "strategic_role": "Expert tone for technical or authority-based messages",
      "typical_pairings": ["PR_Expert", "FW_FAB", "ST_MOFU"],
      "performance_indicators": ["Trust signals", "High consideration", "Professional audience"],
      "best_for_concepts": ["CN_FounderStory", "CN_ProductSpecs", "CN_ValueStack"]
    },
    {
      "variable_code": "TN_Aspirational",
      "variable_type": "tonality",
      "label": "Aspirational",
      "description": "Ideal-self oriented, motivational messaging",
      "strategic_role": "Effective for lifestyle or identity shift angles",
      "typical_pairings": ["FW_BAB", "HK_Benefit", "CN_Lifestyle"],
      "performance_indicators": ["Identity-based engagement", "Desire signals", "Lifestyle audience"],
      "best_for_concepts": ["CN_Lifestyle", "CN_BehaviorShift"]
    }
  ]
}
```

### **Funnel Stage Variables (ST_)**

```json
{
  "funnel_stages": [
    {
      "variable_code": "ST_TOFU",
      "variable_type": "funnel_stage",
      "label": "TOFU (Top of Funnel)",
      "description": "Attention, education, or pain introduction",
      "strategic_role": "Used for attention, education, or pain intro",
      "typical_pairings": ["AW_Unaware", "HK_Problem", "HK_Curiosity"],
      "performance_indicators": ["CTR", "Engagement rate", "Reach"],
      "best_for_concepts": ["CN_Lifestyle", "CN_ConditionSupport"]
    },
    {
      "variable_code": "ST_MOFU",
      "variable_type": "funnel_stage",
      "label": "MOFU (Middle of Funnel)",
      "description": "Solution comparison, utility, credibility-building",
      "strategic_role": "Solution comparison, utility, credibility-building",
      "typical_pairings": ["AW_SolutionAware", "FW_FAB", "PR_VisualDemo"],
      "performance_indicators": ["ATC rate", "Engagement time", "Video watch %"],
      "best_for_concepts": ["CN_ProductDemo", "CN_Comparison", "CN_BehaviorShift"]
    },
    {
      "variable_code": "ST_BOFU",
      "variable_type": "funnel_stage",
      "label": "BOFU (Bottom of Funnel)",
      "description": "Offer, urgency, value stack, retargeting-focused",
      "strategic_role": "Offer, urgency, value stack, retargeting-focused",
      "typical_pairings": ["AW_MostAware", "FW_AIDA", "HP_Money"],
      "performance_indicators": ["CVR", "ROAS", "Purchase rate"],
      "best_for_concepts": ["CN_ValueStack", "CN_ProductSpecs", "CN_Testimonial"]
    }
  ]
}
```

### **Awareness Level Variables (AW_)**

```json
{
  "awareness_levels": [
    {
      "variable_code": "AW_Unaware",
      "variable_type": "awareness_level",
      "label": "Unaware",
      "description": "Prospect doesn't know the problem exists",
      "strategic_role": "Needs educational or lifestyle-based hooks",
      "typical_pairings": ["ST_TOFU", "HK_Story", "TN_Emotional"],
      "performance_indicators": ["Discovery engagement", "Educational content consumption"],
      "best_for_concepts": ["CN_Lifestyle", "CN_EnvironmentHack"]
    },
    {
      "variable_code": "AW_ProblemAware",
      "variable_type": "awareness_level",
      "label": "Problem-Aware",
      "description": "Prospect feels the pain but doesn't know the fix",
      "strategic_role": "Ideal for agitation hooks or trust-building",
      "typical_pairings": ["FW_PAS", "HK_Problem", "ST_TOFU"],
      "performance_indicators": ["Pain resonance", "Problem identification engagement"],
      "best_for_concepts": ["CN_ConditionSupport"]
    },
    {
      "variable_code": "AW_SolutionAware",
      "variable_type": "awareness_level",
      "label": "Solution-Aware",
      "description": "Prospect knows general solution type",
      "strategic_role": "Positioning and differentiator-led messaging",
      "typical_pairings": ["ST_MOFU", "FW_FAB", "CN_Comparison"],
      "performance_indicators": ["Comparison shopping signals", "Feature evaluation"],
      "best_for_concepts": ["CN_Comparison", "CN_ProductSpecs", "CN_ProductDemo"]
    },
    {
      "variable_code": "AW_MostAware",
      "variable_type": "awareness_level",
      "label": "Most-Aware",
      "description": "Prospect knows the product/offer",
      "strategic_role": "Used for retargeting, urgency, BOFU stack",
      "typical_pairings": ["ST_BOFU", "FW_AIDA", "HP_Money"],
      "performance_indicators": ["Direct response", "Conversion rate", "ROAS"],
      "best_for_concepts": ["CN_ValueStack", "CN_Testimonial"]
    }
  ]
}
```

### **Pain Point Type Variables (HP_)**

```json
{
  "pain_points": [
    {
      "variable_code": "HP_Time",
      "variable_type": "pain_point",
      "label": "Time",
      "description": "Messaging around speed, simplicity, or saving time",
      "strategic_role": "Common for productivity, family, or sleep tools",
      "typical_pairings": ["TN_Rational", "FW_FAB"],
      "performance_indicators": ["Efficiency-seeking audience response"],
      "best_for_concepts": ["CN_ProductDemo", "CN_BehaviorShift"]
    },
    {
      "variable_code": "HP_Money",
      "variable_type": "pain_point",
      "label": "Money",
      "description": "Highlights cost, ROI, or budget concerns",
      "strategic_role": "Useful in B2C or competitive comparison ads",
      "typical_pairings": ["ST_BOFU", "CN_ValueStack", "FW_AIDA"],
      "performance_indicators": ["Price-conscious audience engagement"],
      "best_for_concepts": ["CN_ValueStack", "CN_Comparison"]
    },
    {
      "variable_code": "HP_Confidence",
      "variable_type": "pain_point",
      "label": "Confidence",
      "description": "Emotional pain rooted in self-belief or performance",
      "strategic_role": "Effective in transformation categories",
      "typical_pairings": ["TN_Emotional", "FW_BAB"],
      "performance_indicators": ["Identity-shift signals", "Transformation interest"],
      "best_for_concepts": ["CN_Lifestyle", "CN_BehaviorShift"]
    },
    {
      "variable_code": "HP_Overwhelm",
      "variable_type": "pain_point",
      "label": "Overwhelm",
      "description": "Stress from mental load, multitasking, or chaos",
      "strategic_role": "Often used in parenting, wellness, or planning",
      "typical_pairings": ["TN_Emotional", "HK_Problem"],
      "performance_indicators": ["Stress relief interest", "Simplification appeal"],
      "best_for_concepts": ["CN_EnvironmentHack", "CN_ConditionSupport"]
    },
    {
      "variable_code": "HP_Loneliness",
      "variable_type": "pain_point",
      "label": "Loneliness",
      "description": "Messaging around isolation, disconnection, or unmet needs",
      "strategic_role": "High empathy / identity narrative campaigns",
      "typical_pairings": ["TN_Emotional", "FW_StoryBrand"],
      "performance_indicators": ["Connection-seeking engagement", "Community interest"],
      "best_for_concepts": ["CN_Testimonial", "CN_ConditionSupport"]
    }
  ]
}
```

### **Proof Type Variables (PR_)**

```json
{
  "proof_types": [
    {
      "variable_code": "PR_Testimonial",
      "variable_type": "proof_type",
      "label": "Testimonial",
      "description": "Social proof from real user quote or face",
      "strategic_role": "Used in UGC, quote cards, or video overlays",
      "typical_pairings": ["CN_Testimonial", "TN_Emotional"],
      "performance_indicators": ["Trust signals", "Relatability metrics"],
      "best_for_concepts": ["CN_Testimonial"]
    },
    {
      "variable_code": "PR_Expert",
      "variable_type": "proof_type",
      "label": "Expert",
      "description": "Doctor, founder, or credentialed endorsement",
      "strategic_role": "Adds authority to rational claims",
      "typical_pairings": ["TN_Assertive", "FW_FAB"],
      "performance_indicators": ["Credibility engagement", "Professional audience"],
      "best_for_concepts": ["CN_FounderStory", "CN_ConditionSupport"]
    },
    {
      "variable_code": "PR_DataDriven",
      "variable_type": "proof_type",
      "label": "Data",
      "description": "Includes charts, stats, or quant-based validation",
      "strategic_role": "Often paired with rational tone or AIDA",
      "typical_pairings": ["TN_Rational", "FW_AIDA"],
      "performance_indicators": ["Logic-driven conversions", "B2B/analytical audience"],
      "best_for_concepts": ["CN_ProductSpecs", "CN_Comparison"]
    },
    {
      "variable_code": "PR_MassProof",
      "variable_type": "proof_type",
      "label": "Mass Proof",
      "description": "Volume and scale indicators (Over 100K Users, Thousands Switched, #1 Rated)",
      "strategic_role": "Demonstrates widespread adoption and social validation through numbers",
      "typical_pairings": ["ST_BOFU", "HK_SocialProof"],
      "performance_indicators": ["Bandwagon effect", "Validation seeking"],
      "best_for_concepts": ["CN_ValueStack", "CN_Testimonial"]
    },
    {
      "variable_code": "PR_VisualDemo",
      "variable_type": "proof_type",
      "label": "Visual Demo",
      "description": "Showing the product solving the problem visually",
      "strategic_role": "Can apply to any concept; high-performance MOFU/BOFU format",
      "typical_pairings": ["CN_ProductDemo", "FW_FAB"],
      "performance_indicators": ["Understanding signals", "See-it-work engagement"],
      "best_for_concepts": ["CN_ProductDemo", "CN_Comparison"]
    }
  ]
}
```

### **Hook Type Variables (HK_)**

```json
{
  "hook_types": [
    {
      "variable_code": "HK_Problem",
      "variable_type": "hook_type",
      "label": "Problem Hook",
      "description": "Opens with visceral issue or key symptom. Use this for all pain-first creative approaches.",
      "strategic_role": "Strong for pain-first ads, especially TOFU. Replaces former CN_PainFirst concept - any pain-led creative uses HK_Problem + appropriate concept code (e.g., CN_Testimonial + HK_Problem).",
      "typical_pairings": ["FW_PAS", "TN_Emotional", "ST_TOFU"],
      "performance_indicators": ["High CTR", "Pain-aware audience stops"],
      "best_for_concepts": ["CN_Comparison"]
    },
    {
      "variable_code": "HK_Benefit",
      "variable_type": "hook_type",
      "label": "Benefit Hook",
      "description": "Opens with outcome or desired state",
      "strategic_role": "Effective for aware or aspirational users",
      "typical_pairings": ["FW_BAB", "TN_Aspirational", "ST_MOFU"],
      "performance_indicators": ["Desire signals", "Aspirational engagement"],
      "best_for_concepts": ["CN_Lifestyle", "CN_BehaviorShift"]
    },
    {
      "variable_code": "HK_Curiosity",
      "variable_type": "hook_type",
      "label": "Curiosity Hook",
      "description": "Opens with a question or open loop",
      "strategic_role": "Scroll-stopper; good for UGC and carousels",
      "typical_pairings": ["TN_Playful", "ST_TOFU"],
      "performance_indicators": ["Very high CTR", "Info-seeking clicks"],
      "best_for_concepts": ["CN_ProductDemo", "CN_Comparison"]
    },
    {
      "variable_code": "HK_Shock",
      "variable_type": "hook_type",
      "label": "Shock Hook",
      "description": "Uses jarring visuals or unexpected phrasing",
      "strategic_role": "Ideal for UGC, humor, or interruption strategy",
      "typical_pairings": ["TN_Playful", "ST_TOFU"],
      "performance_indicators": ["Viral potential", "Pattern interrupt success"],
      "best_for_concepts": []
    },
    {
      "variable_code": "HK_Story",
      "variable_type": "hook_type",
      "label": "Story Hook",
      "description": "Opens with personal anecdote or scenario",
      "strategic_role": "Used in founder, testimonial, and narrative-heavy creatives",
      "typical_pairings": ["FW_StoryBrand", "TN_Emotional"],
      "performance_indicators": ["Engagement time", "Emotional resonance"],
      "best_for_concepts": ["CN_FounderStory", "CN_Testimonial"]
    },
    {
      "variable_code": "HK_SocialProof",
      "variable_type": "hook_type",
      "label": "Social Proof Hook",
      "description": "Leads with authority or scale (# of customers, expert quote)",
      "strategic_role": "Good for retargeting or claim validation",
      "typical_pairings": ["PR_MassProof", "ST_BOFU"],
      "performance_indicators": ["Trust building", "Validation seeking"],
      "best_for_concepts": ["CN_Testimonial", "CN_ValueStack"]
    }
  ]
}
```

---

## **Usage Guidelines**

### **Tagging Rules**

1. **Concept Codes (CN_)**: Assign ONE per creative based on narrative structure
2. **Angle Variable Stack**: Assign 3-5 codes based on messaging strategy
3. **Consistency**: Use same codes across all IAP systems (naming, analysis, reporting)

### **Typical Angle Stacks by Concept**

```json
{
  "concept_angle_examples": [
    {
      "concept": "CN_Testimonial",
      "typical_stacks": [
        ["FW_StoryBrand", "TN_Emotional", "ST_MOFU", "PR_Testimonial", "HK_Story"],
        ["FW_BAB", "TN_Emotional", "ST_BOFU", "PR_Testimonial", "HK_Benefit"]
      ]
    },
    {
      "concept": "CN_ProductDemo",
      "typical_stacks": [
        ["FW_FAB", "TN_Rational", "ST_MOFU", "PR_VisualDemo", "HK_Curiosity"],
        ["FW_AIDA", "TN_Assertive", "ST_BOFU", "PR_VisualDemo", "HP_Time"]
      ]
    }
  ]
}
```

### **Code Addition Protocol**

New variable codes may only be added when:

1. A structurally distinct pattern appears consistently across multiple verticals/brands
2. Existing codes cannot accurately describe the variable
3. The new code represents a unique strategic approach, not a variation
4. Documentation is updated with full schema compliance

### **CTA (Call-To-Action) Variable Assignment**

CTA codes are **OPTIONAL** angle variables (0-1 per creative).

**Assignment Guidelines:**
- Use when CTA strategy is a key test variable
- Select based on primary CTA copy in the creative
- If creative has multiple CTAs, tag the primary/most prominent
- Can be omitted if CTA is not a strategic test variable

**Typical Combinations:**
- TOFU: CTA_Low (Learn More) or omit CTA variable
- MOFU: CTA_Action (Get Started) or CTA_Free (Start Free)
- BOFU: CTA_Action (Buy Now) or CTA_Urgency (Limited Time)
- Retargeting: CTA_Urgency (Last Chance) or CTA_Social (Join Thousands)

**Do NOT** assign CTA code if:
- CTA is generic/standard and not being tested
- Creative has no clear primary CTA
- CTA strategy is not relevant to test hypothesis

#### **VARIABLE RENAME:**

- **OLD CODE:** PR_SocialProof
- **NEW CODE:** PR_MassProof
- **REASON:** Clarifies distinction from PR_Testimonial (both are social proof)
- **EFFECTIVE:** [8th November, 2025]
- **MIGRATION:** Historical data tagged PR_SocialProof should be updated to PR_MassProof
---

## **Quick Reference Tables**

### **All Variable Codes by Type**

**Framework (FW_)**: PAS, AIDA, FAB, BAB, StoryBrand **Tonality (TN_)**: Emotional, Rational, Playful, Assertive, Aspirational **Funnel Stage (ST_)**: TOFU, MOFU, BOFU **Awareness (AW_)**: Unaware, ProblemAware, SolutionAware, MostAware **Pain Point (HP_)**: Time, Money, Confidence, Overwhelm, Loneliness **Proof Type (PR_)**: Testimonial, Expert, DataDriven, MassProof, VisualDemo **Hook Type (HK_)**: Problem, Benefit, Curiosity, Shock, Story, SocialProof **Concept (CN_)**: Testimonial, FounderStory, ProductDemo, ProductSpecs, Comparison, ValueStack, Lifestyle, BehaviorShift, ConditionSupport, EnvironmentHack

### **Performance Interpretation Guide**

**High CTR + High CVR**: Strong message-market fit, scale immediately **High CTR + Low CVR**: Engagement bait, optimize landing/offer or kill **Low CTR + High CVR**: Premium messaging, niche audience, don't judge on CTR alone **High Frequency + Declining Performance**: Creative fatigue, need refresh **High ATC + Low Purchase**: Checkout issue, price objection, or offer confusion

---

## **Integration Points**

This registry is referenced by:

* **IAP_DATA_BUNDLE_PREP()**: For parsing naming conventions and assigning codes
* **IAP_ANALYSIS_CORE()**: For variable extraction and performance attribution
* **IAP_STRATEGY_MAP()**: For building angle recommendations based on proven patterns
* **IAP_MATRIX_BUILDER()**: For ensuring consistency in matrix construction

All IAP systems must validate against this canonical registry to maintain data integrity across the ecosystem.

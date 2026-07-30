# **MST_METHOD_REFERENCE**

## **System Purpose**

Canonical reference for Matrix Sprint Test (MST) methodology within the IAP ecosystem. This document defines the structural principles, variable consistency rules, and testing framework that enable systematic creative intelligence through controlled multi-dimensional testing.

---

## **Core Methodology**

### **The Fundamental Principle**

**To identify which variables drive performance, they must appear in MULTIPLE creatives with DIFFERENT combinations of other variables.**

This enables isolation of individual variable effects rather than testing complete creative assets in isolation.

---

## **Matrix Architecture**

### **Basic Structure**

```
4x4 Grid = 16 Creatives Total

           C1          C2          C3          C4
           (Concept 1) (Concept 2) (Concept 3) (Concept 4)

Row A      C1A         C2A         C3A         C4A
Row B      C1B         C2B         C3B         C4B
Row C      C1C         C2C         C3C         C4C
Row D      C1D         C2D         C3D         C4D
```

### **Two Primary Dimensions**

* CONCEPTS (Columns C1-C4): Represent distinct audience segments or avatars

* IMPORTANT CLARIFICATION:
  In MST mode, "concept" refers to AVATAR/ICP, not narrative structure.
  This is a contextual override of the global IAP definition.

* Global IAP: Concept = Narrative structure (CN_Testimonial, CN_ProductDemo)
* MST Mode: Concept = Avatar identifier (C1 = Busy Parents, C2 = Women 40+)

* Why the difference?
  - MST tests across AUDIENCES (columns = avatars)
  - Within each avatar, we test narrative STRUCTURES (CN_ codes)
  - This allows us to answer: "Does Busy Parents respond better to
    testimonials vs demos?" (cross-avatar, same structure)

* Example Matrix:
    - C1 = Busy Parents (avatar concept)
    - C1A uses CN_Testimonial (structural concept)
    - C1B uses CN_ProductDemo (structural concept)
    - C2 = Women 40+ (avatar concept)
    - C2A uses CN_Testimonial (structural concept)
    - C2B uses CN_ProductDemo (structural concept)

* The matrix structure tests:
  - Horizontal (rows): Same narrative across different avatars
  - Vertical (columns): Different narratives for same avatar
  - Both insights are valuable

* Global CN_ codes are NOT replaced by MST - they are distributed
  within the matrix alongside avatar identifiers.

**Concept Variables (CN_):**

* Avatar/ICP definition
* Visual design system
* CTA type and approach
* Pain point category
* Creative format/style

#### **ANGLES (Rows A-D)**

* Represent different **communication approaches**
* Each row = different messaging structure
* Enables tracking variables across concepts

**Angle Variables (FW_, TN_, HK_, ST_, PR_, HP_, AW_):**

* Framework (PAS, AIDA, BAB, StoryBrand)
* Tonality (Emotional, Rational, Relatable, Assertive, Aspirational)
* Hook Type (Problem, Story, Benefit, Curiosity, Social Proof)
* Funnel Stage (TOFU, MOFU, BOFU)
* Proof Type (UGC, Testimonial, Expert, Data, Visual Demo, Social Proof)
* Pain Point (Overwhelm, Time, Confidence, Loneliness, Money)
* Awareness Level (Unaware, Problem-Aware, Solution-Aware, Most-Aware)

**What Concepts Are:**

* **IMPORTANT:** Concepts must represent structural narrative formats, not messaging approaches or hooks.
* **CORRECT:** CN_Testimonial, CN_ProductDemo, CN_Comparison (structural formats)
* **INCORRECT**: CN_PainFirst (this is a hook type, **not** a structure)
* For pain-first approaches, use:
  - Structural concept (CN_Testimonial, etc.) for the column
  - HK_Problem angle variable within the stack

---

## **Variable Consistency Layers**

### **Layer 1: Column Consistency (Concept Constants)**

**Rule**: ALL creatives in the same column share ALL concept variables

```json
{
  "column_c1": {
    "all_variants": ["C1A", "C1B", "C1C", "C1D"],
    "shared_variables": [
      "CN_ICP_BusyParents",
      "CN_Design_UGC",
      "CN_CTA_StartFree",
      "HP_Overwhelm"
    ],
    "varies": "Angle variables change per row"
  }
}
```

**Purpose**: Isolate which angle variables work best for THIS specific avatar

---

### **Layer 2: Row Consistency (One Shared Angle Variable)**

**Rule**: ALL creatives in the same row share EXACTLY ONE angle variable

```json
{
  "row_a_green": {
    "all_variants": ["C1A", "C2A", "C3A", "C4A"],
    "shared_variable": "ST_TOFU",
    "varies": [
      "Concept variables (4 different avatars)",
      "Other angle variables (frameworks, tones, hooks)"
    ]
  }
}
```

**Purpose**: Test if THIS specific variable works across different avatars

**CRITICAL**: Not all angle variables, just ONE per row

---

### **Layer 3: Diagonal ↘ Consistency (One Strategic Variable)**

**Rule**: The four creatives on diagonal ↘ share EXACTLY ONE strategic variable

```json
{
  "diagonal_main": {
    "creatives": ["C1A", "C2B", "C3C", "C4D"],
    "shared_variable": "FW_PAS",
    "crosses": [
      "4 different concepts (avatars)",
      "4 different rows",
      "Maximum diversity for isolation"
    ]
  }
}
```

**Purpose**: Test one variable across maximum diversity of contexts

---

### **Layer 4: Diagonal ↙ Consistency (One Counterbalance Variable)**

**Rule**: The four creatives on diagonal ↙ share EXACTLY ONE counterbalance variable

```json
{
  "diagonal_counter": {
    "creatives": ["C4A", "C3B", "C2C", "C1D"],
    "shared_variable": "PR_Testimonial",
    "purpose": "Test proof types or narrative devices independently"
  }
}
```

---

### **Layer 5 & 6: Visual Formatting System**

**Font Size = Diagonal Indicators**:

* **Large Font** = Diagonal ↘ (C1A, C2B, C3C, C4D)
* **Small Font** = Diagonal ↙ (C4A, C3B, C2C, C1D)
* **Regular Font** = No diagonal pattern

**Text Formatting = Column Indicators**:

* **Bold** = Column C1 (all C1 creatives)
* **Underline** = Column C2 (all C2 creatives)
* **Italics** = Column C3 (all C3 creatives)
* **Regular** = Column C4 (all C4 creatives)

**Color = Row Indicators**:

* **Green** = Row A
* **Blue** = Row B
* **Yellow** = Row C
* **White** = Row D

---

## **Variable Distribution Strategy**

### **The Distribution Principle**

**Each important variable should appear 2-4+ times across the matrix in different combinations**

### **Good vs Bad Distribution**

#### **❌ BAD: No Isolation Possible**

```
FW_PAS only in: C1A, C2A, C3A, C4A (all Row A)
- All these also share: TN_Rational, HK_Problem, ST_TOFU, PR_Data
- Result: Can't tell if PAS specifically drives performance
```

#### **✅ GOOD: Variable Isolation Enabled**

```
FW_PAS appears in:
- C1A (with TN_Emotional, HK_Problem, ST_TOFU, PR_UGC)
- C2C (with TN_Rational, HK_Benefit, ST_MOFU, PR_Visual)
- C3B (with TN_Relatable, HK_Story, ST_MOFU, PR_Testimonial)
- C4D (with TN_Aspirational, HK_Social, ST_BOFU, PR_Expert)

Result: Can isolate PAS performance across:
- 4 different avatars
- 4 different tonalities
- 4 different hook types
- 3 different funnel stages
- 4 different proof types
```

### **Distribution Patterns**

**Pattern 1: Row Distribution**

```
All Green Row: Share ST_TOFU
- C1A: ST_TOFU + different framework/tone/hook
- C2A: ST_TOFU + different framework/tone/hook
- C3A: ST_TOFU + different framework/tone/hook
- C4A: ST_TOFU + different framework/tone/hook

Tests: Does TOFU work across 4 avatars with different approaches?
```

**Pattern 2: Diagonal Distribution**

```
Diagonal ↘: Share FW_PAS
- C1A: FW_PAS + TN_Emotional + ST_TOFU
- C2B: FW_PAS + TN_Rational + ST_MOFU
- C3C: FW_PAS + TN_Relatable + ST_MOFU
- C4D: FW_PAS + TN_Aspirational + ST_BOFU

Tests: Does PAS work across maximum diversity?
```

**Pattern 3: Scattered Distribution**

```
TN_Emotional appears in:
- C1A (Green Row, Diagonal ↘, TOFU, PAS)
- C1B (Blue Row, MOFU, AIDA)
- C2B (Blue Row, Diagonal ↘, MOFU, PAS)
- C3B (Blue Row, Diagonal ↙, MOFU, BAB)
- C4B (Blue Row, MOFU, StoryBrand)

Tests: Does Emotional tone work universally?
```

---

## **MST Audit Framework**

### **Five Core Validation Questions**

#### **1. Column Consistency**

✅ Do all creatives in each column share ALL concept variables?

**Check**:

* All C1: Same avatar, design, CTA, pain point?
* All C2: Same avatar, design, CTA, pain point?
* All C3: Same avatar, design, CTA, pain point?
* All C4: Same avatar, design, CTA, pain point?

**If NO**: Concept variables not properly controlled

---

#### **2. Row Patterns**

✅ Does each row share EXACTLY ONE angle variable across all its creatives?

**Check**:

* Row A: Do C1A, C2A, C3A, C4A share ONE variable?
* Row B: Do C1B, C2B, C3B, C4B share ONE different variable?
* Row C: Do C1C, C2C, C3C, C4C share ONE different variable?
* Row D: Do C1D, C2D, C3D, C4D share ONE different variable?

**If NO**: Cannot track variable performance across avatars

---

#### **3. Diagonal Patterns**

✅ Do the diagonals share EXACTLY ONE variable?

**Check**:

* Diagonal ↘: Do C1A, C2B, C3C, C4D share ONE variable?
* Diagonal ↙: Do C4A, C3B, C2C, C1D share ONE variable?

**If NO**: Missing advanced pattern testing

---

#### **4. Variable Distribution**

✅ Do key variables appear 2-4+ times in different combinations?

**Angle Variable Structure**

**Each** creative in the MST matrix receives:
- **4 REQUIRED** variables: CN_, FW_, TN_, HK_
- **0-2 OPTIONAL** variables: ST_, AW_, HP_, PR_, CTA_

This ensures:
- **Consistent** baseline (4 required)
- **Flexibility** for test hypotheses (0-2 optional)
- **Manageable** complexity (6 maximum)

**Matrix Implications:**
- All 16 creatives share the 4 required variable types
- Optional variables are distributed strategically
- Variable isolation maintained through matrix structure
- Typically 5-6 total variables per creative in MST mode

**Check**:

* Framework variables distributed?
* Tonality variables distributed?
* Hook type variables distributed?
* Proof type variables distributed?

**If NO**: Cannot isolate individual variable performance

---

#### **5. Pattern Recognition Capability**

✅ Can we identify which variables drive performance from this structure?

**Check**:

* Can isolate avatar preferences?
* Can isolate universal variables?
* Can isolate variable combinations?
* Can track proof type effectiveness?

**If NO**: Structure needs revision

---

## **Common Anti-Patterns**

### **Anti-Pattern 1: Theme-Based Concepts**

❌ **Wrong**: C1 = "Emotional Reset Theme", C2 = "Authority Theme" ✅ **Correct**: C1 = "Busy Parents 35-45", C2 = "Women 40+ in Transition"

**Why**: Themes are messaging approaches (angle variables), not avatars

---

### **Anti-Pattern 2: Complete Row Uniformity**

❌ **Wrong**: All Row A share ALL variables (FW_PAS + TN_Rational + HK_Problem + ST_TOFU) ✅ **Correct**: All Row A share ONE variable (e.g., ST_TOFU only)

**Why**: Can't isolate which specific variable drives performance

---

### **Anti-Pattern 3: No Variable Distribution**

❌ **Wrong**: Each variable appears only once (FW_PAS only in C1A) ✅ **Correct**: Each variable appears 2-4+ times in different combinations

**Why**: Can't identify if variables work in different contexts

---

### **Anti-Pattern 4: Missing Diagonal Patterns**

❌ **Wrong**: No defined diagonal consistency ✅ **Correct**: Both diagonals defined with specific shared variables

**Why**: Missing advanced testing layer

---

## **Analysis Methodology**

### **Step 1: Variable Tagging**

Tag each creative with complete variable stack:

```
C1A = CN_ICP_BusyParents + CN_Design_UGC + CN_CTA_StartFree +
      FW_PAS + TN_Emotional + HK_Problem + ST_TOFU + PR_UGC + HP_Overwhelm
```

### **Step 2: Performance Data Collection**

Gather metrics for all 16 creatives:

* CTR (Click-Through Rate)
* CVR (Conversion Rate)
* CPA (Cost Per Acquisition)
* ROAS (Return on Ad Spend)
* Engagement metrics

### **Step 3: Variable Aggregation**

```
All creatives with FW_PAS:
- C1A: CTR 3.2%, CVR 1.8%, CPA $45
- C2C: CTR 2.9%, CVR 1.6%, CPA $52
- C3B: CTR 3.5%, CVR 2.1%, CPA $38
- C4D: CTR 3.1%, CVR 1.7%, CPA $47

Average for FW_PAS: CTR 3.2%, CVR 1.8%, CPA $45.50
```

### **Step 4: Variable Comparison**

```
FW_PAS avg: CTR 3.2%, CVR 1.8%
FW_AIDA avg: CTR 2.1%, CVR 1.2%
FW_BAB avg: CTR 2.8%, CVR 1.5%

Conclusion: PAS framework outperforms others
```

### **Step 5: Pattern Identification**

**Universal Winners**:

* Variables that perform well regardless of context
* Example: "TN_Emotional performed well in 7 of 8 appearances"

**Avatar-Specific Winners**:

* Variables that work for specific avatars only
* Example: "FW_PAS works for C1/C2 but not C3/C4"

**Combination Winners**:

* Variable combinations that create synergy
* Example: "FW_PAS + TN_Emotional outperforms FW_PAS + TN_Rational"

### **Step 6: Strategic Insights**

```
Keep:
- FW_PAS (universal winner)
- TN_Emotional (universal winner)

Test Further:
- Does FW_PAS + TN_Rational work with different hooks?
- Does TN_Emotional work with FW_AIDA?

Retire:
- FW_FAB (underperformed across all appearances)
- TN_Playful (only worked for one avatar)
```

---

## **Analysis Frameworks**

### **Framework 1: Column Analysis**

**Question**: Which angle variables work best for each avatar?

```
For C1 (Busy Parents):
- Best Framework: FW_PAS
- Best Tonality: TN_Emotional
- Best Hook: HK_Problem
- Best Proof: PR_UGC

Insight: This avatar responds to emotional problem-first messaging
```

### **Framework 2: Row Analysis**

**Question**: Which angle variables work across all avatars?

```
Green Row (all share ST_TOFU):
- C1A: Strong performance
- C2A: Strong performance
- C3A: Moderate performance
- C4A: Weak performance

Insight: TOFU works well for C1/C2, less for C3/C4
        TOFU may be avatar-dependent
```

### **Framework 3: Variable Isolation**

**Question**: Does this specific variable consistently perform?

```
TN_Emotional appears in 4 creatives:
Average: 3.2% CTR, 1.8% CVR

TN_Rational appears in 4 creatives:
Average: 2.1% CTR, 1.1% CVR

Insight: Emotional tone is universal winner
        Rational tone underperforms
```

### **Framework 4: Combination Discovery**

**Question**: Which variable combinations create synergy?

```
FW_PAS + TN_Emotional: 3.35% CTR, 1.9% CVR
FW_PAS + TN_Rational: 2.2% CTR, 1.15% CVR

Insight: PAS + Emotional is winning combination
        Test more variations next sprint
```

---

## **Implementation Checklist**

### **Pre-Implementation**

* [ ] Define 4 distinct avatars (not themes)
* [ ] Identify avatar-specific pain points and desires
* [ ] Choose 3-4 framework options to test
* [ ] Choose 3-4 tonality options to test
* [ ] Choose 3-4 hook types to test
* [ ] Choose 3-4 proof types to test

### **Matrix Structure**

* [ ] C1-C4: Define all concept variables per column
* [ ] Row A-D: Choose ONE angle variable each row shares
* [ ] Diagonal ↘: Choose ONE strategic variable
* [ ] Diagonal ↙: Choose ONE counterbalance variable
* [ ] Map variable distribution (each key variable 2-4+ times)

### **Creative Development**

* [ ] Tag each creative with complete variable stack
* [ ] Ensure column consistency (all concept variables shared)
* [ ] Ensure row consistency (one angle variable shared)
* [ ] Ensure diagonal consistency (one variable shared per diagonal)
* [ ] Verify variable distribution across matrix

### **Quality Assurance**

* [ ] Audit all consistency layers
* [ ] Verify variable distribution
* [ ] Check naming convention compliance
* [ ] Validate creative uniqueness

### **Launch**

* [ ] Campaign setup with proper naming
* [ ] Tracking implementation
* [ ] Performance dashboard setup
* [ ] Documentation complete

---

## **Integration with IAP Ecosystem**

**Feeds Into**:

* MST_CREATIVE_SCAN() for validation
* MST_TEST_ENGINE() for performance analysis
* IAP_ANALYSIS_CORE() for insight extraction

**Consumes From**:

* VARIABLES_REGISTRY for code definitions
* IAP_STRATEGY_MAP() for strategic direction
* IAP_BRIEF_BUILDER() for creative specifications

---

## **Key Principles Summary**

1. **Variable Isolation Requires Distribution**: Test each variable in multiple contexts
2. **Columns Are Sacred**: Concept variables must remain constant within columns
3. **Rows Share ONE Variable**: Not all variables, just one per row
4. **Diagonals Test Extremes**: Maximum diversity for maximum insight
5. **Visual Formatting Matters**: Functional indicators, not decoration
6. **Analyze Variables, Not Assets**: Compare variable performance, not creatives
7. **Distribution Enables Learning**: 2-4+ appearances per variable minimum

---

This reference document defines the scientific testing framework that transforms creative production into a controlled experimental system where every asset becomes a learning node and every performance metric refines future strategy.

# Intake Routing Gap Analysis

This document identifies missing components, integration points, assumptions, and edge cases for the Enhanced Intake Flow Routing System.

## Missing Components

### Questionnaires (All Created ?)
- ? `intake-routing-questionnaire.json` - Routing questionnaire with visit type, treatment, payment questions
- ? `workers-comp-intake-questionnaire.json` - Workers' compensation intake form
- ? `quick-follow-up-cash-questionnaire.json` - Cash-paying follow-up form
- ? `quick-follow-up-insured-questionnaire.json` - Insurance follow-up form
- ? `quick-follow-up-pi-questionnaire.json` - Personal injury follow-up form
- ? `pain-management-intake-questionnaire.json` - Pain management intake form
- ? `non-pi-chiro-intake-questionnaire.json` - Non-PI chiropractic intake form
- ? `personal-injury-intake-questionnaire.json` - Personal injury intake form

### Backend Functions (All Created ?)
- ? Patient status detection functions (`patientStatusDetection.ts`)
- ? Routing decision engine (`routingEngine.ts`)
- ? Intake routing Zambda endpoint (`intake-routing/index.ts`)

### Pending Components
- ? LOP Tracking Dashboard (`packages/zambdas/src/ehr/lop-tracking/index.ts`)
- ? CMS-1500 Form Generation (`packages/zambdas/src/ehr/generate-cms1500/index.ts`)
- ? Exam Guide Templates (`docs/provider_guides/`)
- ? Medical Form Extraction Scripts (`scripts/extract_*.py`)
- ? PatientRecord Schema Updates (`canonical_schema/entities/PatientRecord.json`)
- ? WorkersCompContext Entity (`canonical_schema/entities/WorkersCompContext.json`)
- ? LOPDetails Entity (`canonical_schema/entities/LOPDetails.json`)

### UI Components
- ? Intake Routing UI Page (`apps/intake/src/pages/IntakeRouting.tsx`)

## Integration Points

### Clinical Note Generator
- **Status**: Not yet integrated
- **Status**: Planned
- **Requirements**:
  - Exam guides must map to `StructuredNoteV1.examination` fields
  - Use same canonical paths as clinical note generator
  - Ensure FHIR Observation compatibility

### Billing System
- **Status**: Partially defined
- **Requirements**:
  - LOP tracking dashboard for billers/admins
  - CMS-1500 form generation for PI/WC cases
  - Superbill generation for attorney billing
  - Integration with existing billing workflows

### Questionnaire Response Processing
- **Status**: Existing system (`sub-intake-harvest`)
- **Integration**: New questionnaires will be processed by existing subscription handler
- **Requirements**: Ensure canonical path mappings are correctly processed

## Assumptions

### Patient-Facing Language
- **Assumption**: Patients understand the LOP option when presented as "I was referred by my attorney"
- **Risk**: Some patients may not recognize this applies to them
- **Mitigation**: Front desk staff should clarify payment method if unclear

### Workers' Compensation Claim Numbers
- **Assumption**: Claim numbers may not always be available at first visit
- **Implementation**: Claim number field is optional in WC intake questionnaire
- **Mitigation**: System allows updates to claim information later

### Previous Symptoms Data Availability
- **Assumption**: Previous QuestionnaireResponse data is structured consistently
- **Risk**: Different questionnaire formats may require different extraction logic
- **Mitigation**: `getPreviousSymptoms` function includes fallback logic for varying formats

### Payment Method Detection
- **Assumption**: Payment method can be reliably detected from Coverage resources and Patient extensions
- **Risk**: New payment types or edge cases may not be detected
- **Mitigation**: Defaults to 'unknown' and allows manual override in routing questionnaire

### FHIR Questionnaire Extensions
- **Assumption**: Extensions for `payment-method-code`, `requires-lop-tracking`, `requires-cms1500` are properly supported
- **Risk**: Extensions may need to be registered in FHIR server
- **Mitigation**: Use standard extension URLs from Zapehr structure definitions

## Edge Cases

### Case 1: Patient Switches from Cash to LOP Mid-Treatment
- **Scenario**: Patient starts as cash-pay, then provides LOP during follow-up
- **Handling**: Payment method change question in follow-up questionnaires captures this
- **Action Required**: Update Patient extension `legal-representation-lop` and trigger LOP tracking

### Case 2: Patient Has Multiple Active Cases
- **Scenario**: Patient has both PI and WC cases
- **Handling**: Routing prioritizes Workers' Comp (scenario 1), then PI history (scenario 8)
- **Action Required**: May need additional logic to handle simultaneous case types

### Case 3: Patient Returns After 90+ Days
- **Scenario**: Previous symptoms query window is 90 days
- **Handling**: If no recent QuestionnaireResponse, previous symptoms display is empty
- **Action Required**: Consider extending window or providing alternative data source

### Case 4: New Patient Claims PI/WC History
- **Scenario**: Routing questionnaire shows "General Health & Wellness" but patient later reveals PI/WC history
- **Handling**: `non-pi-chiro-intake-questionnaire.json` includes PI check question
- **Action Required**: Re-route or flag for review if PI/WC detected after initial routing

### Case 5: Payment Method Not Detectable
- **Scenario**: Patient has no Coverage resources and no payment method extension
- **Handling**: Defaults to 'unknown', routing uses payment method from questionnaire answers
- **Action Required**: System should prompt for payment method clarification

### Case 6: Missing Questionnaire Resources
- **Scenario**: Questionnaire URL exists in routing but resource not found in FHIR server
- **Handling**: Routing endpoint warns but continues; questionnaire must be uploaded separately
- **Action Required**: Ensure all questionnaires are deployed to FHIR server before enabling routing

### Case 7: Patient Switches Treatment Type
- **Scenario**: Patient originally seen for Chiropractic, now requests Pain Management
- **Handling**: Routing questionnaire asks for treatment type, routes appropriately
- **Action Required**: May want to track treatment history for better routing

## Data Validation Requirements

### Required Fields
- Visit Type: Required in routing questionnaire
- Treatment Type: Required when Visit Type = "General Health & Wellness"
- Payment Method: Required in routing questionnaire

### Optional Fields
- Patient ID: Optional (system can route new patients)
- Claim Number: Optional in WC intake
- Authorization Number: Optional in insured follow-up

## Testing Considerations

### Unit Tests Needed
- Patient status detection functions (all scenarios)
- Routing engine logic (all 8 scenarios)
- Previous symptoms extraction (various QuestionnaireResponse formats)
- Payment method detection (various Coverage configurations)

### Integration Tests
- End-to-end routing flow
- Questionnaire response processing
- LOP tracking updates
- CMS-1500 generation triggers

### Edge Case Tests
- All edge cases listed above
- Concurrent patient status queries
- Missing or malformed FHIR resources
- Network/timeout scenarios

## Future Enhancements

1. **Machine Learning**: Use historical data to improve routing accuracy
2. **Telemedicine Integration**: Extend routing to support virtual visits
3. **Multi-language Support**: Translate questionnaires for diverse patient populations
4. **Real-time Validation**: Validate answers as patient completes routing questionnaire
5. **Analytics Dashboard**: Track routing paths and outcomes for optimization
